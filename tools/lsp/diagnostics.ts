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
function position(text: string, offset: number): Position {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, character: offset - (before.lastIndexOf("\n") + 1) };
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
