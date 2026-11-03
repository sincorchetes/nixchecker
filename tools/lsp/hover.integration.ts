// The hover with the manuals' words, against the real bundle (needs Nix: the first run builds it).
// `devenv shell -- integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { type Message, readMessages } from "./rpc";

const proc = Bun.spawn(["bun", join(import.meta.dir, "server.ts")], {
  stdin: "pipe",
  stdout: "pipe",
  stderr: "ignore",
});
const incoming = readMessages(proc.stdout)[Symbol.asyncIterator]();
const write = (message: Record<string, unknown>) => {
  const body = JSON.stringify({ jsonrpc: "2.0", ...message });
  proc.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  proc.stdin.flush();
};
const next = async () => (await incoming.next()).value as Message & Record<string, unknown>;

const URI = "file:///hover.nix";
const TEXT = "{ services.openssh.enable = true; }";
let id = 100;

async function hover(): Promise<string> {
  write({
    id: ++id,
    method: "textDocument/hover",
    params: { textDocument: { uri: URI }, position: { line: 0, character: 22 } },
  });
  const reply = (await next()) as unknown as { result: { contents: { value: string } } };
  return reply.result.contents.value;
}

beforeAll(async () => {
  write({ id: 1, method: "initialize", params: { initializationOptions: { target: "nixos" } } });
  await next();
  write({ method: "textDocument/didOpen", params: { textDocument: { uri: URI, text: TEXT } } });
  await next();
});

afterAll(() => proc.kill());

describe("hover with the descriptions of the manuals", () => {
  test("answers at once, and then adds the description and the default", async () => {
    // At once, with what the catalog knows.
    expect(await hover()).toContain("Type: `bool`");

    // The manuals are read in the background: the answer gets the description when they are there.
    let shown = "";
    for (let tries = 0; tries < 600 && !shown.includes("Default:"); tries++) {
      await Bun.sleep(1000);
      shown = await hover();
    }
    expect(shown).toContain("OpenSSH");
    expect(shown).toContain("Default: `false`");
  }, 900_000);
});
