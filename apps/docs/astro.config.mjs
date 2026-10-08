// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

/** Where the site lives; the packages' READMEs link here too */
const site = "https://liquid-web.mogilnikov.dev";

export default defineConfig({
  site,
  server: { port: 4321 },
  integrations: [mdx()],
  markdown: {
    // The same highlighting as <CodeBlock>: both themes, switched by the page's own
    shikiConfig: { themes: { light: "vitesse-light", dark: "vitesse-dark" }, defaultColor: false },
  },
  redirects: {
    // The whole documentation was one page before the packages split
    "/docs": "/blur",
  },
});
