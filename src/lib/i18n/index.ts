import { en } from "./en";
import { es, type MessageKey } from "./es";

export type { MessageKey } from "./es";
export type Lang = "es" | "en";

export const LANGS: Lang[] = ["es", "en"];
export const messages: Record<Lang, Record<MessageKey, string>> = { es, en };

/** Replaces `{name}` placeholders in a message template. */
export function format(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => String(params[name] ?? whole));
}
