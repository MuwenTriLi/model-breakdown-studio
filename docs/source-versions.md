# Source versions and local use

[← Project](../README.md) · [Current source](../studio/) · [Earlier adaptation](../app/)

## Current hosted browser source

Hosted version **31**, source `dffc797f92668dffa055945c92c1041ecb098a17`, was confirmed successfully deployed on October 26, 2026 at the [public studio](https://meshroom-breakdown-studio.limuwen9.chatgpt.site).

[`studio/source-manifest.json`](../studio/source-manifest.json) identifies byte-identical copied client files, example geometry and supporting modules. A small Vite/React runner replaces the hosting wrapper; it is not a copy of the provider's authentication, server or deployment configuration. Published hashes establish source provenance, not identical runtime behavior on every machine.

From the repository root:

```sh
cd studio
pnpm install --frozen-lockfile --ignore-scripts
pnpm verify:source
pnpm test
pnpm build
pnpm dev
```

Use Node 22.13+ and pnpm 11.25.0. Open the localhost URL shown by Vite. The local app includes the same three real model inputs. Existing navigation links open the public studios. Keep private imports out of the repository.

## Earlier adaptation

The root package and `app/` preserve the separate local implementation formerly presented here. It has three procedural samples, its own tests and its existing MIT grant. To run that version, stay at the repository root and use the root package's documented scripts (`pnpm install --frozen-lockfile`, `pnpm dev`, `pnpm test`, `pnpm build`). Do not use its sample behavior as evidence for the hosted implementation.

The earlier root commit before this publication is `e17f4c1825de05d9f700d148fb2fd6cfa2facc8f`. No source history was rewritten and no live site was redeployed for this publication.

## Verification for this publication

The new package installed its pinned dependencies independently with install scripts disabled, completed a production build, matched 16 copied-file hashes and passed **17** existing tests. These cover compressed GLB integrity and named parts, safe-frame projection at different units and aspect ratios, nested transforms, no repeated-solve drift and manual offsets.

The older export checks remain in the [functional record](https://github.com/MuwenTriLi/creative-workflows/blob/main/docs/functional-review.md). They were not rerun by this documentation/source publication. [Collection publication checks](https://github.com/MuwenTriLi/creative-workflows/blob/main/docs/publication-checks.md) record browser and link checks separately.

## Rights and maintenance

The earlier MIT grant does not silently extend to the newly published hosted-source snapshot or its imported models. [Rights boundary](../MEDIA-RIGHTS.md). Draco decoder files retain their [Apache 2.0 license](../studio/public/draco/LICENSE.txt).

To publish a new snapshot, identify the successful deployed source revision, update only the intended client files, record a new manifest and rerun build, geometry and browser checks. If a local fix is not deployed, label it as a local change rather than replacing the recorded hosted revision.
