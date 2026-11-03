import type { Version } from "../../lib/catalog";
import { checkText } from "../../lib/check-text";
import type { Report, TargetChoice } from "../../lib/validate";

/** What to validate: the text, which target and release to hold it against, and where catalogs live. */
export interface Request {
  text: string;
  choice: TargetChoice;
  release: Version;
  base: string;
}

export interface Verdict {
  report: Report;
  /** Where the catalog it was checked against comes from. */
  source: string;
}

/** Checks a text the way every interface does (see `checkText`), keeping what the page shows. */
export async function validateText({ text, choice, release, base }: Request): Promise<Verdict> {
  const { report, source } = await checkText(text, choice, release, base);
  return { report, source };
}
