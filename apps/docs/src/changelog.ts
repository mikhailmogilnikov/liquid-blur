import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Loader } from "astro/loaders";

/**
 * Every release, from the packages' changelogs as Changesets writes them: the four packages' own,
 * and, from before 2.0, each feature's own package's, kept here as they were (`src/changelog/`).
 * What went out together is one release (one tag's commit), a change it shipped in several packages
 * told once. Dates are the tags': without them (a shallow clone) a release is a version, undated.
 */
const LIVE = ["core", "react", "vue", "svelte"];
const ARCHIVED = ["blur", "morph", "indicator", "drag", "lift"];
const PACKAGES = [...LIVE, ...ARCHIVED];
/** Changesets' kinds of change, most breaking first, and how the page heads them */
const KINDS = ["Major Changes", "Minor Changes", "Patch Changes"];
const HEADS = ["Breaking", "New", "Fixed"];

type Change = { kind: number; text: string; packages: string[] };
type Version = { pkg: string; version: string; changes: Map<string, Change>; notes: string };
type Release = {
  at: string;
  versions: { pkg: string; version: string }[];
  changes: Map<string, Change>;
  notes: [string, string][];
};

/** A list's items, each with what's indented under it, unindented */
const items = (md: string) => {
  const out: string[] = [];
  for (const line of md.split("\n")) {
    if (line.startsWith("- ")) out.push(line.slice(2));
    else if (out.length) out[out.length - 1] += `\n${line.replace(/^ {2}/, "")}`;
  }
  return out.map((item) => item.trim());
};

/** A changelog's versions: its changes by Changesets' hash, and what else was written by hand */
function parse(pkg: string, md: string): Version[] {
  return md
    .split(/^## /m)
    .slice(1)
    .map((part) => {
      const [version, ...rest] = part.split("\n");
      const [intro, ...sections] = rest.join("\n").split(/^### /m);
      const changes = new Map<string, Change>();
      let notes = intro.trim();
      for (const section of sections) {
        const [heading, ...lines] = section.split("\n");
        const body = lines.join("\n").trim();
        const kind = KINDS.indexOf(heading.trim());
        if (kind < 0) {
          notes += `\n\n**${heading.trim()}**\n\n${body}`;
          continue;
        }
        for (const item of items(body)) {
          // A package that only took core's new version has nothing of its own to tell
          if (item.startsWith("Updated dependencies")) continue;
          const hashed = /^([0-9a-f]{7,40}): ([\s\S]*)$/.exec(item);
          changes.set(hashed?.[1] ?? item, { kind, text: hashed?.[2] ?? item, packages: [pkg] });
        }
      }
      return { pkg, version: version.trim(), changes, notes: notes.trim() };
    });
}

/** Each tag's commit and when it was made: `@fluidkit/core@2.0.0` → its release */
function tags(root: string) {
  try {
    const out = execFileSync(
      "git",
      ["for-each-ref", "--format=%(refname:short) %(objectname) %(creatordate:iso-strict)", "refs/tags"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return new Map(
      out
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name, sha, at] = line.split(" ");
          return [name, { sha, at }] as const;
        }),
    );
  } catch {
    return new Map<string, { sha: string; at: string }>();
  }
}

/** A release told in Markdown: its changes by kind, which packages a change was in when not all */
function told(release: Release) {
  const all = release.versions.length;
  const changes = [...release.changes.values()];
  const parts: string[] = [];
  HEADS.forEach((head, kind) => {
    const these = changes.filter((c) => c.kind === kind);
    if (!these.length) return;
    const list = these.map((c) => {
      const who = all > 1 && c.packages.length < all ? `**${c.packages.join(", ")}:** ` : "";
      return `- ${who}${c.text.replace(/\n/g, "\n  ")}`;
    });
    parts.push(`**${head}**\n\n${list.join("\n")}`);
  });
  for (const [pkg, notes] of release.notes) parts.push(all > 1 ? `**@fluidkit/${pkg}**\n\n${notes}` : notes);
  return parts.join("\n\n") || "Only a newer `@fluidkit/core`.";
}

export function changelog(): Loader {
  return {
    name: "changelog",
    load: async ({ config, store, parseData, renderMarkdown }) => {
      const root = fileURLToPath(new URL("../..", config.root));
      const read = (path: string) => readFileSync(new URL(path, config.root), "utf8");
      const versions = [
        ...LIVE.flatMap((pkg) => parse(pkg, read(`../../packages/${pkg}/CHANGELOG.md`))),
        ...ARCHIVED.flatMap((pkg) => parse(pkg, read(`src/changelog/${pkg}.md`))),
      ];
      const tagged = tags(root);

      const releases = new Map<string, Release>();
      for (const v of versions) {
        const two = Number(v.version.split(".")[0]) >= 2;
        // Since 2.0 the four come out at one version: a package published by hand has no tag, core does
        const tag =
          tagged.get(`@fluidkit/${v.pkg}@${v.version}`) ??
          (two ? tagged.get(`@fluidkit/core@${v.version}`) : undefined);
        const key = tag?.sha ?? (two ? v.version : `${v.pkg}@${v.version}`);
        const release: Release = releases.get(key) ?? {
          at: tag?.at ?? "",
          versions: [],
          changes: new Map(),
          notes: [],
        };
        releases.set(key, release);
        release.versions.push({ pkg: v.pkg, version: v.version });
        for (const [hash, change] of v.changes) {
          const known = release.changes.get(hash);
          if (!known) release.changes.set(hash, { ...change, packages: [...change.packages] });
          else {
            known.packages.push(v.pkg);
            known.kind = Math.min(known.kind, change.kind);
          }
        }
        if (v.notes) release.notes.push([v.pkg, v.notes]);
      }

      store.clear();
      const sorted = [...releases.values()].sort((a, b) => b.at.localeCompare(a.at));
      for (const [order, release] of sorted.entries()) {
        release.versions.sort((a, b) => PACKAGES.indexOf(a.pkg) - PACKAGES.indexOf(b.pkg));
        const version = release.versions[0].version;
        const two = Number(version.split(".")[0]) >= 2;
        const date = release.at.slice(0, 10);
        const id = two
          ? `v${version.replaceAll(".", "-")}`
          : `${date || "undated"}-${release.versions.map((v) => `${v.pkg}-${v.version.replaceAll(".", "-")}`).join("-")}`;
        const body = told(release);
        const data = await parseData({ id, data: { order, two, date, versions: release.versions } });
        store.set({ id, data, body, rendered: await renderMarkdown(body) });
      }
    },
  };
}
