// The findings of a run as SARIF 2.1.0, which GitHub code scanning shows as annotations on the files.
import type { Result } from "./check-file";

const LEVEL = { error: "error", warning: "warning" } as const;

export function toSarif(results: Result[]) {
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "nixchecker" } },
        results: results.flatMap((r) =>
          r.items.map((item) => ({
            // The static diagnostics have a code of their own; what Nix said is one rule.
            ruleId: item.code ?? item.level,
            level: LEVEL[item.severity],
            message: { text: item.message },
            ...(item.config && { properties: { configuration: item.config } }),
            locations: [
              {
                physicalLocation: {
                  // A finding in an imported module belongs to that file, not to the one checked.
                  artifactLocation: { uri: item.file ?? r.file },
                  ...(item.line && {
                    region: { startLine: item.line, startColumn: item.col ?? 1 },
                  }),
                },
              },
            ],
          })),
        ),
      },
    ],
  };
}
