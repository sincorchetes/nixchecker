/**
 * What real Nix said about a module, read from the text it prints. It is the second layer of the
 * validator: the static analysis of the page can only guess at what evaluation settles, so a finding
 * here is confirmed (an option does not exist, a value is not of the type, an assertion fails).
 */
export interface Finding {
  kind: "unknown-option" | "type-error" | "assertion" | "warning" | "error";
  /** The option involved, when there is one. */
  option?: string;
  /** The type that was expected, for a type error. */
  expected?: string;
  /** The file that defines the option, as Nix names it (the module system gives no line). */
  file?: string;
  message: string;
}

// The names between `quotes' in "The options `a', `b' do not exist".
const quoted = (text: string): string[] =>
  [...text.matchAll(/`([^']+)'/g)].map((m) => m[1] as string);

// The messages of a "Failed assertions:" list: each starts with "- " and may go on over more lines.
function assertions(block: string): string[] {
  const messages: string[] = [];
  for (const line of block.split("\n")) {
    if (/^\s*- /.test(line)) messages.push(line.replace(/^\s*- /, "").trim());
    else if (messages.length > 0 && line.trim()) messages[messages.length - 1] += ` ${line.trim()}`;
  }
  return messages;
}

/** The warnings and the error (if it failed) in the output of `nix-instantiate`/`nix eval`. */
export function parseEvaluation(output: string): Finding[] {
  const findings: Finding[] = [];
  for (const [, message] of output.matchAll(/^evaluation warning: (.*)$/gm)) {
    findings.push({ kind: "warning", message: (message as string).trim() });
  }
  // The innermost error is the last one; what follows says what is wrong.
  const at = output.lastIndexOf("error:");
  if (at < 0) return findings;
  const text = output.slice(at + "error:".length).trim();

  const file = /^\s*- In `([^']+)'/m.exec(text)?.[1];
  const missing = /^The options? (.+?) (?:does|do) not exist/.exec(text);
  const wrongType = /^A definition for option `([^']+)' is not of type `(.+?)'\./.exec(text);
  if (missing) {
    const options = quoted(missing[1] as string);
    for (const option of options) {
      findings.push({
        kind: "unknown-option",
        option,
        ...(file && options.length === 1 && { file }),
        message: `The option ${option} does not exist`,
      });
    }
  } else if (wrongType) {
    const [, option, expected] = wrongType as unknown as [string, string, string];
    findings.push({
      kind: "type-error",
      option,
      expected,
      ...(file && { file }),
      message: `A definition for ${option} is not of type ${expected}`,
    });
  } else if (text.startsWith("Failed assertions:")) {
    for (const message of assertions(text.slice("Failed assertions:".length))) {
      findings.push({ kind: "assertion", message });
    }
  } else {
    findings.push({ kind: "error", message: text.split("\n")[0] as string });
  }
  return findings;
}
