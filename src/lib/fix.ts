import type { Diagnostic } from "./validate";

/** The path a diagnostic proposes instead of the one written, when it proposes one. */
export const replacementOf = (d: Diagnostic): string | undefined =>
  d.suggestion ?? (d.code === "deprecated" ? d.params.replacement : undefined);

/** Offset of 1-based `line`/`col` in `source`. */
export function offsetOf(source: string, line: number, col: number): number {
  let offset = 0;
  for (let n = 1; n < line; n++) offset = source.indexOf("\n", offset) + 1;
  return offset + col - 1;
}

/**
 * Applies a diagnostic's proposal to `source`, or returns undefined when it cannot be done
 * with certainty. Inside a nested set only the tail of the path is written in the source
 * (`enabel` under `services.openssh = { ... }`), so the tail is replaced when the head is unchanged.
 */
export function applyFix(source: string, d: Diagnostic): string | undefined {
  const replacement = replacementOf(d);
  const path = d.params.path;
  if (!replacement || !path) return undefined;
  const written = path.split(".");
  const proposed = replacement.split(".");
  const at = offsetOf(source, d.line, d.col);
  for (let k = 0; k < written.length; k++) {
    const text = written.slice(k).join(".");
    if (!source.startsWith(text, at)) continue;
    const head = written.slice(0, k).join(".");
    if (k > 0 && (proposed.length !== written.length || proposed.slice(0, k).join(".") !== head)) {
      return undefined;
    }
    const tail = k === 0 ? replacement : proposed.slice(k).join(".");
    return source.slice(0, at) + tail + source.slice(at + text.length);
  }
  return undefined;
}

/** The word at a diagnostic's position (up to whitespace, `=` or `;`), for selecting it. */
export function wordAt(source: string, line: number, col: number): [start: number, end: number] {
  const start = offsetOf(source, line, col);
  const end = start + (/^[^\s=;]*/.exec(source.slice(start))?.[0].length ?? 0);
  return [start, end];
}

/**
 * Applies every fix that can be applied with certainty. They go from the end of the text to
 * the start so each one leaves the positions of the earlier ones untouched.
 */
export function applyAll(source: string, diagnostics: Diagnostic[]): string {
  const order = [...diagnostics].sort((a, b) => b.line - a.line || b.col - a.col);
  return order.reduce((text, d) => applyFix(text, d) ?? text, source);
}
