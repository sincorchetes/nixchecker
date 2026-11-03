import type { Report } from "../../lib/validate";

/** The report as data: the same facts the page shows, for a ticket or a pull request. */
export const reportData = (report: Report, catalog: string, release: string) => ({
  target: report.target,
  release,
  catalog,
  coverage: {
    checked: report.coverage.total - report.coverage.skipped.length,
    total: report.coverage.total,
  },
  diagnostics: report.diagnostics,
});

/** Offers `data` as a file download; nothing is sent anywhere. */
export function download(name: string, data: unknown): void {
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
