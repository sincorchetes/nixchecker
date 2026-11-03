// JSON-RPC over stdio as the Language Server Protocol frames it: `Content-Length: N`, a blank line and N
// bytes of JSON.
export interface Message {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

const SEPARATOR = Buffer.from("\r\n\r\n");

/** The messages that arrive on `stream`, one by one. */
export async function* readMessages(stream: ReadableStream<Uint8Array>): AsyncGenerator<Message> {
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const end = buffer.indexOf(SEPARATOR);
      if (end < 0) break;
      const length = Number(
        /Content-Length:\s*(\d+)/i.exec(buffer.subarray(0, end).toString())?.[1],
      );
      const start = end + SEPARATOR.length;
      // A header without a length cannot be framed: drop it and look for the next one.
      if (!Number.isFinite(length)) {
        buffer = buffer.subarray(start);
        continue;
      }
      if (buffer.length < start + length) break;
      yield JSON.parse(buffer.subarray(start, start + length).toString()) as Message;
      buffer = buffer.subarray(start + length);
    }
  }
}

/** Sends one message to the editor. */
export function send(message: Record<string, unknown>): void {
  const body = JSON.stringify({ jsonrpc: "2.0", ...message });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}
