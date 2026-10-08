import { defineConfig } from "vite-plus";

/**
 * The workspace's own checks, run from the root: formatting, lint, and what the pre-commit hook
 * runs on staged files. Each package's build and tests live in its own vite.config.ts.
 */
export default defineConfig({
  fmt: {
    printWidth: 120,
    // Laid out by hand: aligned gradient stops and one-line rules in the CSS, tables in the docs
    ignorePatterns: ["**/*.css", "**/*.md", "**/*.mdx", "**/*.astro", "pnpm-lock.yaml", "**/dist/**", "**/.astro/**"],
  },
  lint: {
    ignorePatterns: ["**/dist/**", "**/.astro/**"],
  },
  staged: {
    "*.{ts,tsx,js,mjs,json}": ["vp fmt", "vp lint --fix"],
  },
});
