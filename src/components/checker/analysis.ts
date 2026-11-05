import type { Version } from "../../lib/catalog";
import { checkText } from "../../lib/check-text";
import type { Report, TargetChoice } from "../../lib/validate";

/** What to validate: the text, which target and release to hold it against, and where catalogs live. */
export interface Request {
  text: string;
  choice: TargetChoice;
  release: Version;
  base: string;
  /** The texts of the other files of the project, whose declared options count as known. */
  others?: string[];
}

export interface Verdict {
  report: Report;
  /** Where the catalog it was checked against comes from. */
  source: string;
}

/** Checks a text the way every interface does (see `checkText`), keeping what the page shows. */
export async function validateText({
  text,
  choice,
  release,
  base,
  others,
}: Request): Promise<Verdict> {
  const { report, source } = await checkText(text, choice, release, base, undefined, others);
  return { report, source };
}
