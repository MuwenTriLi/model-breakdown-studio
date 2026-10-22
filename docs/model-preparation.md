# Prepare a model

Recommended handoff: a self-contained `.glb` file, plus an optional PNG/JPG preview and a short description of the effect you want to demonstrate.

1. Keep parts that need separate movement or highlighting as separate meshes. A single merged mesh is one selectable part; the tool does not infer hidden components.
2. Give objects readable names: `Roof_Panel`, `Frame`, `Gear_01`, and so on.
3. Use consistent units, apply scale where appropriate, and place the object near the origin. Check the export in a clean file before handing it off.
4. Embed materials and textures in the GLB. The studio uses its own technical line/highlight presentation rather than preserving final render materials.
5. For a quick interview demo, start with a modest model, ideally around 20 MB or less. This is a practical recommendation, not a guaranteed performance threshold.

## Importing your own model in the original app

Choose **IMPORT MODEL** and select your file. Keep the parts separate before export so they can be selected and highlighted individually. A personal import does not add the file to this GitHub repository.

## Adding a model to the local adaptation shelf

The sample shelf below belongs to the separate local adaptation; it has not been added to the original hosted interface.

Put the approved GLB in `public/models/` and a preview in `public/samples/`. Add an entry to `SAMPLE_MODELS` in `app/sample-models.ts`:

```ts
{ id: 'my-model', title: 'My model', parts: 12,
  preview: 'samples/my-model.png', file: 'models/my-model.glb' }
```

Use the actual number of independent meshes for `parts`. Run `pnpm build`, then click and drag the card in the local preview and verify orientation, selection, explode, and a short export. No interface redesign is required.

For review, send the GLB and preview directly in the chat or provide their local paths. They can be copied into the deployment folder without modifying original files. A file uploaded locally through the app is not automatically saved into the repository or sample shelf.

Only bundle models that may be shared with the intended audience. Every model included in a deployed browser app is retrievable by its visitors.
