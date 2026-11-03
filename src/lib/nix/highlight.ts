// Colors for the editor: a light scan of the text, apart from the parser, which must never fail on text
// that is half written. What it cannot tell it leaves plain.
export type Kind = "comment" | "string" | "number" | "keyword" | "path";

export interface Span {
  start: number;
  end: number;
  kind: Kind;
}

/** A stretch of text to underline, with how serious the finding is. */
export interface Mark {
  start: number;
  end: number;
  severity: "error" | "warning";
}

/** A piece of the text with the color and the underline it takes (none for plain text). */
export interface Segment {
  text: string;
  kind?: Kind;
  severity?: "error" | "warning";
}

const KEYWORDS = new Set([
  "let",
  "in",
  "if",
  "then",
  "else",
  "rec",
  "inherit",
  "with",
  "assert",
  "or",
  "import",
  "true",
  "false",
  "null",
]);
const NAME = /[A-Za-z_][A-Za-z0-9_'-]*/y;
const NUMBER = /[0-9]+(?:\.[0-9]+)?/y;
// `./x`, `../x`, `~/x`, `/x` (not the `//` operator) and `<nixpkgs>`.
const PATH = /(?:\.{1,2}|~)?\/[A-Za-z0-9._+-][A-Za-z0-9._+/-]*|<[A-Za-z0-9._+-][A-Za-z0-9._+/-]*>/y;

const match = (re: RegExp, src: string, at: number): number => {
  re.lastIndex = at;
  return re.exec(src) ? re.lastIndex : -1;
};

// The end of a `${ ... }`: its code may hold braces and strings of its own.
function interpolationEnd(src: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < src.length && depth > 0) {
    if (src[i] === '"') i = stringEnd(src, i + 1);
    else {
      if (src[i] === "{") depth++;
      if (src[i] === "}") depth--;
      i++;
    }
  }
  return i;
}

// The end of a "double quoted" string whose text starts at `from`.
function stringEnd(src: string, from: number): number {
  let i = from;
  while (i < src.length) {
    if (src[i] === "\\") i += 2;
    else if (src.startsWith("${", i)) i = interpolationEnd(src, i + 2);
    else if (src[i++] === '"') break;
  }
  return Math.min(i, src.length);
}

// The end of an ''indented string'' whose text starts at `from`: `'''`, `''$` and `''\` do not close it.
function indentedEnd(src: string, from: number): number {
  let i = from;
  while (i < src.length) {
    if (src.startsWith("${", i)) i = interpolationEnd(src, i + 2);
    else if (!src.startsWith("''", i)) i++;
    else if (/['$\\]/.test(src[i + 2] ?? "")) i += 3;
    else return i + 2;
  }
  return src.length;
}

// The token that starts at `i`: where it ends, and its color when it has one.
function token(src: string, i: number): { end: number; kind?: Kind } {
  if (src[i] === "#") {
    const newline = src.indexOf("\n", i);
    return { end: newline < 0 ? src.length : newline, kind: "comment" };
  }
  if (src.startsWith("/*", i)) {
    const close = src.indexOf("*/", i + 2);
    return { end: close < 0 ? src.length : close + 2, kind: "comment" };
  }
  if (src[i] === '"') return { end: stringEnd(src, i + 1), kind: "string" };
  if (src.startsWith("''", i)) return { end: indentedEnd(src, i + 2), kind: "string" };
  const path = match(PATH, src, i);
  if (path >= 0) return { end: path, kind: "path" };
  const name = match(NAME, src, i);
  if (name >= 0)
    return KEYWORDS.has(src.slice(i, name)) ? { end: name, kind: "keyword" } : { end: name };
  const number = match(NUMBER, src, i);
  return number >= 0 ? { end: number, kind: "number" } : { end: i + 1 };
}

/** The colored stretches of `src`, in order and apart from each other. */
export function highlight(src: string): Span[] {
  const spans: Span[] = [];
  let i = 0;
  while (i < src.length) {
    const { end, kind } = token(src, i);
    if (kind) spans.push({ start: i, end, kind });
    i = end;
  }
  return spans;
}

/** `src` cut into pieces that each have one color and one underline (or none). */
export function segments(src: string, spans: Span[], marks: Mark[]): Segment[] {
  const cuts = new Set([0, src.length]);
  for (const { start, end } of [...spans, ...marks]) cuts.add(start).add(end);
  const points = [...cuts].filter((n) => n >= 0 && n <= src.length).sort((a, b) => a - b);
  const found: Segment[] = [];
  for (let n = 0; n + 1 < points.length; n++) {
    const [start, end] = [points[n] as number, points[n + 1] as number];
    const span = spans.find((s) => s.start <= start && end <= s.end);
    const here = marks.filter((m) => m.start <= start && end <= m.end);
    const severity = here.some((m) => m.severity === "error") ? "error" : here[0]?.severity;
    found.push({
      text: src.slice(start, end),
      ...(span && { kind: span.kind }),
      ...(severity && { severity }),
    });
  }
  return found;
}
