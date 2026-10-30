// Minimal static server for the built site (`dist/`). Railway injects PORT.
import { join, normalize } from "node:path";

const root = join(import.meta.dir, "..", "dist");

const headers = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
};

async function find(pathname: string): Promise<Bun.BunFile | undefined> {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidates = clean.endsWith("/") ? [`${clean}index.html`] : [clean, `${clean}/index.html`];
  for (const candidate of candidates) {
    const file = Bun.file(join(root, candidate));
    if (file.name?.startsWith(root) && (await file.exists())) return file;
  }
  return undefined;
}

// The option catalogs are over a megabyte of JSON: compress text once and keep it in memory.
const compressible = /^(text\/|application\/(json|javascript)|image\/svg)/;
const gzipped = new Map<string, Uint8Array<ArrayBuffer>>();

async function body(file: Bun.BunFile, gzip: boolean): Promise<BodyInit> {
  if (!gzip || !compressible.test(file.type)) return file;
  const key = file.name as string;
  let packed = gzipped.get(key);
  if (!packed) {
    packed = Uint8Array.from(Bun.gzipSync(await file.bytes()));
    gzipped.set(key, packed);
  }
  return packed;
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(request) {
    const file = await find(new URL(request.url).pathname);
    if (!file) return new Response("Not found", { status: 404, headers });
    const immutable = file.name?.includes("/_astro/");
    const gzip = (request.headers.get("accept-encoding") ?? "").includes("gzip");
    const packed = gzip && compressible.test(file.type);
    return new Response(await body(file, gzip), {
      headers: {
        ...headers,
        "content-type": file.type,
        vary: "accept-encoding",
        ...(packed && { "content-encoding": "gzip" }),
        "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=300",
      },
    });
  },
});

console.log(`nixchecker listening on :${server.port}`);
