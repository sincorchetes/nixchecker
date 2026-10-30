/** Orders strings by code unit: stable across locales, which the generated catalogs rely on. */
export const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
