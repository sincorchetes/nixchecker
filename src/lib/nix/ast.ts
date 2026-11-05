export interface Pos {
  line: number;
  col: number;
}

/** One part of an attribute path: `name` is undefined when it is computed (`${x}`). */
export interface AttrPart extends Pos {
  name?: string;
}

export type Param =
  | { kind: "ident"; name: string }
  | { kind: "formals"; names: string[]; alias?: string };

export type Bind =
  | { t: "attr"; path: AttrPart[]; value: Expr; pos: Pos }
  | { t: "inherit"; from?: Expr; names: string[]; pos: Pos };

export type Expr = Pos &
  (
    | { t: "ident"; name: string }
    | { t: "num"; float: boolean; text: string }
    | { t: "str"; value?: string }
    | { t: "path" }
    | { t: "list"; items: Expr[] }
    | { t: "set"; rec: boolean; binds: Bind[] }
    | { t: "let"; binds: Bind[]; body: Expr }
    | { t: "lambda"; param: Param; body: Expr }
    | { t: "app"; fn: Expr; arg: Expr }
    | { t: "select"; base: Expr; path: AttrPart[]; fallback?: Expr }
    | { t: "unary"; op: "!" | "-"; arg: Expr }
    | { t: "binary"; op: string; left: Expr; right: Expr }
    | { t: "if"; cond: Expr; consequent: Expr; alternate: Expr }
    | { t: "with"; env: Expr; body: Expr }
    | { t: "assert"; cond: Expr; body: Expr }
    | { t: "paren"; inner: Expr }
    | { t: "hasattr"; base: Expr; path: AttrPart[] }
  );
