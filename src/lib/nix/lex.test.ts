import { describe, expect, test } from "bun:test";
import { lex } from "./lex";

const kinds = (src: string) => lex(src).tokens.map((t) => `${t.kind}:${t.text}`);

describe("lex", () => {
  test("splits identifiers, numbers, strings and operators, tracking positions", () => {
    expect(kinds('a-b = 1.5 + "x"; # note\n c = [ ] ++ x;')).toEqual([
      "ident:a-b",
      "punct:=",
      "number:1.5",
      "punct:+",
      "string:x",
      "punct:;",
      "ident:c",
      "punct:=",
      "punct:[",
      "punct:]",
      "punct:++",
      "ident:x",
      "punct:;",
    ]);
    const [, second] = lex("a\n  bc").tokens;
    expect(second).toMatchObject({ line: 2, col: 3, endLine: 2, endCol: 5 });
  });

  test("reads paths, search paths, URIs and paths with interpolation", () => {
    expect(kinds("./a/b.nix <nixpkgs> ~/x a / b")).toEqual([
      "path:./a/b.nix",
      "path:<nixpkgs>",
      "path:~/x",
      "ident:a",
      "punct:/",
      "ident:b",
    ]);
    expect(kinds("https://example.org/x")).toEqual(["path:https://example.org/x"]);
    expect(kinds("./patches/${v}/x.patch ./${n}.cert")).toEqual([
      "path:./patches/${…}/x.patch",
      "path:./${…}.cert",
    ]);
  });

  test("keeps the value of plain strings only, with escapes undone", () => {
    const [plain, interpolated, indented] = lex(`"a\\"b\\n" "x\${y}" ''z''`).tokens;
    expect(plain?.value).toBe('a"b\n');
    expect(interpolated?.value).toBeUndefined();
    expect(indented?.value).toBe("z");
  });

  test("copes with nested strings, comments and escapes inside interpolations", () => {
    const src = `''
      \${f "a" ''b''} \${
        # a " in a comment
        x /* and " here */ }
      ''\\'' ''$\{ '''
    ''`;
    expect(lex(src).errors).toEqual([]);
    expect(lex(src).tokens).toHaveLength(1);
  });

  test("reports what is left open", () => {
    expect(lex('a = "x;').errors).toMatchObject([{ code: "syntax-unterminated-string" }]);
    expect(lex("a = ''x").errors).toMatchObject([{ code: "syntax-unterminated-string" }]);
    expect(lex("a /* x").errors).toMatchObject([{ code: "syntax-unterminated-comment", col: 3 }]);
    expect(kinds("a /* b */ c")).toEqual(["ident:a", "ident:c"]);
  });
});
