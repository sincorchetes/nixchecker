import { isConfigFile, type ProjectFile } from "../../lib/project";
import type { Translate } from "./dom";

/** Larger than any configuration file; anything bigger is not Nix someone wrote to check here. */
export const MAX_BYTES = 512 * 1024;
/** More files than a configuration is split in; a folder with more is not one. */
export const MAX_FILES = 100;

interface Parts {
  /** Where files can be dropped. */
  area: HTMLElement;
  input: HTMLInputElement;
  opener: HTMLElement;
  /** The picker of a whole folder, and its button. */
  folder: HTMLInputElement;
  folderOpener: HTMLElement;
  tr: Translate;
  say: (key: string, params?: Record<string, string | number>) => void;
  /** Opens files into the project (and validates the first). */
  load: (files: ProjectFile[]) => void;
}

/**
 * Opens files from the picker, a folder or a drop into the project. They are read right here, in the
 * browser: the files go nowhere else.
 */
export function setupFiles({ area, input, opener, folder, folderOpener, say, load }: Parts): void {
  const open = async (list: File[], whole = false) => {
    const chosen = (
      whole ? list.filter((f) => isConfigFile(f.webkitRelativePath || f.name)) : list
    ).slice(0, MAX_FILES);
    const files: ProjectFile[] = [];
    for (const file of chosen) {
      if (file.size > MAX_BYTES) return say("result.fileTooBig", { max: MAX_BYTES / 1024 });
      try {
        files.push({ name: file.webkitRelativePath || file.name, text: await file.text() });
      } catch {
        return say("result.fileError");
      }
    }
    load(files);
  };

  // The picker of a folder is a file picker told so; the markup has no attribute for it.
  folder.setAttribute("webkitdirectory", "");
  opener.addEventListener("click", () => input.click());
  folderOpener.addEventListener("click", () => folder.click());
  input.addEventListener("change", () => {
    void open([...(input.files ?? [])]);
    // The same file can be chosen again after editing it elsewhere.
    input.value = "";
  });
  folder.addEventListener("change", () => {
    void open([...(folder.files ?? [])], true);
    folder.value = "";
  });
  area.addEventListener("dragover", (event) => {
    event.preventDefault();
    area.classList.add("dropping");
  });
  area.addEventListener("dragleave", () => area.classList.remove("dropping"));
  area.addEventListener("drop", (event) => {
    event.preventDefault();
    area.classList.remove("dropping");
    void open([...(event.dataTransfer?.files ?? [])]);
  });
}
