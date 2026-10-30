import { defineConfig } from "astro/config";

// Static output: Railway serves `dist/` with server/serve.ts.
export default defineConfig({
  site: process.env.SITE,
  base: process.env.BASE ?? "/",
  output: "static",
  trailingSlash: "always",
  i18n: {
    defaultLocale: "es",
    locales: ["es", "en"],
    routing: { prefixDefaultLocale: false },
  },
});
