import type { Pos } from "./ast";
import type { LexError, Token } from "./lex";

/** A syntax problem; `code` names the message `diag.<code>` and `params` fills its placeholders. */
export interface Problem extends Pos {
  code:
    | LexError["code"]
    | "syntax-expected"
    | "syntax-expected-eof"
    | "syntax-unexpected"
    | "syntax-unexpected-eof"
    | "syntax-unbalanced"
    | "syntax-unclosed"
    | "syntax-incomplete"
    | "syntax-unterminated";
  params: Record<string, string>;
}

export const KEYWORDS = new Set([
  "if",
  "then",
  "else",
  "assert",
  "with",
  "let",
  "in",
  "rec",
  "inherit",
]);
export const CLOSERS = new Set(["}", ")", "]"]);

export const posOf = ({ line, col }: Pos): Pos => ({ line, col });

/** Thrown after a problem is recorded, to unwind to where parsing can resume. */
export class Bail extends Error {}

/** The token stream and the vocabulary to talk about it: peeking, expecting, and recording problems. */
export class Cursor {
  i = 0;
  readonly problems: Problem[] = [];
  constructor(protected readonly toks: Token[]) {}

  protected get tok(): Token | undefined {
    return this.toks[this.i];
  }
  protected peek(n = 1): Token | undefined {
    return this.toks[this.i + n];
  }
  protected isP(text: string, t = this.tok): boolean {
    return t?.kind === "punct" && t.text === text;
  }
  protected isK(word: string, t = this.tok): boolean {
    return t?.kind === "ident" && t.text === word;
  }
  protected next(): Token {
    return this.toks[this.i++] as Token;
  }
  protected fail(problem: Problem): never {
    this.problems.push(problem);
    throw new Bail();
  }
  protected at(t: Token): Pos {
    return { line: t.line, col: t.col };
  }
  protected shown(t: Token): string {
    return t.kind === "string" ? '"…"' : t.text;
  }

  // The problem for a token that cannot be where it is.
  protected unexpected(): never {
    const t = this.tok;
    if (!t) this.fail({ code: "syntax-unexpected-eof", params: {}, ...this.end() });
    const closer = t.kind === "punct" && CLOSERS.has(t.text);
    return this.fail(
      closer
        ? { code: "syntax-unbalanced", params: { char: t.text }, ...this.at(t) }
        : { code: "syntax-unexpected", params: { found: this.shown(t) }, ...this.at(t) },
    );
  }

  // Where the last token ends: the place to point at when the file stops short.
  protected end(): Pos {
    const last = this.toks[this.toks.length - 1];
    return last ? { line: last.endLine, col: last.endCol } : { line: 1, col: 1 };
  }

  protected expectP(text: string, opener?: Token): Token {
    const t = this.tok;
    if (t && this.isP(text)) return this.next();
    if (!t && opener) {
      this.fail({ code: "syntax-unclosed", params: { char: opener.text }, ...this.at(opener) });
    }
    if (!t) this.fail({ code: "syntax-expected-eof", params: { expected: text }, ...this.end() });
    return this.fail({
      code: "syntax-expected",
      params: { expected: text, found: this.shown(t) },
      ...this.at(t),
    });
  }

  protected expectK(word: string): void {
    const t = this.tok;
    if (t && this.isK(word)) {
      this.next();
      return;
    }
    if (!t) this.fail({ code: "syntax-expected-eof", params: { expected: word }, ...this.end() });
    this.fail({
      code: "syntax-expected",
      params: { expected: word, found: this.shown(t) },
      ...this.at(t),
    });
  }

  // The `;` that ends a binding. A missing one is reported and parsing goes on as if it were
  // there when what follows can start another binding or ends the set.
  protected semicolon(label: string): void {
    if (this.isP(";")) {
      this.next();
      return;
    }
    const t = this.tok;
    if (!t) return; // the end of the file: whoever opened the bracket reports it
    const prev = this.toks[this.i - 1];
    const continues =
      this.isP("}") ||
      this.isK("in") ||
      t.kind === "ident" ||
      t.kind === "string" ||
      this.isP("${");
    if (continues && prev) {
      this.problems.push({
        code: "syntax-unterminated",
        params: { path: label },
        line: prev.endLine,
        col: prev.endCol,
      });
      return;
    }
    this.expectP(";");
  }
}
