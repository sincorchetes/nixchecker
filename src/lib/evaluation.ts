/**
 * What real Nix said about a module. It is the second layer of the validator: the static analysis of the
 * page can only guess at what evaluation settles, so a finding here is confirmed (an option does not
 * exist, a value is not of the type, an assertion fails).
 *
 * Nix is asked for its messages as data (`--log-format internal-json`: one JSON object per line, with the
 * message apart from the colors and the trace); the text of the messages themselves is the module
 * system's, and that is what is recognized. Plain text is read too, for what is not JSON.
 */
export interface Definition {
  file: string;
  /** The value as Nix prints it. */
  value: string;
}

export interface Finding {
  kind: "unknown-option" | "type-error" | "assertion" | "warning" | "error";
  /** The option involved, when there is one. */
  option?: string;
  /** The type that was expected, for a type error. */
  expected?: string;
  /** The file that defines the option, as Nix names it (the module system gives no line). */
  file?: string;
  /** Every definition Nix listed for the option: where it is set, and to what. */
  definitions?: Definition[];
  /** What Nix suggests instead of an option that does not exist. */
  suggestion?: string;
  /** Which configuration of a flake it was found in (`nixosConfigurations.box`). */
  config?: string;
  message: string;
}

// The names between `quotes' in "The options `a', `b' do not exist".
const quoted = (text: string): string[] =>
  [...text.matchAll(/`([^'`]+)'/g)].map((m) => m[1] as string);

// The messages of a "Failed assertions:" list: each starts with "- " and may go on over more lines.
function assertions(block: string): string[] {
  const messages: string[] = [];
  for (const line of block.split("\n")) {
    if (/^\s*- /.test(line)) messages.push(line.replace(/^\s*- /, "").trim());
    else if (messages.length > 0 && line.trim()) messages[messages.length - 1] += ` ${line.trim()}`;
  }
  return messages;
}

// What the module system lists under "Definition values:": `- In `file': value`.
function definitionsIn(text: string): Definition[] {
  return [...text.matchAll(/^[ \t]*- In `([^'\n]+)': (.*)$/gm)].map((m) => ({
    file: m[1] as string,
    value: (m[2] as string).trim(),
  }));
}

/** What one error message of Nix is about. */
function classify(text: string): Finding[] {
  const definitions = definitionsIn(text);
  const file = definitions[0]?.file;
  const where = { ...(file && { file }), ...(definitions.length > 0 && { definitions }) };
  const missing = /^The options? (.+?) (?:does|do) not exist/.exec(text);
  const wrongType = /^A definition for option `([^']+)' is not of type `(.+?)'\./.exec(text);

  if (missing) {
    const options = quoted(missing[1] as string);
    const suggestion = /Did you mean `([^']+)'/.exec(text)?.[1];
    return options.map((option) => ({
      kind: "unknown-option",
      option,
      // One list of definitions cannot be told apart between several options.
      ...(options.length === 1 && where),
      ...(options.length === 1 && suggestion && { suggestion }),
      message: `The option ${option} does not exist`,
    }));
  }
  if (wrongType) {
    const [, option, expected] = wrongType as unknown as [string, string, string];
    return [
      {
        kind: "type-error",
        option,
        expected,
        ...where,
        message: `A definition for ${option} is not of type ${expected}`,
      },
    ];
  }
  if (text.startsWith("Failed assertions:")) {
    return assertions(text.slice("Failed assertions:".length)).map((message) => ({
      kind: "assertion",
      message,
    }));
  }
  // An option removed or renamed upstream fails where it is used: it is known which one it is.
  const gone =
    /^The option `([^']+)' (?:defined in `[^']+' )?(?:can no longer be used|has been renamed)/.exec(
      text,
    );
  const option = gone?.[1];
  return [{ kind: "error", ...(option && { option }), message: text.split("\n")[0] as string }];
}

// The lines `--log-format internal-json` prints: `@nix {"action":"msg","level":0,"raw_msg":"..."}`.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function structured(output: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const line of output.split("\n")) {
    if (!line.startsWith("@nix ")) continue;
    let entry: { action?: string; level?: number; msg?: string; raw_msg?: string };
    try {
      entry = JSON.parse(line.slice("@nix ".length));
    } catch {
      continue;
    }
    if (entry.action !== "msg" || typeof entry.raw_msg !== "string") continue;
    if (entry.level === 0) errors.push(entry.raw_msg.trim());
    else if ((entry.msg ?? "").replace(ANSI, "").startsWith("evaluation warning:")) {
      warnings.push(entry.raw_msg.trim());
    }
  }
  return { errors, warnings };
}

/** The warnings and the error (if it failed) in what `nix-instantiate` or `nix eval` printed. */
export function parseEvaluation(output: string): Finding[] {
  const { errors, warnings } = structured(output);
  // Something that failed before Nix could say it as data prints plain text.
  if (errors.length === 0 && warnings.length === 0 && !output.includes("@nix ")) {
    return parsePlain(output);
  }
  const findings: Finding[] = warnings.map((message) => ({ kind: "warning", message }));
  // The innermost error is the last one.
  const last = errors[errors.length - 1];
  if (last !== undefined) findings.push(...classify(last));
  return findings;
}

/** The same, from the plain text Nix prints: the last `error:` is the innermost. */
function parsePlain(output: string): Finding[] {
  const findings: Finding[] = [];
  for (const [, message] of output.matchAll(/^evaluation warning: (.*)$/gm)) {
    findings.push({ kind: "warning", message: (message as string).trim() });
  }
  const at = output.lastIndexOf("error:");
  if (at < 0) return findings;
  return [...findings, ...classify(output.slice(at + "error:".length).trim())];
}
