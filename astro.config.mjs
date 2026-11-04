import { defineConfig } from "astro/config";

// Static output, published to GitHub Pages (see .github/workflows/deploy.yml).
export default defineConfig({
  // The production origin; GitHub Pages builds override it with SITE and BASE (see deploy.yml).
  site: process.env.SITE ?? "https://nixchecker.sincorchetes.tech",
  base: process.env.BASE ?? "/",
  output: "static",
  // The page's policy allows fonts from itself only: a small font file must not become a `data:` URL.
  vite: { build: { assetsInlineLimit: 0 } },
  trailingSlash: "always",
  i18n: {
    defaultLocale: "es",
    locales: ["es", "en"],
    routing: { prefixDefaultLocale: false },
  },
});
