# Model Breakdown Studio

**Import a 3D model. Compose an exploded view. Turn it into an animation.**

An interactive browser tool by Muwen Li, developed with Codex. Previously called MESHROOM. It brings component inspection, controllable motion and video output into one workspace.

[Portfolio](https://github.com/MuwenTriLi/creative-workflows) · [Prepare a model](docs/model-preparation.md) · [Workflow](docs/workflow.md) · [Implementation](docs/architecture.md)

![The original three-panel studio, with selectable components, an exploded model, a sample shelf and animation controls](docs/media/studio-preview.jpg)

## Try the workflow

1. Click an example on the right, or drag it into the central viewport. Choose **+Z FRONT** for the included examples.
2. Select a named part in the left panel. Adjust **Explode** and rotation on the right; drag components while exploded to compose a layout.
3. Record a layout with **K** or add a component reveal cue to the timeline. Play the sequence, then open **Export**.
4. Start with a two-second **720p** MP4. Rendering happens in the browser. PNG still export is also available.

You can import your own `.glb`, `.obj` or `.fbx` with **Import model** or by dropping it onto the viewport. **GLB is the preferred handoff format** because it can package geometry and materials in one file. The technical presentation deliberately restyles imported meshes; this is not a material-accurate asset viewer.

## Run locally

Node.js 22.13+ and pnpm are required.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the Local URL printed in the terminal. If the port is occupied, use `pnpm dev --port 4186`.

```sh
pnpm test
pnpm build
pnpm preview --port 4186
```

## What this demonstrates

| Creator task | Interaction | Result |
| --- | --- | --- |
| Understand a model | Named mesh list, selection and visibility | A readable component hierarchy |
| Explain construction | Layered explode and manual part offsets | A composed breakdown view |
| Direct attention | Highlight and reveal cues | A timed explanation of individual parts |
| Produce a presentation | Timeline, rotation and local export | An MP4 or PNG generated in the browser |

This is a **browser tool with a reusable workflow**. A video output does not make it an agent Skill. The [workflow document](docs/workflow.md) records the repeatable method; this repository does not claim to include a tested, installable agent Skill.

## Current release status

Private review version. The static app is built and tested locally; a publicly accessible demo URL has not been published. The repository README links to documentation and source; GitHub does not run the interactive app inside the README.

- Three procedural examples are included: Keypad (9 parts), Orbital (8), Pavilion (12). These are clearly labeled test models; Muwen's curated GLB examples will replace or extend them.
- Verified: production build, 17 geometry/sample tests, sample click and drag import through GLB, orientation selection, exploded view and part highlighting.
- Verified output: one 1280 × 720 H.264 MP4, 30 fps, 60 frames / 2 seconds. Higher resolutions and arbitrary user models have not been benchmarked.
- GLB was exercised with the bundled examples. OBJ/FBX support is retained from the original prototype and is not independently verified in this release. Animation tracks from imported models are not played; this tool creates its own presentation motion.
- Browser WebGL and WebCodecs support are required. Large models and high-resolution exports can be slow. External texture dependencies should be embedded in the GLB.

## Source map

```text
app/
  page.tsx                 Original studio UI, viewer and export pipeline
  explode-layout.ts        Camera-aware layer layout and component offsets
  sample-models.ts         Example registry and procedural sample geometry
  globals.css              Original studio styling plus responsive sample shelf
public/
  models/                  Approved GLBs can be added here
  samples/                 Sample-card preview graphics
docs/                      Workflow, model preparation and implementation notes
tests/                     Geometry and sample integrity tests
```

Files dropped by a visitor are processed locally. Bundled examples are part of the website and can be downloaded by visitors. No account, API key, database or paid cloud service is needed to run this app locally.

This private repository is a review package. No open-source license is granted by this draft; dependency licenses remain with their respective owners.
