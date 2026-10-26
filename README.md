# 03 / Model Breakdown Studio

**Turn a multi-part GLB into an exploded explanation, a focused detail and a timed presentation.**

**[Open the studio →](https://meshroom-breakdown-studio.limuwen9.chatgpt.site)** · [Current browser source + local setup](studio/) · [Workflow and decisions](docs/product-case.md) · [Implementation](docs/implementation.md) · [Validation](docs/example-model-review.md) · [All projects](https://github.com/MuwenTriLi/creative-workflows#selected-work)

[![Model Breakdown Studio opens with Press Manufacturing Line in an exploded view](https://raw.githubusercontent.com/MuwenTriLi/creative-workflows/main/media/model-breakdown-editor.png)](https://meshroom-breakdown-studio.limuwen9.chatgpt.site)

## Input → output

| Input | Output |
| --- | --- |
| GLB with separate, meaningfully named mesh parts; presentation aspect and intent | Exploded layout, selected-part emphasis and a reviewed animation or still |
| Three supplied examples: Press Manufacturing Line, Wood House, Car Production Line | Immediate inspection without upload or account setup |

**Implementation:** React/TypeScript, Three.js, browser-local model processing, timeline state and WebCodecs/MP4 encoding. The tool explains available geometry; it does not infer semantic components from a fused mesh.

## Try it in one minute

1. Open the app: **Press Manufacturing Line** starts exploded, with 32 named mesh parts.
2. Compare **Assembled** and **Exploded view**, then select a component from the left panel.
3. Adjust **Exploded structure**, framing or emphasis without reimporting the model.
4. Review **EXPORT 4K** settings, render a short result and play the downloaded MP4 through.
5. Use **Change model · 3 examples** or import your own GLB. Confirm replacing the current edits when switching.

[Model preparation](docs/model-preparation.md) · [Complete export guide](https://github.com/MuwenTriLi/creative-workflows/blob/main/docs/studio-delivery.md) · [Selected output films](showcase/README.md)

## Workflow and creator control

```text
Named geometry → inspect parts → compose exploded layout
  → select emphasis → key timing → review encoded output
```

The system loads geometry, calculates separation and renders accepted settings. The creator chooses the component to explain, orientation, spatial relationships, framing, timing and acceptance. Local changes to explode amount or the focal part do not require a new model import.

**Contribution:** Muwen Li defines the creative direction and interaction workflow, drawing on AEC and visual-production experience; Codex assists implementation. Imported model authorship is separate from application authorship. The [product case](docs/product-case.md) records hypotheses, current behavior and proposed capabilities.

## Source versions

**Start in [`studio/`](studio/).** It contains the browser code and real example assets from hosted version **31**, with a local-only Vite runner. File hashes identify the copied source. The hosting wrapper is not part of this package.

The root [`app/`](app/) and root package remain the **earlier local adaptation with procedural examples**. They are preserved for existing users and are not the current hosted implementation. [Exact version mapping, commands and license scope](docs/source-versions.md).

## Evidence and next decision

The hosted synthetic and real Press-model fixtures each produced a 2 s / 3840 × 2160 / 30 fps H.264 file with 60 decoded frames. The three supplied GLBs preserve 18, 32 and 30 named mesh parts respectively. These are bounded historical checks, not broad import or GPU compatibility claims. [Recorded model checks](docs/example-model-review.md).

The new local runner builds, and its 17 focused geometry/model checks pass; this does not repeat the hosted 4K export check. [Publication verification](docs/source-versions.md#verification-for-this-publication).

Next: record one real input-to-export session with one local framing correction, then observe an unfamiliar creator doing the task. OBJ/FBX, longer exports and fused/poorly structured models need their own checks. [Recording outline](showcase/walkthrough.md).

## Project files

```text
model-breakdown-studio/
├── README.md                 Project overview and workflow
├── studio/                   Current browser-source snapshot + local runner
│   ├── app/                  Studio, example loading and explode layout
│   ├── public/examples/      Three real GLBs and previews
│   ├── tests/                Geometry and model-integrity checks
│   └── source-manifest.json  Hosted version, commit and copied-file hashes
├── docs/                     Implementation, preparation, evidence and versions
├── showcase/                 Selected films, stills and provenance
├── app/ + root package       Earlier local adaptation (preserved)
└── tests/                    Earlier adaptation's checks
```

## Code and media rights

The existing MIT license continues to cover the earlier root adaptation's original code. The newly published `studio/` snapshot is source for inspection and is explicitly outside that earlier grant; dependencies keep their own licenses. Models, films, renders, screenshots and company materials retain their ownership. See [MEDIA-RIGHTS.md](MEDIA-RIGHTS.md) and [studio/RIGHTS.md](studio/RIGHTS.md).
