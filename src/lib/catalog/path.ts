// Option paths are dotted, and a name between double quotes may hold dots itself
// (`boot.kernel.sysctl."net.core.rmem_max"`), so a path cannot be cut at every dot.
interface Part {
  /** As written, quotes included. */
  raw: string;
  /** The attribute name, without quotes. */
  name: string;
}

function parts(path: string): Part[] {
  const found: Part[] = [];
  let raw = "";
  let name = "";
  let quoted = false;
  for (let i = 0; i < path.length; i++) {
    const char = path[i] as string;
    if (char === "." && !quoted) {
      found.push({ raw, name });
      raw = "";
      name = "";
      continue;
    }
    raw += char;
    if (char === "\\" && quoted) {
      raw += path[i + 1] ?? "";
      name += path[++i] ?? "";
    } else if (char === '"') quoted = !quoted;
    else name += char;
  }
  found.push({ raw, name });
  return found;
}

/** The attribute names of a path: `a."b.c".d` is `a`, `b.c`, `d`. */
export const splitPath = (path: string): string[] => parts(path).map((part) => part.name);

/** Every path above this one, written as it is: `a."b.c".d` has `a` and `a."b.c"`. */
export function ancestors(path: string): string[] {
  const all = parts(path).map((part) => part.raw);
  return all.slice(0, -1).map((_, n) => all.slice(0, n + 1).join("."));
}
