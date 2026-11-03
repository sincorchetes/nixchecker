// Prints what the static analysis and the real evaluation found, by how sure each one is.
import type { Finding } from "../../src/lib/evaluation";
import { format, messages } from "../../src/lib/i18n";
import type { Assignment } from "../../src/lib/nix/scan";
import type { Diagnostic } from "../../src/lib/validate";

export interface Located {
  level: "syntax" | "static" | "evaluation";
  severity: "error" | "warning";
  message: string;
  /** The static diagnostic code, when it comes from the analysis. */
  code?: string;
  line?: number;
  col?: number;
}

const SYNTAX = /^(syntax-|undefined-variable|not-callable|list-plus|concat-non-list)/;

/** A static diagnostic, in words. */
export function fromDiagnostic(d: Diagnostic): Located {
  const message = format(messages.en[`diag.${d.code}` as keyof typeof messages.en], d.params);
  const level = SYNTAX.test(d.code) ? "syntax" : "static";
  return { level, severity: d.severity, message, code: d.code, line: d.line, col: d.col };
}

// Where the file assigns the option a finding is about (or something below it).
function whereIs(option: string | undefined, assignments: Assignment[]) {
  if (!option) return undefined;
  const segs = option.split(".");
  const same = (a: Assignment) =>
    segs.every((s, i) => s === a.path[i] || s.startsWith("<") || a.path[i] === "*");
  return assignments.find((a) => a.path.length >= segs.length && same(a));
}

/** A finding of the real evaluation, placed in the file when its option is written there. */
export function fromFinding(f: Finding, assignments: Assignment[]): Located {
  const at = whereIs(f.option, assignments);
  const severity = f.kind === "warning" ? "warning" : "error";
  return {
    level: "evaluation",
    severity,
    message: f.message,
    ...(at && { line: at.line, col: at.col }),
  };
}

const LABEL = { syntax: "syntax", static: "static check", evaluation: "confirmed by Nix" } as const;

export function printText(items: Located[], coverage: string, evaluated: boolean): void {
  for (const level of ["syntax", "static", "evaluation"] as const) {
    for (const item of items.filter((i) => i.level === level)) {
      const where = item.line ? `${item.line}:${item.col}  ` : "";
      console.log(`${item.severity.padEnd(7)} ${where}${item.message}  [${LABEL[level]}]`);
    }
  }
  const errors = items.filter((i) => i.severity === "error").length;
  console.log(`\n${errors} errors, ${items.length - errors} warnings. ${coverage}`);
  if (!evaluated) console.log("Not evaluated: fix the syntax errors first, or pass --static.");
  else
    console.log("Nix stops at the first error it meets: fix it and run again to see the next one.");
}
