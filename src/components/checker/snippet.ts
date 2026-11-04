import { wordAt } from "../../lib/fix";
import type { Diagnostic } from "../../lib/validate";
import { el } from "./dom";

/**
 * The line a finding is about, with a row of carets under the word it points at: the same markup as the
 * examples of the front page (see `styles/listing.css`).
 */
export function snippet(text: string, d: Diagnostic): HTMLElement {
  const line = text.split("\n")[d.line - 1] ?? "";
  const [start, end] = wordAt(text, d.line, d.col);
  const at = Math.max(d.col - 1, 0);
  // A tab is a tab in the carets too, so the mark lines up whatever the width of a tab is.
  const pad = [...line.slice(0, at)].map((c) => (c === "\t" ? "\t" : " ")).join("");

  const listing = el("pre", "listing");
  const code = el("span", "row");
  const word = el("mark", "", line.slice(at, at + Math.max(end - start, 1)));
  code.append(
    el("span", "ln", String(d.line)),
    line.slice(0, at),
    word,
    line.slice(at + word.textContent.length),
  );
  const marks = el("span", "row");
  marks.append(el("span", "ln"), el("span", "caret", pad + "^".repeat(Math.max(end - start, 1))));
  listing.append(code, marks);
  return listing;
}
