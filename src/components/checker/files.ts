import type { Translate } from "./dom";

/** Larger than any configuration file; anything bigger is not Nix someone wrote to check here. */
export const MAX_BYTES = 512 * 1024;

interface Parts {
  source: HTMLTextAreaElement;
  /** Where a file can be dropped. */
  area: HTMLElement;
  input: HTMLInputElement;
  opener: HTMLElement;
  tr: Translate;
  say: (key: string, params?: Record<string, string | number>) => void;
  /** The text was replaced by the file's. */
  loaded: () => void;
}

/**
 * Opens a file from the picker or a drop into the editor. It is read right here, in the browser: the
 * file goes nowhere else.
 */
export function setupFiles({ source, area, input, opener, say, loaded }: Parts): void {
  const open = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return say("result.fileTooBig", { max: MAX_BYTES / 1024 });
    try {
      source.value = await file.text();
    } catch {
      return say("result.fileError");
    }
    loaded();
  };

  opener.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    void open(input.files?.[0]);
    // The same file can be chosen again after editing it elsewhere.
    input.value = "";
  });
  area.addEventListener("dragover", (event) => {
    event.preventDefault();
    area.classList.add("dropping");
  });
  area.addEventListener("dragleave", () => area.classList.remove("dropping"));
  area.addEventListener("drop", (event) => {
    event.preventDefault();
    area.classList.remove("dropping");
    void open(event.dataTransfer?.files[0]);
  });
}
