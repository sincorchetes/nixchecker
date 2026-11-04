// The button that switches between the light and the dark theme. Without a choice the page follows the
// system; a choice is kept in this browser, and `Base.astro` applies it before the first paint.
const button = document.getElementById("theme");
const system = matchMedia("(prefers-color-scheme: dark)");
const root = document.documentElement;

const current = (): "light" | "dark" =>
  root.dataset.theme === "dark" || root.dataset.theme === "light"
    ? root.dataset.theme
    : system.matches
      ? "dark"
      : "light";

// The button says what it will switch to.
const label = () => {
  if (button) button.textContent = button.dataset[current() === "dark" ? "light" : "dark"] ?? "";
};

button?.addEventListener("click", () => {
  const next = current() === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    // A browser that keeps nothing still switches for this visit.
  }
  label();
});
system.addEventListener("change", label);
label();
