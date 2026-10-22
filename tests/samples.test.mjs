import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSampleModel, SAMPLE_MODELS } from '../app/sample-models.ts';
for(const sample of SAMPLE_MODELS) test(`${sample.title}: individually selectable named meshes and finite bounds`,()=>{
 const group=createSampleModel(sample.id);const names=new Set();let count=0;
 group.traverse(node=>{if(node.isMesh){count++;assert.ok(node.name);names.add(node.name);assert.ok(node.geometry.getAttribute('position').count>0);}});
 assert.equal(count,sample.parts);assert.equal(names.size,count);
 const box=new THREE.Box3().setFromObject(group);assert.ok(!box.isEmpty());assert.ok(box.min.toArray().every(Number.isFinite));
});
test('Unknown samples cannot silently show an unrelated model',()=>assert.throws(()=>createSampleModel('missing')));
