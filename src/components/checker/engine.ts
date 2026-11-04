import { CatalogError } from "../../lib/catalog";
import { type Request, type Verdict, validateText } from "./analysis";

/** A bug of ours while validating, as opposed to a catalog that could not be had (`CatalogError`). */
export class InternalError extends Error {
  override name = "InternalError";
}

interface Reply {
  id: number;
  verdict?: Verdict;
  failed?: "catalog" | "internal";
  message?: string;
}

const internal = (error: unknown) =>
  error instanceof CatalogError
    ? error
    : new InternalError(error instanceof Error ? error.message : String(error), { cause: error });

interface Waiting {
  request: Request;
  resolve: (verdict: Verdict) => void;
  reject: (error: Error) => void;
}

/**
 * Validates in a worker. Where one cannot start, or it dies, the same job runs in the page: slower on a
 * large file, but the result is the same.
 */
export function createEngine(): (request: Request) => Promise<Verdict> {
  const waiting = new Map<number, Waiting>();
  let worker: Worker | undefined;
  let count = 0;

  const inPage = ({ request, resolve, reject }: Waiting) =>
    validateText(request).then(resolve, (error) => reject(internal(error)));

  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", ({ data }: MessageEvent<Reply>) => {
      const job = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.verdict) job?.resolve(data.verdict);
      else if (data.failed === "internal") job?.reject(new InternalError(data.message ?? ""));
      else job?.reject(new CatalogError("catalog"));
    });
    worker.addEventListener("error", () => {
      worker = undefined;
      const jobs = [...waiting.values()];
      waiting.clear();
      for (const job of jobs) void inPage(job);
    });
  } catch {
    worker = undefined;
  }

  return (request) =>
    new Promise<Verdict>((resolve, reject) => {
      const job = { request, resolve, reject };
      if (!worker) return void inPage(job);
      const id = count++;
      waiting.set(id, job);
      worker.postMessage({ id, request });
    });
}
