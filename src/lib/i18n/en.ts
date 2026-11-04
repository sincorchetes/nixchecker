import type { MessageKey } from "./es";

export const en: Record<MessageKey, string> = {
  "site.title": "nixchecker · Nix file validator",
  "site.description":
    "Paste your flake.nix or Nix configuration and validate it against the official NixOS, Home Manager, disko and flake documentation. Unofficial and open source.",
  "nav.language": "ES",
  "nav.languageLabel": "Switch to Spanish",
  "nav.source": "Source code",
  "nav.main": "Main navigation",
  "nav.themeLight": "Light mode",
  "nav.themeDark": "Dark mode",

  "hero.title": "Validate your Nix configuration before rebuilding.",
  "hero.subtitle":
    "Paste your flake.nix or configuration and check every option against the official NixOS, Home Manager, disko and flake documentation.",

  "checker.label": "Your Nix file",
  "checker.placeholder": "{ config, pkgs, ... }:\n{\n  services.openssh.enable = true;\n}",
  "checker.target": "Target",
  "checker.version": "Version",
  "checker.versionHint": "NixOS and Home Manager release to validate against",
  "checker.validate": "Validate",
  "checker.example": "Load example",
  "checker.clear": "Clear",
  "checker.open": "Open file",
  "checker.export": "Download report",
  "checker.remember": "Save draft on this device",
  "checker.privacy":
    "Everything is validated in your browser. Your code is never sent to a server.",

  "target.auto": "Detect automatically",
  "target.nixos": "NixOS",
  "target.home-manager": "Home Manager",
  "target.disko": "disko",
  "target.flake": "Flake",

  "result.empty": "Paste some Nix to get started.",
  "result.ok":
    "No static problems detected in the analyzable parts. Dynamic values, functions and rec sets are not evaluated: this does not guarantee the configuration will work.",
  "result.clean": "No problems",
  "result.validating": "Validating…",
  "result.previous": "Previous result",
  "result.failed": "Could not validate",
  "result.viewLabel": "View",
  "result.viewEditor": "Editor",
  "result.viewProblems": "Problems",
  "result.viewProblemsN": "Problems ({n})",
  "result.details": "Details",
  "checker.replaced": "The text was replaced.",
  "checker.undo": "Undo",
  "result.divider": "Results panel width",
  "result.example": "Example diagnostic:",
  "result.error": "error",
  "result.warning": "warning",
  "result.errorCount.one": "{n} error",
  "result.errorCount.many": "{n} errors",
  "result.warningCount.one": "{n} warning",
  "result.warningCount.many": "{n} warnings",
  "result.and": " and ",
  "result.detected": "Target: {target}",
  "result.catalog": "Catalog: {source}",
  "result.coverage": "{checked} of {total} assignments checked",
  "coverage.dynamic": "{n} with a dynamic value",
  "coverage.any": "{n} with unrestricted types",
  "coverage.hidden": "{n} inside a hidden option",
  "coverage.interpolated": "{n} with interpolated text",
  "coverage.free-form": "{n} inside a free-form option",
  "result.fileTooBig": "That file is too large (maximum size: {max} KB).",
  "result.fileError": "The file could not be read.",
  "result.loadError": "Could not load the catalog. Check your connection and try again.",
  "result.line": "Line {line}, column {col}",
  "result.suggest": "Did you mean {suggestion}?",
  "result.docs": "Official documentation",
  "result.available": "Available options: {options}",
  "result.apply": "Apply fix",
  "result.applyAll": "Apply all fixes",
  "result.goto": "Go to line",

  "diag.syntax-unbalanced": "The character “{char}” has no matching pair.",
  "diag.syntax-expected": "Expected “{expected}” but found “{found}”.",
  "diag.syntax-expected-eof": "Expected “{expected}”, but reached the end of the file.",
  "diag.syntax-unexpected": "Unexpected “{found}” here.",
  "diag.syntax-unexpected-eof": "The file ends before the expression is complete.",
  "diag.syntax-unclosed": "“{char}” is opened here but never closed.",
  "diag.syntax-unterminated-string": "Unterminated string.",
  "diag.syntax-unterminated-comment": "Unterminated /* ... */ comment.",
  "diag.syntax-incomplete": "“{path}” has no “= value;”: the assignment is incomplete.",
  "diag.syntax-unterminated": "The assignment of “{path}” is missing its closing “;”.",
  "diag.not-callable-list":
    "“{name}” is a list and cannot be called as a function. Is an operator such as “++” missing?",
  "diag.not-callable-string":
    "“{name}” is a string and cannot be called as a function. Is an operator such as “+” missing?",
  "diag.not-callable-number":
    "“{name}” is a number and cannot be called as a function. Is an operator missing?",
  "diag.list-plus": "“{name}” is a list: lists are joined with “++”, not “+”.",
  "diag.concat-non-list": "“++” only joins lists, and “{name}” is not a list.",
  "diag.undefined-variable":
    "“{name}” is not defined: it is not an argument and is not declared in the file. Missing quotes or a value?",
  "diag.nothing-to-check":
    "No attribute set { ... } was found to check, so nothing was validated. Put the options inside braces.",
  "diag.not-a-module":
    "This file does not look like a module: none of its keys is an option for this file type, so nothing was checked. It may be a library, a package, an overlay, or a file containing only options declared by your own modules.",
  "diag.unknown-option": "The option “{path}” does not exist in the documentation.",
  "diag.type-mismatch": "“{path}” expects {expected}, but gets {got}.",
  "diag.deprecated": "“{path}” is deprecated: use “{replacement}”.",
  "diag.hidden-option":
    "“{path}” is not in the documentation: it may be deprecated, renamed or internal.",

  "features.title": "An analysis, not an evaluation.",
  "features.docs.title": "Against the official docs",
  "features.docs.body":
    "Options are checked against the NixOS, Home Manager and disko catalogs and the flake format.",
  "features.local.title": "Private by design",
  "features.local.body":
    "The analysis runs in your browser. We never upload your configuration or store anything.",
  "features.hints.title": "Hints, not just errors",
  "features.hints.body":
    "We suggest the correct option, flag renamed options, and link to the documentation.",

  "footer.unofficial":
    "Unofficial project: not affiliated with or endorsed by the NixOS Foundation, Home Manager or disko.",
  "footer.ai": "Built with the help of AI. Always review the results before applying changes.",
  "footer.license": "Free software under GPL v3.0 or later.",
  "nav.how": "How it works",
  "bar.label": "Notice",
  "bar.unofficial":
    "Unofficial tool: not affiliated with, endorsed or maintained by the NixOS, Home Manager or disko projects.",
  "features.lead": "The same file always gives the same results.",
  "footer.tagline": "Made for the Nix community. Your code never leaves the browser.",
};
