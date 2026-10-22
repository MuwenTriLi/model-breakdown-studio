# Your sample models

Place approved, self-contained `.glb` files here, then add an entry in `app/sample-models.ts` with `file: "models/your-file.glb"`. Include a small preview at `public/samples/your-preview.svg` or PNG and set `preview` to that path.

Keep each movable component as a separate mesh with a meaningful name. Embed textures in the GLB. Apply object scale, put the model near the origin, and use consistent real-world units. Start with a modest file (roughly 20 MB or less for a quick demo); this is a recommendation, not an enforced format limit.

Bundled samples are downloadable by site visitors. Local files dropped into the viewer are processed in that browser and are not sent to a server. Do not bundle confidential assets.
