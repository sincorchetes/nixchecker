import type { Analysis, Diagnostic } from "../analysis";
import type { Assignment, ValueKind } from "../nix/scan";

// nix.conf as Nix reads it: a `#` starts a comment, a line is words separated by blanks, and a setting is
// `name = value ...` (the `=` is a word of its own). `include` and `!include` take one file name.
const INCLUDE = new Set(["include", "!include"]);

// Words a boolean setting reads as a boolean without being `true` or `false`, and the ones with a unit
// (`128M`, `50%`): only the setting knows what they mean, so they are left unjudged.
const AMBIGUOUS = /^(yes|no|[01]|\d+[KMGT]%?|\d+%)$/i;

/** The kind of a value of one word: the one a setting of that type takes. */
function kindOf(word: string): ValueKind {
  if (word === "true" || word === "false") return "bool";
  if (AMBIGUOUS.test(word)) return "other";
  return /^\d+$/.test(word) ? "int" : "str";
}

function words(line: string): Array<{ text: string; col: number }> {
  return [...line.matchAll(/\S+/g)].map((m) => ({ text: m[0], col: (m.index ?? 0) + 1 }));
}

function setting(name: string, rest: string[], line: number, col: number): Assignment {
  if (rest.length === 0) return { path: [name], line, col, kind: "str", value: "" };
  if (rest.length === 1) {
    const kind = kindOf(rest[0] as string);
    return { path: [name], line, col, kind, ...(kind === "str" && { value: rest[0] as string }) };
  }
  return {
    path: [name],
    line,
    col,
    kind: "list",
    items: rest.map(() => "str"),
    itemValues: rest,
  };
}

/** What can be learned from a nix.conf before its catalog is loaded: a line that is not a setting is a syntax error. */
export function parseConf(source: string): Analysis {
  const syntax: Diagnostic[] = [];
  const assignments: Assignment[] = [];
  source.split("\n").forEach((raw, n) => {
    const found = words(raw.split("#")[0] as string);
    const first = found[0];
    if (!first) return;
    const line = n + 1;
    const rest = found.slice(1).map((w) => w.text);
    if (INCLUDE.has(first.text)) {
      if (rest.length === 1) return;
    } else if (found[1]?.text === "=") {
      assignments.push(setting(first.text, rest.slice(1), line, first.col));
      return;
    }
    syntax.push({
      severity: "error",
      code: "conf-bad-line",
      line,
      col: first.col,
      params: { text: raw.trim() },
    });
  });
  return { syntax, assignments, declared: [] };
}

/**
 * Whether a text is a nix.conf rather than Nix: every line is a comment, an include or `name = words`, and
 * none ends in `;` or opens a set, as a line of Nix does.
 */
export function looksLikeConf(source: string): boolean {
  const lines = source
    .split("\n")
    .map((l) => (l.split("#")[0] as string).trim())
    .filter(Boolean);
  const isLine = (l: string) =>
    /^[A-Za-z][\w-]*\s+=(\s+[^;{}[\]()"]+)?$/.test(l) || /^!?include\s+\S+$/.test(l);
  return lines.length > 0 && lines.every(isLine) && lines.some((l) => !/^!?include/.test(l));
}
