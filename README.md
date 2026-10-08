# liquid-web

A family of small, framework-agnostic libraries for fluid interfaces on the web. Each package works
on its own, on plain DOM; where two meet, they read attributes the other sets (`data-lw-*`, see
[the contract](https://liquid-web.mogilnikov.dev/core#contract)) instead of importing each other.

**[Documentation](https://liquid-web.mogilnikov.dev)**

## Packages

| Package | What |
| --- | --- |
| [`@liquid-web/blur`](packages/blur/README.md) | A glass material: backdrop blur, fill, rims, press behaviors, glass that melts between shapes |
| [`@liquid-web/morph`](packages/morph/README.md) | A control grows into a panel and shrinks back, on interruptible springs; any element |
| [`@liquid-web/core`](packages/core/README.md) | What they share: the spring, and the DOM contract |

`apps/docs` is the docs site: one page per package, written in MDX in
`apps/docs/src/content/docs/`, with live demos.

## Development

Requires Node 22.22+ (`.node-version` has 24) and pnpm. Tasks run on [Vite+](https://viteplus.dev)
(`vp`): packages build with `vp pack` and test with `vp test`, and the scripts below run each
package's task with `vp run -r`, in dependency order and cached.

```bash
pnpm install
```

Installing also sets up the git hooks (`.vite-hooks/`): before a commit, staged files are formatted
and linted; a commit message has to be a [conventional commit](https://www.conventionalcommits.org),
`type(scope): subject`, with an optional scope from `core`, `blur`, `morph`, `docs`, `repo`, `ci`,
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

Releases run on [changesets](https://github.com/changesets/changesets). A change a user of a package
would notice comes with a changeset: run `pnpm changeset`, pick the packages and the bump, write one
line for the changelog, and commit it with the change. CI asks for one when a package's `src` or
`package.json` changed; `pnpm changeset --empty` says none is needed. See
[.changeset/README.md](.changeset/README.md).

On `main`, the release workflow keeps a "Version packages" pull request up to date with the pending
changesets. Merging it bumps the versions, writes the changelogs, publishes to npm with provenance
and tags each package (`@liquid-web/blur@1.1.0`). Publishing goes through pnpm, which turns the
`workspace:^` dependencies on `@liquid-web/core` into real version ranges.

The first release publishes every package at `1.0.0` as it is, with no changeset: `pnpm release`
publishes whatever version isn't on npm yet. It needs the `liquid-web` organization on npm and an
`NPM_TOKEN` secret in the repository; `pnpm exec changeset publish-plan` shows what would go out.

## License

MIT © Mikhail Mogilnikov. See [LICENSE](LICENSE).
