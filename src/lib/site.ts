/** Prefixes a site-relative path with the deploy base (e.g. "/" or "/repo/"). */
export function withBase(base: string, path = ""): string {
  const root = base.endsWith("/") ? base : `${base}/`;
  return root + path.replace(/^\//, "");
}
