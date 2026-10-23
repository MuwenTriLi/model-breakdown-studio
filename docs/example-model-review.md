# Three-model library: technical check and next experiment

[Project overview](../README.md) · [Open the live app](https://meshroom-breakdown-studio.limuwen9.chatgpt.site)

## What is implemented

- The first visit loads Wood House. The right-side library contains three real GLB examples with thumbnails captured from those same models.
- Choosing a different model asks before replacing the current part edits and timeline. Cancel retains the current work.
- Import your own GLB and canvas drag-and-drop use the existing browser-local import route. The creator chooses presentation direction; the app extracts the supplied named meshes.
- Automatic work: download/decompress, read mesh hierarchy, fit the view and prepare outlines. Creator decisions: model replacement, orientation, framing, explode amount, part emphasis, timing and final export.
- Local revision: change explode amount or select another part without reimporting the whole model. Replacement is a separate, explicit action.

## Inputs and integrity

| Model | Mesh parts | Triangles | Compressed download |
| --- | ---: | ---: | ---: |
| Wood House | 18 | 19,148 | 0.1 MB |
| Press Manufacturing Line | 32 | 1,146,050 | 5.6 MB |
| Car Production Line | 30 | 3,131,487 | 14.7 MB |

Lossless gzip restores the supplied GLB bytes exactly, verified by SHA-256. Original source files are unchanged. No decimation, merging, hierarchy renaming or fabricated replacement geometry was used. These models are supplied presentation assets, excluded from the code's MIT license.

## Checks completed

The production build and 19 tests passed. These include exact model integrity, rejecting a truncated download, geometric explode-layout behavior and the existing application smoke checks. Browser checks exercised all three examples, switching and cancellation, explode/selection and the file-picker import plus direction confirmation for Wood House. The live public page also loads the default example and all three thumbnails.

The standalone TypeScript check still reports pre-existing missing Cloudflare worker type declarations in the database/worker files; the production bundle succeeds. This is a tooling limitation to resolve separately, not a claim of a clean whole-repository type check.

## What this does not prove

This is a bounded functional check on one desktop browser, not a user study or an export-quality certificate. Real-model MP4 export duration, every transition, mobile performance and repeated long editing sessions remain to verify. A fused mesh cannot provide semantic parts that are absent from the input. The software does not certify engineering accuracy or construction feasibility.

## Next creator experiment

Ask a creator unfamiliar with the app to explain one subsystem, then change its emphasis without starting over. Observe whether they find the model/import entry, understand mesh names, preserve useful context and correct the local result. Record completion time, interventions and revision count only after running the task.

Continue if the creator can complete and correct one useful explanation. Iterate if orientation, labels, framing or export blocks that task. Narrow the supported input scope if the file has no meaningful part hierarchy. Accept a deliverable only after checking the actual encoded output for framing, readable emphasis, timing and visual defects.
