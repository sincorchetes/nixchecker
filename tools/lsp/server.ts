// A Language Server for Nix files: the static layer of the validator, as diagnostics while you type.
//   bun tools/lsp/server.ts     (talks LSP over stdin/stdout; `devenv shell -- lsp`)
// Options (initializationOptions): { "target": "nixos" | "home-manager" | "disko" | "flake", "release": "unstable" }.
import { DEFAULT_VERSION, VERSIONS, type Version } from "../../src/lib/catalog/versions";
import { applyFix, offsetOf } from "../../src/lib/fix";
import type { Diagnostic } from "../../src/lib/validate";
import { staticLayer } from "../local/static-layer";
import { candidates } from "./complete";
import { contextAt } from "./context";
import {
  editBetween,
  type LspDiagnostic,
  overlaps,
  position,
  type Range,
  toLsp,
} from "./diagnostics";
import { hoverAt } from "./hover";
import { type Message, readMessages, send } from "./rpc";

const texts = new Map<string, string>();
// What was last published for a document, to offer the fixes of its findings.
const published = new Map<string, { diagnostics: Diagnostic[]; shown: LspDiagnostic[] }>();
// Only the latest text of a document may be published: analyzing is asynchronous.
const latest = new Map<string, number>();
let options: { target?: string | undefined; release?: Version | undefined } = {};
let shuttingDown = false;

async function publish(uri: string): Promise<void> {
  const token = (latest.get(uri) ?? 0) + 1;
  latest.set(uri, token);
  const text = texts.get(uri) ?? "";
  let diagnostics: LspDiagnostic[] = [];
  let found: Diagnostic[] = [];
  try {
    const layer = await staticLayer(text, options.target, options.release ?? DEFAULT_VERSION);
    diagnostics = toLsp(text, layer.items);
    found = layer.diagnostics;
  } catch {
    // A catalog that cannot be read is no reason to flag the file.
  }
  if (latest.get(uri) !== token) return;
  published.set(uri, { diagnostics: found, shown: diagnostics });
  send({ method: "textDocument/publishDiagnostics", params: { uri, diagnostics } });
}

// The fixes for the findings under `range`: each is one edit that applies what the finding proposes.
function quickFixes(uri: string, range: Range) {
  const text = texts.get(uri) ?? "";
  const known = published.get(uri);
  return (known?.diagnostics ?? []).flatMap((d, n) => {
    const shown = known?.shown[n] as LspDiagnostic;
    const fixed = overlaps(shown.range, range) ? applyFix(text, d) : undefined;
    if (fixed === undefined) return [];
    return [
      {
        title: `Apply fix: ${d.suggestion ?? d.params.replacement}`,
        kind: "quickfix",
        diagnostics: [shown],
        edit: { changes: { [uri]: [editBetween(text, fixed)] } },
      },
    ];
  });
}

// What the catalog says about the option under the cursor, or nothing (null) when there is none.
async function hover(id: number | string, params: Message["params"]): Promise<void> {
  const text = texts.get(documentOf(params).uri) ?? "";
  const { line, character } = (params?.position ?? { line: 0, character: 0 }) as {
    line: number;
    character: number;
  };
  const found = await hoverAt(
    text,
    offsetOf(text, line + 1, character + 1),
    options.target,
    options.release ?? DEFAULT_VERSION,
  ).catch(() => undefined);
  const result = found && {
    contents: { kind: "markdown", value: found.value },
    range: { start: position(text, found.start), end: position(text, found.end) },
  };
  send({ id, result: result ?? null });
}

// The options the catalog has where the cursor is, if a name is being written there.
async function complete(id: number | string, params: Message["params"]): Promise<void> {
  const { uri } = documentOf(params);
  const text = texts.get(uri) ?? "";
  const { line, character } = (params?.position ?? { line: 0, character: 0 }) as {
    line: number;
    character: number;
  };
  const offset = offsetOf(text, line + 1, character + 1);
  const context = contextAt(text, offset);
  let items: unknown[] = [];
  if (context) {
    const names = await candidates(text, options.target, options.release ?? DEFAULT_VERSION, [
      ...context.enclosing,
      ...context.written,
    ]).catch(() => []);
    // The name being typed is what the client replaces, whatever it takes a word to be.
    const range = {
      start: position(text, offset - context.partial.length),
      end: position(text, offset),
    };
    items = names.map(({ name, detail, group }) => ({
      label: name,
      kind: group ? 9 : 10,
      ...(detail && { detail }),
      textEdit: { range, newText: name },
    }));
  }
  send({ id, result: { isIncomplete: false, items } });
}

type Document = { uri: string; text: string };
const documentOf = (params: Message["params"]) => (params?.textDocument ?? { uri: "" }) as Document;

function handle({ id, method, params }: Message): void {
  const reply = (result: unknown) => {
    if (id !== undefined) send({ id, result });
  };
  const cleared = (uri: string) =>
    send({ method: "textDocument/publishDiagnostics", params: { uri, diagnostics: [] } });
  // Leaving without a shutdown first is an error, by the protocol's own rule.
  if (method === "exit") process.exit(shuttingDown ? 0 : 1);
  switch (method) {
    case "initialize": {
      const given = (params?.initializationOptions ?? {}) as { target?: string; release?: string };
      options = { target: given.target, release: VERSIONS.find((v) => v === given.release) };
      reply({
        capabilities: {
          textDocumentSync: 1,
          codeActionProvider: { codeActionKinds: ["quickfix"] },
          completionProvider: { triggerCharacters: ["."] },
          hoverProvider: true,
        },
        serverInfo: { name: "nixchecker" },
      });
      break;
    }
    case "textDocument/didOpen": {
      const { uri, text } = documentOf(params);
      texts.set(uri, text);
      void publish(uri);
      break;
    }
    case "textDocument/didChange": {
      const { uri } = documentOf(params);
      const changes = params?.contentChanges as Array<{ text: string }>;
      texts.set(uri, changes[changes.length - 1]?.text ?? "");
      void publish(uri);
      break;
    }
    case "textDocument/didClose": {
      const { uri } = documentOf(params);
      texts.delete(uri);
      published.delete(uri);
      // Whatever is still being analyzed for it must not be published after this.
      latest.set(uri, (latest.get(uri) ?? 0) + 1);
      cleared(uri);
      break;
    }
    case "textDocument/hover":
      if (id !== undefined) void hover(id, params);
      break;
    case "textDocument/completion":
      if (id !== undefined) void complete(id, params);
      break;
    case "textDocument/codeAction":
      reply(quickFixes(documentOf(params).uri, params?.range as Range));
      break;
    case "shutdown":
      shuttingDown = true;
      reply(null);
      break;
    default:
      // A request must be answered; a notification we do not know is ignored.
      if (id !== undefined) {
        send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
      }
  }
}

for await (const message of readMessages(Bun.stdin.stream())) handle(message);
