// Settles the static layer against the verdict of Nix: when Nix evaluates the module, what the
// analysis guessed about options and types is refuted; when it fails, a finding it already confirmed
// is not shown twice.
import type { Located } from "./report";

// The static codes a successful evaluation settles (the rest, like deprecations, Nix does not judge).
const SETTLED = new Set(["unknown-option", "type-mismatch"]);

export interface Reconciled {
  items: Located[];
  /** Static findings dropped because Nix accepted the module. */
  refuted: number;
  /** Static findings dropped because Nix confirmed the same place. */
  merged: number;
}

export function reconcile(items: Located[], evaluated: boolean): Reconciled {
  if (!evaluated) return { items, refuted: 0, merged: 0 };
  const confirmed = items.filter((i) => i.level === "evaluation" && i.severity === "error");
  const accepted = confirmed.length === 0;
  const same = (a: Located, b: Located) => !!a.line && a.line === b.line && a.col === b.col;
  let refuted = 0;
  let merged = 0;
  const kept = items.filter((i) => {
    if (i.level !== "static") return true;
    if (accepted && i.code && SETTLED.has(i.code)) {
      refuted++;
      return false;
    }
    if (confirmed.some((c) => same(c, i))) {
      merged++;
      return false;
    }
    return true;
  });
  return { items: kept, refuted, merged };
}
