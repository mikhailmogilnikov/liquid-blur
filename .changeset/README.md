# Changesets

Every change that a user of a package would notice gets a changeset: run `pnpm changeset`, pick the
packages and the bump, and write one line for the changelog. Tests, docs and tooling don't need one.

- `patch`: fixes, nothing anyone has to change
- `minor`: something new, nothing breaks
- `major`: something breaks; the `data-lw-*` contract in `@liquid-web/core` changes only here, for
  every package at once

On `main`, the release workflow keeps a "Version packages" pull request up to date with the pending
changesets. Merging it bumps the versions, writes the changelogs and publishes to npm.
