# 03 / Model Breakdown Studio — browser source

[← Project overview](../README.md) · [Hosted app](https://meshroom-breakdown-studio.limuwen9.chatgpt.site) · [Source manifest](source-manifest.json) · [Rights](RIGHTS.md)

This package contains byte-identical browser application files from hosted version **31**, source commit `dffc797f92668dffa055945c92c1041ecb098a17`, with a small local Vite/React runner. Its deployment was confirmed successful on October 26, 2026. It is a recorded snapshot, not an automatically synchronized mirror.

## Run locally

Use Node.js **22.13+** and pnpm **11.25.0**. From this directory:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm verify:source
pnpm dev
```

Open the localhost URL printed by Vite. To build and inspect the production bundle:

```sh
pnpm build
pnpm preview
```

Keep the browser tab in the foreground during export. Use a desktop browser with the required Canvas/WebGL/WebCodecs support; unavailable codecs and device limits still apply. Public model/package downloads require internet. Uploaded media is processed in the browser; never commit your own private inputs.

## What matches the hosted app

The files listed in `source-manifest.json` are copied without edits. `pnpm verify:source` checks their SHA-256 hashes. The manifest covers client code, its copied supporting modules and the included example media. Do not regenerate hashes to imply that a changed file is still the original deployed snapshot; document a new source revision.

## What differs

`main.tsx`, `index.html`, `vite.config.ts`, package/configuration files and the verification script provide a **local-only runner**. They replace the hosted Next-compatible server/layout wrapper. Authentication helpers, provider configuration, unused database/worker scaffolding, proprietary fonts and unused demo collections are omitted. Consequently, build artifacts and hosting behavior are not byte-identical to the live service. Existing absolute navigation links still open the public studios.

Focused existing check: `node --experimental-strip-types --test tests/example-models.test.mjs tests/explode-layout.test.mjs`. See the project validation page for what this does and does not prove.

## Files

- `app/`: browser workflow, state, rendering and styles.
- `main.tsx` / `vite.config.ts`: local entry and build setup.
- `source-manifest.json` / `scripts/verify-source.mjs`: recorded provenance and integrity check.
- `pnpm-lock.yaml`: pinned dependency resolutions.

Inspect the project overview for available examples, implementation details, existing export checks and remaining limitations. Publishing this snapshot does not change the live app or grant an additional media-reuse license.
