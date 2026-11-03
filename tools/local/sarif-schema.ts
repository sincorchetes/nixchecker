// Checks a SARIF log against the official SARIF 2.1.0 schema (OASIS), as GitHub code scanning reads it.
// Formats are not checked (that would need a plugin): the structure, the required fields and the ranges are.
import Ajv from "ajv";

const validate = new Ajv({ strict: false, validateFormats: false }).compile(
  await Bun.file(`${import.meta.dir}/schemas/sarif-2.1.0.json`).json(),
);

/** What the schema finds wrong with `log`, one line per problem; empty when it is valid. */
export const problemsWith = (log: unknown): string[] =>
  validate(log) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
