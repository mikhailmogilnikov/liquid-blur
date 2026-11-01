import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { changelog } from "./changelog";

/** One page per package: `src/content/docs/blur.mdx` is /blur */
const docs = defineCollection({
  loader: glob({ pattern: "*.mdx", base: "./src/content/docs" }),
  schema: z.object({
    /** The package, as installed */
    package: z.string(),
    /** Its name in the nav and the page title */
    name: z.string(),
    /** One sentence for search results and link previews */
    description: z.string(),
    /** The page's opening, under its title; inline HTML */
    intro: z.string(),
    /** Order in the nav */
    order: z.number(),
    /**
     * The frameworks the page has docs of their own for, besides TypeScript without one. With another
     * one chosen, the page shows its TypeScript docs
     */
    frameworks: z.array(z.enum(["react", "vue", "svelte"])).default(["react"]),
  }),
});

/** Every release, newest first (`order`): `two` since 2.0, when the four packages came out together */
const releases = defineCollection({
  loader: changelog(),
  schema: z.object({
    order: z.number(),
    two: z.boolean(),
    /** When it was tagged, `YYYY-MM-DD`; empty without the tags */
    date: z.string(),
    versions: z.array(z.object({ pkg: z.string(), version: z.string() })),
  }),
});

export const collections = { docs, releases };
