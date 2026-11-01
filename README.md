# Fluid Kit

Fluid interfaces for the web, after iOS 26: glass, morphs, indicators, drags, long-press menus and
layouts that move, on interruptible springs that keep their speed. For plain JavaScript, React, Vue
or Svelte. The features don't import each other: they coordinate through DOM attributes (`data-fk-*`,
see [the contract](https://fluidkit.mogilnikov.dev/core#contract)), and what an app doesn't use isn't
in its bundle.

**[Documentation](https://fluidkit.mogilnikov.dev)**

## Packages

One package for each framework, all four at the same version. An app installs one.

| Package | What |
| --- | --- |
| [`@fluidkit/core`](packages/core/README.md) | Every feature without a framework, the spring they share, and the stylesheet |
| [`@fluidkit/react`](packages/react/README.md) | Every feature's components and hooks, and all of core (React 18+) |
| [`@fluidkit/vue`](packages/vue/README.md) | Every feature's components and composables, and all of core (Vue 3.5+) |
| [`@fluidkit/svelte`](packages/svelte/README.md) | Every feature's components and runes, and all of core (Svelte 5.29+) |

| Feature | What |
| --- | --- |
| [Liquid Blur](https://fluidkit.mogilnikov.dev/blur) | A glass material: backdrop blur, fill, rims, press effects, glass that merges between shapes |
| [Morph](https://fluidkit.mogilnikov.dev/morph) | Animates one element into another and back, on interruptible springs |
| [Indicator](https://fluidkit.mogilnikov.dev/indicator) | One element that moves to whatever is hovered, pressed or selected: menus, tabs, segmented controls |
| [Drag](https://fluidkit.mogilnikov.dev/drag) | Drag with rubber-band edges and flick-aware snap points: sheets, swipe actions, switches |
| [Lift](https://fluidkit.mogilnikov.dev/lift) | Long-press to lift anything above the page and open your menu, like iOS context menus |
| [Layout](https://fluidkit.mogilnikov.dev/layout) | Elements move to their new places when the layout changes: lists, grids, sections that open |
| [Motion](https://fluidkit.mogilnikov.dev/motion) | Apple's springs and transitions by name, for every feature and for CSS |

In the repository, `packages/core/src` has a folder for each feature's engine, and
`packages/{react,vue,svelte}/src` a file or folder for each feature's components. `apps/docs` is the
docs site: one page per feature, written in MDX in `apps/docs/src/content/docs/`, with live demos.

## Development

Requires Node 22.22+ (`.node-version` has 24) and pnpm. Tasks run on [Vite+](https://viteplus.dev)
(`vp`): packages build with `vp pack` and test with `vp test`, and the scripts below run each
package's task with `vp run -r`, in dependency order and cached.

```bash
pnpm install
```

Installing also sets up the git hooks (`.vite-hooks/`): before a commit, staged files are formatted
and linted; a commit message has to be a [conventional commit](https://www.conventionalcommits.org),
`type(scope): subject`, with an optional scope: a package (`core`, `react`, `vue`, `svelte`), a
feature (`blur`, `morph`, `indicator`, `drag`, `lift`, `layout`, `motion`), or `docs`, `repo`, `ci`,
`deps` and `release`.

| Script | What |
| --- | --- |
| `pnpm dev` | Builds the packages, then watches them and starts the docs site at http://localhost:4321 |
| `pnpm build` | Builds every package and the docs site |
| `pnpm check-types` | Type checks every package and the docs site |
| `pnpm test` | Runs every package's tests |
| `pnpm fmt` / `pnpm lint` | Formats (TS and JSON; CSS and Markdown are laid out by hand) / lints |
| `pnpm check` | Everything CI checks: format, lint, types, tests |
| `pnpm changeset` | Describes a change for the changelogs and versions |

## Release

Releases run on [changesets](https://github.com/changesets/changesets). A change a user would notice
comes with a changeset: run `pnpm changeset`, pick the packages and the bump, write one line for the
changelog, and commit it with the change. The four packages are a fixed group: they always come out
together, at the same version, whichever of them changed. CI asks for one when a package's `src` or
`package.json` changed; `pnpm changeset --empty` says none is needed. See
[.changeset/README.md](.changeset/README.md).

On `main`, the release workflow keeps a "Version packages" pull request up to date with the pending
changesets. Merging it bumps the versions, writes the changelogs, publishes to npm with provenance
and tags each package (`@fluidkit/core@2.0.0`). Publishing goes through pnpm, which turns the
framework packages' `workspace:*` dependency on `@fluidkit/core` into that same exact version.

It publishes with [Trusted Publishing](https://docs.npmjs.com/trusted-publishers): no npm token is
stored anywhere. Each package on npm trusts this repository's `release.yml`, and the workflow proves
who it is with its own OIDC token. A new package has to be published once by hand first
(`pnpm release`, with your npm two-factor code), then trust the workflow in its settings on npm.
`pnpm exec changeset publish-plan` shows what would go out.

## License

MIT © Mikhail Mogilnikov. See [LICENSE](LICENSE).
