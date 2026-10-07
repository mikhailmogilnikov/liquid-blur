# Liquid Blur

A glass material for the web: backdrop blur, fill, rims and springy press behaviors. No refraction.

Usage and API are documented in [packages/liquid-blur](packages/liquid-blur/README.md).

## Repository

| Path                     | What                                   |
| ------------------------ | -------------------------------------- |
| `packages/liquid-blur`   | The library, published as `liquid-blur` |
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

## License

MIT © Mikhail Mogilnikov
