/** A file of the project the page is checking: its name, and its text as of the last time it was left. */
export interface ProjectFile {
  name: string;
  text: string;
}

/**
 * Whether a file of a folder (its path from the folder) is part of a configuration: a Nix file or nix.conf, not
 * what a tool left in it (hidden directories, dependencies, a build result).
 */
export function isConfigFile(path: string): boolean {
  const parts = path.split("/");
  const name = parts.at(-1) as string;
  if (parts.slice(1, -1).some((p) => p.startsWith(".") || p === "node_modules" || p === "result")) {
    return false;
  }
  return name.endsWith(".nix") || name === "nix.conf";
}

/**
 * The files of a configuration split in several, as the page holds them: one is in the editor (the current
 * one) and the others wait. The page checks the current one, and what the others declare counts as known.
 */
export function createProject() {
  const files: ProjectFile[] = [];
  let current = -1;

  return {
    names: (): string[] => files.map((f) => f.name),
    current: (): number => current,
    /** Adds files (one with a name already there takes its place); the index of the first of them. */
    add(added: ProjectFile[]): number {
      let first = -1;
      for (const file of added) {
        const at = files.findIndex((f) => f.name === file.name);
        if (at >= 0) files[at] = file;
        else files.push(file);
        if (first < 0) first = at >= 0 ? at : files.length - 1;
      }
      return first;
    },
    /** Leaves the current file with the text the editor has, and makes `index` the current one: its text. */
    select(index: number, editorText: string): string {
      const left = files[current];
      if (left) left.text = editorText;
      current = index;
      return (files[index] as ProjectFile).text;
    },
    /** The texts of the files other than the current one. */
    others: (): string[] => files.filter((_, i) => i !== current).map((f) => f.text),
  };
}

export type Project = ReturnType<typeof createProject>;
