// Prints what the static analysis and the real evaluation found, by how sure each one is.
import { resolve } from "node:path";
import { splitPath } from "../../src/lib/catalog/path";
import type { Finding } from "../../src/lib/evaluation";
import { format, messages } from "../../src/lib/i18n";
import type { Assignment, ValueKind } from "../../src/lib/nix/scan";
import type { Diagnostic } from "../../src/lib/validate";

export interface Located {
  level: "syntax" | "static" | "evaluation";
  severity: "error" | "warning";
  message: string;
  /** The static diagnostic code, when it comes from the analysis. */
  code?: string;
  /** The file it is in, when that is not the one checked (an imported module). */
  file?: string;
  /** The configuration of a flake it was found in. */
  config?: string;
  line?: number;
  col?: number;
  /** Other places the same option is set that fit as well, when the finding cannot tell which is meant. */
  alternatives?: Array<{ line: number; col: number }>;
}

const SYNTAX = /^(syntax-|undefined-variable|not-callable|list-plus|concat-non-list)/;

/** A static diagnostic, in words. */
export function fromDiagnostic(d: Diagnostic): Located {
  const message = format(messages.en[`diag.${d.code}` as keyof typeof messages.en], d.params);
  const level = SYNTAX.test(d.code) ? "syntax" : "static";
  return { level, severity: d.severity, message, code: d.code, line: d.line, col: d.col };
}

// Every place the file assigns the option a finding is about (or something below it).
function whereIs(option: string | undefined, assignments: Assignment[]): Assignment[] {
  if (!option) return [];
  const segs = splitPath(option);
  const same = (a: Assignment) =>
    segs.every((s, i) => s === a.path[i] || s.startsWith("<") || a.path[i] === "*");
  return assignments.filter((a) => a.path.length >= segs.length && same(a));
}

// The kind of value Nix prints: `"x"` is a string, `5` an integer, `true` a boolean, `[ ... ]` a list.
function kindPrinted(value: string): ValueKind {
  if (value.startsWith('"') || value.startsWith("''")) return "str";
  if (/^-?\d/.test(value)) return "int";
  if (value === "true" || value === "false") return "bool";
  if (value.startsWith("[")) return "list";
  return value.startsWith("{") ? "attrs" : "other";
}

// Of the places an option is set, those that can be the definition Nix printed: the value has the same
// kind (and the same text, for a plain string). With nothing printed, or nothing fitting, all stay.
function fitting(candidates: Assignment[], printed: string[]): Assignment[] {
  if (printed.length === 0) return candidates;
  const fits = (a: Assignment) =>
    printed.some((value) => {
      if (a.kind === "other") return true;
      if (kindPrinted(value) !== a.kind) return false;
      return a.kind !== "str" || a.value === undefined || value === `"${a.value}"`;
    });
  const kept = candidates.filter(fits);
  return kept.length > 0 ? kept : candidates;
}

/** Whether Nix says the option is defined in a file other than `checked`. */
export const isImported = (f: Finding, checked: string): boolean =>
  f.file !== undefined && resolve(f.file) !== resolve(checked);

/**
 * A finding of the real evaluation, placed where its option is written: in `assignments` (those of the
 * checked file, or of the imported one it is defined in, when that could be read).
 */
export function fromFinding(f: Finding, assignments: Assignment[], checked: string): Located {
  // What Nix printed for the definitions in the file the assignments are of.
  const owner = isImported(f, checked) ? (f.file as string) : checked;
  const printed = (f.definitions ?? [])
    .filter((d) => resolve(d.file) === resolve(owner))
    .map((d) => d.value);
  const [at, ...others] = fitting(whereIs(f.option, assignments), printed);
  return {
    level: "evaluation",
    severity: f.kind === "warning" ? "warning" : "error",
    message: f.message,
    ...(isImported(f, checked) && { file: f.file }),
    ...(f.config && { config: f.config }),
    ...(at && { line: at.line, col: at.col }),
    ...(others.length > 0 && { alternatives: others.map(({ line, col }) => ({ line, col })) }),
  };
}

const LABEL = { syntax: "syntax", static: "static check", evaluation: "confirmed by Nix" } as const;

export function printText(items: Located[], coverage: string, evaluated: boolean): void {
  for (const level of ["syntax", "static", "evaluation"] as const) {
    for (const item of items.filter((i) => i.level === level)) {
      const place = item.line ? `${item.line}:${item.col}` : "";
      const where = item.file ? `${item.file}${place && `:${place}`}  ` : place && `${place}  `;
      const config = item.config ? `${item.config}: ` : "";
      const also = item.alternatives?.length
        ? ` (or at ${item.alternatives.map((a) => `${a.line}:${a.col}`).join(", ")})`
        : "";
      console.log(
        `${item.severity.padEnd(7)} ${where}${config}${item.message}${also}  [${LABEL[level]}]`,
      );
    }
  }
  const errors = items.filter((i) => i.severity === "error").length;
  console.log(`\n${errors} errors, ${items.length - errors} warnings. ${coverage}`);
  if (!evaluated) console.log("Not evaluated: fix the syntax errors first, or pass --static.");
  else
    console.log("Nix stops at the first error it meets: fix it and run again to see the next one.");
}
