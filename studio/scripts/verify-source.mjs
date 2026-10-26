import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('source-manifest.json', root), 'utf8'));
for (const entry of manifest.files) {
  const bytes = await readFile(new URL(entry.path, root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256,
    `Snapshot changed: ${entry.path}. Document the revision before updating the manifest.`);
}
console.log(`${manifest.files.length} source/media hashes match the recorded hosted source snapshot.`);
