import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { type Message, readMessages } from "./rpc";

const server = join(import.meta.dir, "server.ts");
const proc = Bun.spawn(["bun", server], { stdin: "pipe", stdout: "pipe", stderr: "ignore" });
const incoming = readMessages(proc.stdout)[Symbol.asyncIterator]();

const write = (message: Record<string, unknown>) => {
  const body = JSON.stringify({ jsonrpc: "2.0", ...message });
  proc.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  proc.stdin.flush();
};
const next = async <T = Message & Record<string, unknown>>() => (await incoming.next()).value as T;
const open = (text: string) =>
  write({
    method: "textDocument/didOpen",
    params: { textDocument: { uri: "file:///a.nix", text } },
  });
const diagnostics = (message: Record<string, unknown>) =>
  (message.params as { diagnostics: Array<Record<string, unknown>> }).diagnostics;

beforeAll(async () => {
  write({ id: 1, method: "initialize", params: { initializationOptions: { target: "nixos" } } });
  await next();
});

afterAll(() => proc.kill());

describe("language server", () => {
  test("announces what it can do", async () => {
    write({ id: 2, method: "initialize", params: {} });
    expect(await next()).toMatchObject({
      id: 2,
      result: { capabilities: { textDocumentSync: 1 }, serverInfo: { name: "nixchecker" } },
    });
  });

  test("publishes the findings over the word they are about", async () => {
    open("{\n  networking.hostName = 5;\n  services.openssh.enabel = true;\n}\n");
    const found = diagnostics(await next());
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({
      severity: 1,
      source: "nixchecker",
      code: "type-mismatch",
      range: { start: { line: 1, character: 2 }, end: { line: 1, character: 21 } },
    });
    expect(found[1]).toMatchObject({ code: "unknown-option", range: { start: { line: 2 } } });
  });

  test("a change replaces the findings, and a clean text has none", async () => {
    write({
      method: "textDocument/didChange",
      params: {
        textDocument: { uri: "file:///a.nix" },
        contentChanges: [{ text: "{ services.openssh.enable = true; }" }],
      },
    });
    expect(diagnostics(await next())).toEqual([]);
  });

  test("closing a document clears what it showed", async () => {
    open("{ networking.hostName = 5; }");
    expect(diagnostics(await next())).toHaveLength(1);
    write({ method: "textDocument/didClose", params: { textDocument: { uri: "file:///a.nix" } } });
    expect(diagnostics(await next())).toEqual([]);
  });

  test("answers a request it does not know with an error, and ignores a notification", async () => {
    write({ method: "$/setTrace", params: {} });
    write({ id: 9, method: "textDocument/hover", params: {} });
    expect(await next()).toMatchObject({ id: 9, error: { code: -32601 } });
  });
});

describe("language server fixes", () => {
  const range = (character: number) => ({
    start: { line: 0, character },
    end: { line: 0, character },
  });
  const ask = (character: number) =>
    write({
      id: 20,
      method: "textDocument/codeAction",
      params: { textDocument: { uri: "file:///b.nix" }, range: range(character) },
    });

  test("a finding with a certain fix offers it as one small edit", async () => {
    write({
      method: "textDocument/didOpen",
      params: {
        textDocument: { uri: "file:///b.nix", text: "{ services.openssh.enabel = true; }" },
      },
    });
    await next();
    ask(10);
    const reply = await next<{ result: Array<Record<string, unknown>> }>();
    expect(reply.result).toHaveLength(1);
    expect(reply.result[0]).toMatchObject({
      kind: "quickfix",
      title: "Apply fix: services.openssh.enable",
      edit: {
        changes: {
          "file:///b.nix": [
            {
              // `enabel` and `enable` differ in the last two letters only: that is all the edit touches.
              range: { start: { line: 0, character: 23 }, end: { line: 0, character: 25 } },
              newText: "le",
            },
          ],
        },
      },
    });
  });

  test("nothing is offered away from the finding", async () => {
    ask(0);
    expect((await next<{ result: unknown[] }>()).result).toEqual([]);
  });
});

describe("language server shutdown", () => {
  test("shuts down and exits cleanly", async () => {
    write({ id: 10, method: "shutdown" });
    expect(await next()).toMatchObject({ id: 10, result: null });
    write({ method: "exit" });
    expect(await proc.exited).toBe(0);
  });
});
