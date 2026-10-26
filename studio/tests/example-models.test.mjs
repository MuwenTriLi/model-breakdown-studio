import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { decodeExample, EXAMPLE_MODELS } from '../app/example-models.ts';

const hashes = {
  'wood-house': 'a180561f95f02b4181e30418fcc7e9c68fcc1e22263e45830da08d92f6e94a77',
  'press-manufacturing-line': '6c8f2cfddc2874b9366d256d897d9edac42b7e66a2e70836d5ee08985e60c3ae',
  'car-production-line': '5bed342b45dfcc7545b701d556568de18049c92484f03c22c5118f0fcb094ad5',
};
for (const model of EXAMPLE_MODELS) {
  test(`${model.name}: compressed delivery retains the complete source geometry and named parts`, async () => {
    const bytes = await readFile(new URL(`../public${model.url}`, import.meta.url));
    const buffer = await decodeExample(bytes);
    assert.equal(createHash('sha256').update(new Uint8Array(buffer)).digest('hex'), hashes[model.id]);
    const length = new DataView(buffer).getUint32(12, true);
    const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
    assert.equal(gltf.nodes.filter(n => n.mesh !== undefined).length, model.parts);
    assert.ok(gltf.nodes.filter(n => n.mesh !== undefined).every(n => n.name));
    assert.deepEqual(await decodeExample(new Uint8Array(buffer)), buffer);
  });
}
test('invalid or truncated delivery is rejected before replacing a model', async () => {
  await assert.rejects(decodeExample(new Uint8Array([0,1,2])), /incomplete or invalid/);
  const bytes = await readFile(new URL('../public/examples/wood-house.glb.gz', import.meta.url));
  await assert.rejects(decodeExample(bytes.subarray(0,50)));
});
