# Implementation

The original MESHROOM interface is retained: component list on the left, 3D viewport in the center, parameters on the right, and timeline below. A compact example shelf sits above the right-side controls. Narrow windows stack the controls rather than hiding them.

React manages interface state. Three.js loads and renders geometry, handles selection and camera controls, and draws the technical outline treatment. `explode-layout.ts` maps layered and manually positioned components into the active camera's safe frame. The timeline stores presentation cues and layout snapshots. WebCodecs and mp4-muxer encode video in the browser.

## Import path

```text
Example click / example drag / local file
  → File object
  → GLB, OBJ or FBX loader
  → choose orientation
  → register named meshes
  → inspect, explode, highlight and animate
```

Procedural examples are serialized into a GLB in memory and passed through the same importer. File-based examples are fetched from this app's own static assets. Draco decoder files are bundled from the installed Three.js package so base paths remain portable.

## Deployment boundary

Vite produces a static `dist/` directory with relative asset paths. This package does not include the old hosting platform's authentication, database, worker or account configuration. It has no server dependency. It also does not publish itself or enable GitHub Actions or Pages.

The repository remains private. A public interactive URL is a separate deployment decision. A private repository should not be treated as password protection for a published static site.

## Validation performed

- TypeScript checking and production compilation passed.
- 17 tests passed: screen-space layout, differing units and camera projections, nested transformed parents, visibility, manual offsets, empty/single-part cases, and sample mesh identity.
- Browser checks: Keypad default view, Orbital click → GLB import → orientation → 8 named meshes; Pavilion drag → GLB import → orientation → 12 named meshes; explode and individual highlight; desktop/narrow panel access.
- Actual export inspected with ffprobe: H.264, 1280 × 720, 30 fps, 60 frames, 2.0 seconds.

Not yet verified: curated user GLBs, compressed GLBs, OBJ/FBX examples, imported textures, all aspect-ratio/export-quality combinations, or end-to-end browser automation. No performance benchmark is claimed. The retained mp4-muxer dependency is deprecated upstream; migration is a future maintenance task.
