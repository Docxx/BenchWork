# Releasing BenchWork

GitHub Actions checks every push and builds Windows releases from version
tags.

## Every push

The **CI** workflow runs on every branch and pull request:

- Lint: types, ESLint and Prettier (`pnpm lint`)
- Unit tests (`pnpm exec vitest run`)
- Rust tests (`cargo test`)
- Playwright flows (`pnpm test:e2e`)
- Relay tests (Python `unittest`)

A failed Playwright run keeps its traces as a download on the run's page
for 14 days.

## A Windows release

1. Set the same version in `package.json`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml`, and commit it.
2. Tag the commit and push the tag:

   ```bash
   git tag v0.25.0
   ```

   ```bash
   git push origin v0.25.0
   ```

3. The **Release** workflow checks the tag matches all three versions,
   runs lint, the unit tests and the Rust tests, builds the installer, and
   makes a **draft** release with the installer and `SHA256SUMS.txt`.
4. On GitHub, open the draft, write the notes, and publish it.

If a release for that tag already exists, the workflow leaves it alone and
keeps the build as a download on the run's page instead.

To try a release build without making a release, open **Actions >
Release > Run workflow** on GitHub. It runs the same checks and build for
the version in the files and keeps the installer as a download on the run.

Publishing to the relay's update catalogue, for the in-app updater, stays a
manual step with `scripts/publish-update.ps1`, because it needs the
server's SSH key. Download the installer from the release (or the run) to
use with it.

The installer is not code-signed yet, so Windows shows a SmartScreen
warning when it is first run.
