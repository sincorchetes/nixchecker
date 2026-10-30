import type { Token } from "./tokenize";

// Names that exist without being declared in the file.
const GLOBALS = new Set([
  "true",
  "false",
  "null",
  "builtins",
  "import",
  "abort",
  "throw",
  "toString",
  "map",
  "removeAttrs",
  "derivation",
  "baseNameOf",
  "dirOf",
  "isNull",
  "fetchTarball",
  "fetchGit",
  "fetchurl",
  "placeholder",
  "scopedImport",
]);

const isPunct = (token: Token | undefined, text: string) =>
  token?.kind === "punct" && token.text === text;

/**
 * Names the file can legitimately refer to: function arguments, `let` and attribute names,
 * lambda parameters and Nix's globals. It over-approximates on purpose (any name followed by
 * `=`, `:`, `,`, `?` or `@` counts), so a reference outside it is surely undefined.
 * Returns undefined when `with` is used: any name may then come from the `with`ed set.
 */
export function declaredNames(tokens: Token[]): Set<string> | undefined {
  if (tokens.some((t) => t.kind === "ident" && t.text === "with")) return undefined;
  const names = new Set(GLOBALS);
  tokens.forEach((token, i) => {
    if (token.kind !== "ident") return;
    const next = tokens[i + 1];
    if (next?.kind === "punct" && "=:,?@".includes(next.text)) names.add(token.text);
    if (isPunct(tokens[i - 1], "@")) names.add(token.text);
  });
  // The last member of a `{ a, b }:` pattern is followed by `}`.
  tokens.forEach((token, i) => {
    if (!isPunct(token, "}") || !(isPunct(tokens[i + 1], ":") || isPunct(tokens[i + 1], "@"))) {
      return;
    }
    for (let n = i - 1, depth = 1; n >= 0 && depth > 0; n--) {
      const t = tokens[n] as Token;
      if (isPunct(t, "}")) depth++;
      else if (isPunct(t, "{")) depth--;
      else if (t.kind === "ident") names.add(t.text);
    }
  });
  return names;
}
