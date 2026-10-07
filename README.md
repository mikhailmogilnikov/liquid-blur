# Liquid Blur

A glass material for the web: backdrop blur, fill, rims and springy press behaviors. No refraction.

Usage and API are documented in [packages/liquid-blur](packages/liquid-blur/README.md).

## Repository

| Path                     | What                                   |
| ------------------------ | -------------------------------------- |
| `packages/liquid-blur`   | The `liquid-blur` npm package |
| `apps/docs`              | Astro demo and docs site               |

## Development

Requires Node 22.12+ and pnpm.

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` builds the library in watch mode and starts the docs site at http://localhost:4321.

```bash
pnpm build
```

```bash
pnpm check-types
```

```bash
pnpm test
```

## Release

The library version is `1.0.0`. Release notes are in
[packages/liquid-blur/CHANGELOG.md](packages/liquid-blur/CHANGELOG.md).

From the repository root, validate the library and docs, then pack it:

```bash
pnpm test
pnpm check-types
pnpm build
mkdir -p dist/releases
npm pack ./packages/liquid-blur --pack-destination ./dist/releases
```

The result is `dist/releases/liquid-blur-1.0.0.tgz`. Packing runs the library build, and publishing
from the package directory also runs its type checks and tests. Inspect the archive before publishing:

```bash
tar -tzf dist/releases/liquid-blur-1.0.0.tgz
```

After release approval, publish from the package directory to run all lifecycle checks:

```bash
cd packages/liquid-blur
npm publish --access public
```

Publishing a previously packed tarball skips the package lifecycle checks; only use the verified
archive if publishing that way. Once npm publication succeeds, tag the approved release commit
`v1.0.0` and use the changelog for the GitHub release notes.

## License

MIT © Mikhail Mogilnikov. See [LICENSE](LICENSE).
