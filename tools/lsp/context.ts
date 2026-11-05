// Where the cursor is in a Nix file, for completing option names: is a name being written, and inside
// which attribute sets. It reads the text left of the cursor and nothing else.
import { splitPath } from "../../src/lib/catalog/path";
import { highlight } from "../../src/lib/nix/highlight";

export interface Context {
  /** The options an enclosing `x.y = { ... }` already puts the cursor under. */
  enclosing: string[];
  /** The names written so far in `a.b.par|`, without the one being typed. */
  written: string[];
  /** What has been typed of the name at the cursor. */
  partial: string;
}

const NAME_CHAR = /[\w'".-]/;
const SEGMENT = /^[A-Za-z_][\w'-]*$/;

// The characters at the end of `text` that can belong to a name, as far back as they go. Read from the end
// on purpose: a pattern that searches from every position of the text is quadratic on a large file.
function runAtEnd(text: string, accepts: RegExp): number {
  let from = text.length;
  while (from > 0 && accepts.test(text[from - 1] as string)) from--;
  return from;
}

// The attribute path in `path =` at the end of the text before a `{`: the set is the value of that option.
function ownerBefore(text: string): string | undefined {
  const equals = text.trimEnd();
  if (!equals.endsWith("=")) return undefined;
  const head = equals.slice(0, -1).trimEnd();
  let start = runAtEnd(head, NAME_CHAR);
  // A path starts with a letter, an underscore or a quote.
  while (start < head.length && !/[A-Za-z_"]/.test(head[start] as string)) start++;
  return start < head.length ? head.slice(start) : undefined;
}

// The name being typed at the end of the code, `a.b.par`: the segments before the last one start like a name.
function wordAt(code: string): string {
  const run = runAtEnd(code, /[\w'.-]/);
  for (let start = run; start < code.length; start++) {
    if (
      code
        .slice(start)
        .split(".")
        .slice(0, -1)
        .every((part) => SEGMENT.test(part))
    ) {
      return code.slice(start);
    }
  }
  return "";
}

// The text with comments and strings blanked out (same length), so what is left is code.
function codeOf(text: string): { code: string; open: boolean } {
  const chars = [...text];
  let open = false;
  for (const { start, end, kind } of highlight(text)) {
    if (kind !== "comment" && kind !== "string") continue;
    // A comment or a string that reaches the end of the text is the one the cursor is in.
    if (end >= text.length && start < text.length) open = true;
    for (let i = start; i < end; i++) if (chars[i] !== "\n") chars[i] = " ";
  }
  return { code: chars.join(""), open };
}

/**
 * The context for completing at `offset`, or undefined when no option name is being written there: in
 * a string or a comment, in the value of an option, or in a place (a list, a call) whose names are not
 * options of the file's own module.
 */
export function contextAt(text: string, offset: number): Context | undefined {
  const { code, open } = codeOf(text.slice(0, offset));
  if (open) return undefined;

  const typed = wordAt(code);
  const start = code.length - typed.length;
  const previous = code.slice(0, start).trimEnd().slice(-1);
  // A name starts a statement: after `{`, after `;`, or at the start of the file.
  if (previous !== "" && previous !== "{" && previous !== ";") return undefined;

  // The attribute sets the cursor is inside; `undefined` stands for one whose names are not options.
  const stack: Array<string[] | undefined> = [];
  for (let i = 0; i < start; i++) {
    if (code[i] === "}") {
      stack.pop();
    } else if (code[i] === "{") {
      // A quoted name is a string, so the owner is read from the text as written.
      const owner = ownerBefore(text.slice(0, i));
      const parent = stack.length === 0 ? [] : stack[stack.length - 1];
      // Under `config = { ... }` the options are the module's own, as if the `config` were not written.
      const written = splitPath(owner ?? "");
      const own = stack.length === 1 && written[0] === "config" ? written.slice(1) : written;
      if (owner) stack.push(parent && [...parent, ...own]);
      else stack.push(stack.length === 0 ? [] : undefined);
    }
  }
  const enclosing = stack.length === 0 ? [] : stack[stack.length - 1];
  if (!enclosing) return undefined;
  const names = typed.split(".");
  return { enclosing, written: names.slice(0, -1), partial: names[names.length - 1] as string };
}
