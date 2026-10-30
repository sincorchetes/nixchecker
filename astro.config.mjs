import { defineConfig } from "astro/config";

// Static output: Railway serves `dist/` with server/serve.ts.
export default defineConfig({
  // The production origin; GitHub Pages builds override it with SITE and BASE (see deploy.yml).
  site: process.env.SITE ?? "https://nixchecker.sincorchetes.tech",
  base: process.env.BASE ?? "/",
  output: "static",
  trailingSlash: "always",
  i18n: {
    defaultLocale: "es",
    locales: ["es", "en"],
    routing: { prefixDefaultLocale: false },
  },
});
