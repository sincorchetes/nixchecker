import { createProject, type ProjectFile } from "../../lib/project";

// The name of the text that was typed when files were opened: a file name, as the command line takes it.
const UNTITLED = "untitled.nix";

interface Parts {
  /** The list of the files of the project, shown when there are two or more. */
  select: HTMLSelectElement;
  source: HTMLTextAreaElement;
  /** Puts a text in the editor as the person's own edit would, and validates it. */
  replace: (text: string) => void;
  /** Called once the editor holds another file: what depended on the text before it is stale. */
  switched: () => void;
}

/**
 * The files of a configuration split in several, opened together: one in the editor and the others waiting. The
 * page checks the one in the editor, and the options the others declare are known to it.
 */
export function setupProject({ select, source, replace, switched }: Parts) {
  const project = createProject();

  const refresh = () => {
    select.replaceChildren(
      ...project.names().map((name, n) => {
        const option = new Option(name, String(n));
        option.selected = n === project.current();
        return option;
      }),
    );
    select.hidden = project.names().length < 2;
  };

  select.addEventListener("change", () => {
    source.value = project.select(Number(select.value), source.value);
    switched();
  });

  return {
    others: () => project.others(),
    names: () => project.names(),
    /** Opens files into the project. One file into an empty project is just the text of the editor, as always. */
    load(files: ProjectFile[]) {
      const [only] = files;
      if (!only) return;
      if (files.length === 1 && project.names().length === 0) return replace(only.text);
      // What was typed before is kept as a file of the project, not lost.
      if (project.names().length === 0 && source.value.trim()) {
        project.add([{ name: UNTITLED, text: source.value }]);
        project.select(0, source.value);
      }
      source.value = project.select(project.add(files), source.value);
      refresh();
      switched();
    },
  };
}
