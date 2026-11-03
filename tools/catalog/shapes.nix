# Describes the real type of every option, read from Nix's own type objects instead of from the
# sentences of the manuals. The shape of a type is a list of alternatives, one of which a value must be:
#   "b" "i" "s" "a"        a bool, an integer, a string, an attribute set
#   "p"                    an absolute path (a string starting with "/", or a path literal)
#   "u"                    a function (what a `nixpkgs-overlay` is)
#   "k"                    a package: a derivation, or the path of one in the store
#   [ "l" <alt>... ]       a list whose elements are one of the alternatives
#   [ "m" <alt>... ]       an attribute set whose values are one of the alternatives (`attrsOf`)
#   [ "e" "x" "y" ]        one of these strings
#   [ "r" "<regex>" ]      a string that matches the whole of this regular expression (`strMatching`)
#   "f"                    a float (no value we read is one, so it never tells anything)
#   "?"                    something that cannot be told apart (a float, a package, anything...)
{ lib }:
let
  # The kind a type without inner types takes, from its name. Anything not listed (a float, a package,
  # `anything`...) is left unchecked: reading a type through its own `check` would be more exact, but
  # `check` throws on values of the wrong kind for some types.
  leaf =
    t:
    let
      named = n: lib.hasPrefix n t.name;
    in
    if t.name == "package" then
      [ "k" ]
    else if t.name == "nixpkgs-overlay" then
      [ "u" ]
    else if named "bool" then
      [ "b" ]
    else if lib.any named [
      "int"
      "unsignedInt"
      "positiveInt"
    ] then
      [ "i" ]
    else if named "float" then
      [ "f" ]
    else if lib.any named [
      "numberBetween"
      "numberNonnegative"
      "numberPositive"
    ] then
      [
        "i"
        "f"
      ]
    else if t.name == "path" || t.name == "passwdEntry path" then
      [ "p" ]
    else if named "strMatching " then
      # The name is `strMatching ${lib.escapeNixString regex}`: a JSON string with the `$` escaped.
      [
        [
          "r"
          (builtins.fromJSON (
            builtins.replaceStrings [ "\\$" ] [ "$" ] (lib.removePrefix "strMatching " t.name)
          ))
        ]
      ]
    else if lib.any named [
      "str"
      "nonEmptyStr"
      "singleLineStr"
      "separatedString"
      "passwdEntry"
    ] then
      [ "s" ]
    else if lib.any named [
      "attrs"
      "attrsOf"
      "lazyAttrsOf"
      "submodule"
    ] then
      [ "a" ]
    else
      [ "?" ];

  # `shallow`: the type is the one a value is coerced from (`coercedTo`), which is only asked whether the value is
  # a list or a set, not what is in it: the elements are never checked, so they tell nothing.
  walk =
    shallow: depth: t:
    let
      nested = t.nestedTypes or { };
      values = t.functor.payload.values or [ null ];
    in
    if depth > 8 then
      [ "?" ]
    else if t.name == "either" then
      walk shallow (depth + 1) nested.left ++ walk shallow (depth + 1) nested.right
    else if t.name == "nullOr" then
      walk shallow (depth + 1) nested.elemType
    else if t.name == "coercedTo" then
      walk shallow (depth + 1) nested.finalType ++ walk true (depth + 1) nested.coercedType
    else if shallow && (t.name == "listOf" || t.name == "nonEmptyListOf") then
      [ [ "l" "?" ] ]
    else if shallow && (t.name == "attrsOf" || t.name == "lazyAttrsOf") then
      [ "a" ]
    else if t.name == "listOf" || t.name == "nonEmptyListOf" then
      [ ([ "l" ] ++ walk shallow (depth + 1) nested.elemType) ]
    else if t.name == "attrsOf" || t.name == "lazyAttrsOf" then
      [ ([ "m" ] ++ walk shallow (depth + 1) nested.elemType) ]
    else if t.name == "enum" && lib.all lib.isString values then
      [ ([ "e" ] ++ values) ]
    else if t.name == "enum" && lib.all lib.isInt values then
      [ "i" ]
    else if t.name == "enum" && lib.all lib.isBool values then
      [ "b" ]
    else
      leaf t;

  # Every option, with those inside submodules (which the manuals list under `<name>`).
  options =
    depth: opts:
    lib.optionals (depth < 6) (
      lib.concatMap (
        opt:
        let
          shallow = (opt.visible or true) == "shallow";
          sub = if shallow then { } else opt.type.getSubOptions opt.loc;
        in
        [
          {
            name = lib.showOption opt.loc;
            value = lib.unique (walk false 0 opt.type);
          }
        ]
        ++ lib.optionals (sub != { }) (options (depth + 1) (lib.collect lib.isOption sub))
      ) opts
    );
in
allOptions: lib.listToAttrs (options 0 (lib.collect lib.isOption allOptions))
