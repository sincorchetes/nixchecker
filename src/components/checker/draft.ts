// Keeping the text between visits is opt-in, and it stays in this browser's own storage.
const FLAG = "nixchecker.remember";
const TEXT = "nixchecker.draft";

// The storage can throw (private windows, blocked site data): remembering then just does not happen.
function safely(action: () => void): void {
  try {
    action();
  } catch {
    // Nothing to do: the page works the same without it.
  }
}

/** Restores the saved text when the person asked for it, and keeps saving it while they do. */
export function setupDraft(source: HTMLTextAreaElement, checkbox: HTMLInputElement): void {
  const save = () => safely(() => localStorage.setItem(TEXT, source.value));

  safely(() => {
    if (localStorage.getItem(FLAG) !== "1") return;
    checkbox.checked = true;
    source.value ||= localStorage.getItem(TEXT) ?? "";
  });
  source.addEventListener("input", () => checkbox.checked && save());
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      safely(() => localStorage.setItem(FLAG, "1"));
      save();
    } else {
      safely(() => {
        localStorage.removeItem(FLAG);
        localStorage.removeItem(TEXT);
      });
    }
  });
}
