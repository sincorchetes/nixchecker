import type { Token } from "./tokenize";

export interface BalanceError {
  char: string;
  line: number;
  col: number;
}

const PAIRS: Record<string, string> = { "{": "}", "[": "]", "(": ")" };
const CLOSERS = new Set(Object.values(PAIRS));

/** Reports brackets that are closed without being opened, or never closed. */
export function checkBalance(tokens: Token[]): BalanceError[] {
  const errors: BalanceError[] = [];
  const stack: Token[] = [];
  for (const token of tokens) {
    if (token.kind !== "punct") continue;
    if (token.text in PAIRS) {
      stack.push(token);
    } else if (CLOSERS.has(token.text)) {
      const open = stack.pop();
      if (!open || PAIRS[open.text] !== token.text) {
        errors.push({ char: token.text, line: token.line, col: token.col });
      }
    }
  }
  for (const open of stack) errors.push({ char: open.text, line: open.line, col: open.col });
  return errors;
}
