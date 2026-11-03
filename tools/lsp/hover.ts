// What is known about the option under the cursor, as the editor shows it on hover: its type and what it
// was renamed to (from the catalog), and its description, default and example (from the manuals' own
// options file, once that is read: see `docsOf`), with a link to the official page.
import { docUrl, loadCatalog, type Target } from "../../src/lib/catalog";
import { splitPath } from "../../src/lib/catalog/path";
import { childrenOf, findExact } from "../../src/lib/catalog/tree";
import type { Version } from "../../src/lib/catalog/versions";
import { checkText } from "../../src/lib/check-text";
import type { TargetChoice } from "../../src/lib/validate";
import { fromDisk } from "../local/static-layer";
import { contextAt } from "./context";
import { type Doc, describeDoc, docsOf } from "./docs";

export interface Hover {
  /** Markdown for the editor to show. */
  value: string;
  /** The offsets of the written path the hover is about. */
  start: number;
  end: number;
}

const NAME = /[A-Za-z0-9_'".-]/;

/** The option (or group of options) at `offset`, up to the name the cursor is on. */
export async function hoverAt(
  text: string,
  offset: number,
  choice: string | undefined,
  version: Version,
  docs: (target: Target, version: Version) => Map<string, Doc> | undefined = docsOf,
): Promise<Hover | undefined> {
  let start = offset;
  while (start > 0 && NAME.test(text[start - 1] as string)) start--;
  let end = offset;
  while (end < text.length && NAME.test(text[end] as string)) end++;
  if (start === end) return undefined;

  // Names written below an enclosing `x = { ... }` belong to the option it is the value of.
  const enclosing = contextAt(text, start)?.enclosing;
  if (!enclosing) return undefined;
  const written = splitPath(text.slice(start, end));
  const cursorOn = splitPath(text.slice(start, offset)).length;
  const path = [...enclosing, ...written.slice(0, Math.max(cursorOn, 1))];

  // The target is decided as everywhere else: by what the text says, or by where it has fewer errors.
  const target = (await checkText(text, (choice ?? "auto") as TargetChoice, version, "/", fromDisk))
    .report.target;
  const { tree } = await loadCatalog(target, version, "/", [path], fromDisk);
  const entry = findExact(tree, path);
  const below = childrenOf(tree, path).length;
  if (!entry && below === 0) return undefined;

  const lines = [`**${path.join(".")}**`];
  if (entry) {
    const values = entry.type === "enum" ? ` (${entry.values?.join(" | ")})` : "";
    lines.push(`Type: \`${entry.type}\`${values}`);
    if (entry.renamedTo) lines.push(`Renamed: use \`${entry.renamedTo}\` instead.`);
    if (entry.type === "hidden")
      lines.push("Hidden upstream: it still works, but it is not documented.");
    const doc = docs(target, version)?.get(entry.path);
    if (doc) lines.push(...describeDoc(doc));
  } else {
    lines.push(`A group of ${below} options.`);
  }
  lines.push(`[Documentation](${docUrl(target, entry?.path ?? path.join("."), version)})`);
  return { value: lines.join("\n\n"), start, end };
}
