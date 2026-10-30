import type { MessageKey } from "./es";

export const en: Record<MessageKey, string> = {
  "site.title": "nixchecker · Nix file validator",
  "site.description":
    "Paste your flake.nix or Nix configuration and validate it against the official NixOS, Home Manager, disko and flake documentation. Unofficial and open source.",
  "nav.language": "Español",
  "nav.languageLabel": "Switch to Spanish",
  "nav.source": "Source code",

  "hero.eyebrow": "Unofficial project · Open source",
  "hero.title": "Validate your Nix before you rebuild.",
  "hero.subtitle":
    "Paste your flake.nix or configuration and check every option against the official NixOS, Home Manager, disko and flake documentation.",
  "hero.unofficial":
    "nixchecker is not an official project and is not affiliated with the NixOS Foundation, Home Manager or disko.",

  "checker.label": "Your Nix file",
  "checker.placeholder": "{ config, pkgs, ... }:\n{\n  services.openssh.enable = true;\n}",
  "checker.target": "Target",
  "checker.validate": "Validate",
  "checker.example": "Load example",
  "checker.clear": "Clear",
  "checker.privacy":
    "Everything is validated in your browser. Your code is never sent to a server.",

  "target.auto": "Detect automatically",
  "target.nixos": "NixOS",
  "target.home-manager": "Home Manager",
  "target.disko": "disko",
  "target.flake": "Flake",

  "result.empty": "Paste some Nix to get started.",
  "result.ok": "No problems found. Everything matches the known documentation.",
  "result.summary": "{errors} errors · {warnings} warnings",
  "result.detected": "Target: {target}",
  "result.catalog": "Catalog: {source}",
  "result.loadError": "Could not load the catalog. Check your connection and try again.",
  "result.line": "Line {line}, column {col}",
  "result.suggest": "Did you mean {suggestion}?",
  "result.docs": "Official documentation",
  "result.available": "Available options: {options}",
  "result.apply": "Apply fix",
  "result.applyAll": "Apply all fixes",
  "result.goto": "Go to line",

  "diag.syntax-unbalanced": "The character “{char}” has no matching pair.",
  "diag.syntax-unterminated-string": "Unterminated string.",
  "diag.syntax-unterminated-comment": "Unterminated /* ... */ comment.",
  "diag.syntax-incomplete": "“{path}” has no “= value;”: the assignment is incomplete.",
  "diag.syntax-unterminated": "The assignment of “{path}” is missing its closing “;”.",
  "diag.undefined-variable":
    "“{name}” is not defined: it is not an argument and is not declared in the file. Missing quotes or a value?",
  "diag.nothing-to-check":
    "No attribute set { ... } was found to check, so nothing was validated. Put the options inside braces.",
  "diag.unknown-option": "The option “{path}” does not exist in the documentation.",
  "diag.type-mismatch": "“{path}” expects {expected}, but gets {got}.",
  "diag.deprecated": "“{path}” is deprecated: use “{replacement}”.",
  "diag.hidden-option":
    "“{path}” is not in the documentation: it may be deprecated, renamed or internal.",

  "features.title": "Built for everyday Nix",
  "features.docs.title": "Against the official docs",
  "features.docs.body":
    "Options are checked against the NixOS, Home Manager and disko catalogs and the flake format.",
  "features.local.title": "Private by design",
  "features.local.body":
    "The analysis runs in your browser. We never upload your configuration or store anything.",
  "features.hints.title": "Hints, not just errors",
  "features.hints.body":
    "We suggest the right option, flag renamed ones and link the documentation.",

  "footer.unofficial":
    "Unofficial project: not affiliated with or endorsed by the NixOS Foundation, Home Manager or disko.",
  "footer.ai": "Built with the help of AI. Always review the results before applying changes.",
  "footer.license": "Free software under GPL v3.0 or later.",
};
