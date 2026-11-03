// A Language Server for Nix files: the static layer of the validator, as diagnostics while you type.
//   bun tools/lsp/server.ts     (talks LSP over stdin/stdout; `devenv shell -- lsp`)
// Options (initializationOptions): { "target": "nixos" | "home-manager" | "disko" | "flake", "release": "unstable" }.
import { DEFAULT_VERSION, VERSIONS, type Version } from "../../src/lib/catalog/versions";
import { staticLayer } from "../local/static-layer";
import { toLsp } from "./diagnostics";
import { type Message, readMessages, send } from "./rpc";

const texts = new Map<string, string>();
// Only the latest text of a document may be published: analyzing is asynchronous.
const latest = new Map<string, number>();
let options: { target?: string | undefined; release?: Version | undefined } = {};
let shuttingDown = false;

async function publish(uri: string): Promise<void> {
  const token = (latest.get(uri) ?? 0) + 1;
  latest.set(uri, token);
  const text = texts.get(uri) ?? "";
  let diagnostics: ReturnType<typeof toLsp> = [];
  try {
    const { items } = await staticLayer(text, options.target, options.release ?? DEFAULT_VERSION);
    diagnostics = toLsp(text, items);
  } catch {
    // A catalog that cannot be read is no reason to flag the file.
  }
  if (latest.get(uri) === token)
    send({ method: "textDocument/publishDiagnostics", params: { uri, diagnostics } });
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
      reply({ capabilities: { textDocumentSync: 1 }, serverInfo: { name: "nixchecker" } });
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
      // Whatever is still being analyzed for it must not be published after this.
      latest.set(uri, (latest.get(uri) ?? 0) + 1);
      cleared(uri);
      break;
    }
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
