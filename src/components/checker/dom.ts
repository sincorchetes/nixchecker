/** Translates a message key; `{placeholders}` are filled from `params`. */
export type Translate = (key: string, params?: Record<string, string | number>) => string;

// Everything shown is built with textContent only: option names come from user input.
export const el = (tag: string, className: string, content = ""): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = content;
  return node;
};
