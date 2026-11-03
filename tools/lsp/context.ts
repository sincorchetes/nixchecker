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

// An attribute path and `=`, at the end of the text before a `{`: the set is the value of that option.
const OPENS_VALUE = /([A-Za-z_"][\w'".-]*)\s*=\s*$/;
const WORD = /(?:[A-Za-z_][\w'-]*\.)*[\w'-]*$/;

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

  const typed = WORD.exec(code)?.[0] ?? "";
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
      const owner = OPENS_VALUE.exec(text.slice(0, i))?.[1];
      const parent = stack.length === 0 ? [] : stack[stack.length - 1];
      if (owner) stack.push(parent && [...parent, ...splitPath(owner)]);
      else stack.push(stack.length === 0 ? [] : undefined);
    }
  }
  const enclosing = stack.length === 0 ? [] : stack[stack.length - 1];
  if (!enclosing) return undefined;
  const names = typed.split(".");
  return { enclosing, written: names.slice(0, -1), partial: names[names.length - 1] as string };
}
