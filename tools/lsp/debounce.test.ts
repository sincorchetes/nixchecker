// Typing sends a change per keystroke: the server analyzes the text once the typing pauses, not each time.
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { type Message, readMessages } from "./rpc";

const proc = Bun.spawn(["bun", join(import.meta.dir, "server.ts")], {
  stdin: "pipe",
  stdout: "pipe",
  stderr: "ignore",
});
afterAll(() => proc.kill());

// Everything the server says, collected as it comes: a message must not be lost between two waits.
const received: Array<Message & Record<string, unknown> & { at: number }> = [];
void (async () => {
  for await (const message of readMessages(proc.stdout))
    received.push({ ...message, at: Date.now() });
})();

const write = (message: Record<string, unknown>) => {
  const body = JSON.stringify({ jsonrpc: "2.0", ...message });
  proc.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  proc.stdin.flush();
};
const change = (text: string) =>
  write({
    method: "textDocument/didChange",
    params: { textDocument: { uri: "file:///a.nix" }, contentChanges: [{ text }] },
  });
const diagnosticsOf = (message: unknown) =>
  (message as { params: { diagnostics: Array<{ code: string }> } }).params.diagnostics;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const publications = (from: number) =>
  received.slice(from).filter((m) => m.method === "textDocument/publishDiagnostics");

async function until(done: () => boolean) {
  for (let waited = 0; !done() && waited < 15_000; waited += 25) await sleep(25);
}

describe("language server pacing", () => {
  test("a burst of changes is analyzed once, for the last text", async () => {
    write({ id: 1, method: "initialize", params: { initializationOptions: { target: "nixos" } } });
    await until(() => received.length > 0);
    write({
      method: "textDocument/didOpen",
      params: { textDocument: { uri: "file:///a.nix", text: "{ }" } },
    });
    await until(() => publications(0).length > 0);

    // Five keystrokes in quick succession, the last of which is a typo: one publication, about that text.
    const from = received.length;
    const sent = Date.now();
    for (const text of [
      "{ a",
      "{ a.b",
      "{ a.b =",
      "{ a.b = 1; }",
      "{ services.openssh.enabel = true; }",
    ]) {
      change(text);
    }
    await until(() => publications(from).length > 0);
    await sleep(1000);
    const published = publications(from);
    expect(published.length).toBe(1);
    // Nothing is analyzed before the typing pauses (150 ms): without the wait, the first change would be
    // analyzed at once, and what it found would arrive in a few milliseconds.
    expect((published[0]?.at ?? 0) - sent).toBeGreaterThanOrEqual(140);
    const found = diagnosticsOf(published[0]);
    expect(found.map((d) => d.code)).toEqual(["unknown-option"]);
  });

  test("a document closed while it waited is not published after", async () => {
    const from = received.length;
    change("{ services.openssh.enabel = false; }");
    write({ method: "textDocument/didClose", params: { textDocument: { uri: "file:///a.nix" } } });
    await sleep(1000);
    // Only the clearing that closing sends: nothing about the text that was waiting.
    const published = publications(from);
    expect(published.length).toBe(1);
    expect(diagnosticsOf(published[0])).toEqual([]);
  });

  test("a change that arrives while the text before it is analyzed makes that analysis void", async () => {
    write({
      method: "textDocument/didOpen",
      params: { textDocument: { uri: "file:///a.nix", text: "{ }" } },
    });
    await sleep(1000);
    const from = received.length;
    // A text big enough that analyzing it is still going on when the next change arrives.
    const lines = Array.from({ length: 30_000 }, (_, i) => `  environment.variables.V${i} = "x";`);
    change(`{\n${lines.join("\n")}\n  services.openssh.enabel = true;\n}`);
    await sleep(170);
    change("{ services.openssh.enable = true; }");
    await until(() => publications(from).length > 0);
    await sleep(1500);
    // Only the text now in the editor is published; the earlier one found a typo that is no longer there.
    const published = publications(from);
    expect(published.length).toBe(1);
    expect(diagnosticsOf(published[0])).toEqual([]);
  }, 30_000);
});
