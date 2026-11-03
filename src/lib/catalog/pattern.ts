// A string that must match a regular expression (`strMatching` in Nix), as a kind a catalog stores:
// `re:<the expression, URI-encoded>` (the encoding keeps the `+` and `:` of the expression from being
// taken for the separators of a list of kinds).
const PREFIX = "re:";

export const patternKind = (regex: string): string => `${PREFIX}${encodeURIComponent(regex)}`;
export const isPatternKind = (kind: string): boolean => kind.startsWith(PREFIX);
export const patternOf = (kind: string): string => decodeURIComponent(kind.slice(PREFIX.length));

// Nix matches with POSIX extended expressions, which name character classes the way JavaScript does not.
const CLASSES: Record<string, string> = {
  alpha: "a-zA-Z",
  digit: "0-9",
  alnum: "a-zA-Z0-9",
  upper: "A-Z",
  lower: "a-z",
  xdigit: "0-9a-fA-F",
  space: "\\s",
};

// A fixed set of strings as an element of a list: the same JSON a top-level `enum:["a"]` holds, URI-encoded
// so that a `+` in a value is not taken for the separator of kinds.
export const enumElementKind = (values: string[]): string =>
  `enum:${encodeURIComponent(JSON.stringify(values))}`;

/** The strings an `enum:` kind allows, written either way. */
export function enumValues(kind: string): string[] {
  const text = kind.slice("enum:".length);
  return JSON.parse(text.startsWith("[") ? text : decodeURIComponent(text)) as string[];
}

const compiled = new Map<string, RegExp | null>();

// The expression of a kind as JavaScript reads it, which has to match the whole string as Nix's does.
// Null when it cannot be read (a class not listed, or syntax the two read differently): nothing is judged.
function compile(kind: string): RegExp | null {
  if (!compiled.has(kind)) {
    const source = patternOf(kind).replace(
      /\[:([a-z]+):\]/g,
      (all, name: string) => CLASSES[name] ?? all,
    );
    try {
      compiled.set(kind, /\[:[a-z]+:\]/.test(source) ? null : new RegExp(`^(?:${source})$`));
    } catch {
      compiled.set(kind, null);
    }
  }
  return compiled.get(kind) as RegExp | null;
}

/** Whether a string fits a pattern kind. A string not written out in full, or a pattern not readable, fits. */
export function matches(kind: string, value: string | undefined): boolean {
  const regex = compile(kind);
  return value === undefined || regex === null || regex.test(value);
}
