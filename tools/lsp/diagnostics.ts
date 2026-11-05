// What the editor draws: our findings as LSP diagnostics, each over the word it is about.
import { wordAt } from "../../src/lib/fix";
import type { Located } from "../local/report";

interface Position {
  line: number;
  character: number;
}

export interface LspDiagnostic {
  range: { start: Position; end: Position };
  severity: 1 | 2;
  source: "nixchecker";
  code?: string;
  message: string;
}

// LSP counts lines and characters from zero, in UTF-16 units: the text's own.
export function position(text: string, offset: number): Position {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, character: offset - (before.lastIndexOf("\n") + 1) };
}

export interface Range {
  start: Position;
  end: Position;
}

const before = (a: Position, b: Position) =>
  a.line < b.line || (a.line === b.line && a.character <= b.character);

/** Whether two ranges share at least a point, as a cursor on a finding does. */
export const overlaps = (a: Range, b: Range): boolean =>
  before(a.start, b.end) && before(b.start, a.end);

/** The smallest single edit that turns `text` into `fixed`. */
export function editBetween(text: string, fixed: string): { range: Range; newText: string } {
  let start = 0;
  while (start < text.length && start < fixed.length && text[start] === fixed[start]) start++;
  let end = 0;
  while (
    end < text.length - start &&
    end < fixed.length - start &&
    text[text.length - 1 - end] === fixed[fixed.length - 1 - end]
  ) {
    end++;
  }
  return {
    range: { start: position(text, start), end: position(text, text.length - end) },
    newText: fixed.slice(start, fixed.length - end),
  };
}

export function toLsp(text: string, items: Located[]): LspDiagnostic[] {
  return items.map((item) => {
    const [start, end] = item.line ? wordAt(text, item.line, item.col ?? 1) : [0, 0];
    return {
      range: { start: position(text, start), end: position(text, Math.max(end, start + 1)) },
      severity: item.severity === "error" ? 1 : 2,
      source: "nixchecker",
      ...(item.code && { code: item.code }),
      message: item.message,
    };
  });
}
