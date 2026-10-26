import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { applyCanvasExplode, worldOffsetToLocal } from '../app/explode-layout.ts';

const frame = { top: 8, bottom: 12.5, left: 8, right: 8 };
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} vs ${b}`);
function fixture(units, nested = false) {
  const root = new THREE.Group();
  root.scale.setScalar(1 / units);
  root.position.set(0.2, -0.1, 0.3);
  const parent = new THREE.Group();
  if (nested) {
    parent.rotation.set(0.1, 0.2, 0.3);
    parent.scale.set(-0.8, 1.2, 0.6);
  }
  root.add(parent);
  const meshes = [0, 1, 2, 3].map((i) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(units, units * 0.2, units * 0.3));
    mesh.position.set((i % 2) * units * 0.1, (i - 1.5) * units * 0.4, (i - 1.5) * units * 0.5);
    parent.add(mesh);
    return mesh;
  });
  root.updateMatrixWorld(true);
  return { root, meshes, bases: new Map(meshes.map(m => [m.uuid, m.position.clone()])),
    ranks: new Map(meshes.map((m, i) => [m.uuid, i])), manual: new Map() };
}
function camera(mode, aspect) {
  const c = mode === 'ortho' ? new THREE.OrthographicCamera(-3 * aspect, 3 * aspect, 3, -3, 0.01, 100)
    : new THREE.PerspectiveCamera(45, aspect, 0.01, 100);
  c.position.set(4, 3, 8);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  return c;
}
function projected(mesh, c) {
  mesh.updateWorldMatrix(true, false);
  mesh.geometry.computeBoundingBox();
  const b = mesh.geometry.boundingBox;
  const points = [];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    points.push(new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld).project(c));
  }
  return { bottom: Math.min(...points.map(p => p.y)), top: Math.max(...points.map(p => p.y)),
    left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)) };
}
const apply = (f, c, amount, crop = frame) => applyCanvasExplode(f.meshes, f.bases, f.ranks, f.manual, c, crop, amount);

for (const mode of ['ortho', 'perspective']) for (const aspect of [9 / 16, 16 / 9]) {
  test(`${mode} ${aspect}: consistent screen layout from millimetres to kilometre-scale imports`, () => {
    let reference;
    for (const units of [0.001, 1, 100, 1e6]) {
      const f = fixture(units, true);
      const c = camera(mode, aspect);
      apply(f, c, 1);
      const bounds = f.meshes.map(m => projected(m, c));
      near(bounds[0].bottom, -0.75, 'bottom edge at safe frame');
      near(bounds.at(-1).top, 0.84, 'top edge at safe frame');
      for (const b of bounds) {
        assert.ok(b.bottom >= -0.750001 && b.top <= 0.840001);
        assert.ok(b.left >= -0.840001 && b.right <= 0.840001);
      }
      if (reference) bounds.forEach((b, i) => Object.keys(b).forEach(k => near(b[k], reference[i][k], `${k} independent of units`)));
      reference = bounds;
      apply(f, c, 1);
      f.meshes.forEach((m, i) => near(projected(m, c).bottom, bounds[i].bottom, 'no cumulative drift'));
      apply(f, c, 0.5);
      const halfway = f.meshes[0].getWorldPosition(new THREE.Vector3());
      apply(f, c, 0);
      const assembled = f.meshes[0].getWorldPosition(new THREE.Vector3());
      f.meshes.forEach(m => assert.ok(m.position.equals(f.bases.get(m.uuid))));
      apply(f, c, 1);
      const full = f.meshes[0].getWorldPosition(new THREE.Vector3());
      near(halfway.distanceTo(assembled.clone().lerp(full, 0.5)), 0, 'slider interpolates continuously');
    }
  });
}

test('recomputes for orbit, zoom, frame changes, and hidden endpoint parts', () => {
  const f = fixture(100);
  const c = camera('perspective', 9 / 16);
  apply(f, c, 1);
  c.position.set(-5, 2, 7);
  c.lookAt(0.1, 0.2, 0);
  c.zoom = 1.2;
  c.aspect = 16 / 9;
  c.updateProjectionMatrix();
  f.meshes[0].visible = false;
  apply(f, c, 1, { top: 15, bottom: 20, left: 12, right: 12 });
  near(projected(f.meshes[1], c).bottom, -0.6, 'first visible part reaches bottom');
  near(projected(f.meshes.at(-1), c).top, 0.7, 'last visible part reaches top');
});

test('drag displacement respects nested rotated nonuniform parent scale', () => {
  const f = fixture(100, true);
  const m = f.meshes[1];
  const worldDelta = new THREE.Vector3(0.3, 0.5, -0.2);
  const before = m.getWorldPosition(new THREE.Vector3());
  m.position.add(worldOffsetToLocal(worldDelta, m.parent));
  near(m.getWorldPosition(new THREE.Vector3()).sub(before).distanceTo(worldDelta), 0, 'drag follows pointer distance');
});

test('nested mesh parents do not double the child displacement', () => {
  const f = fixture(100);
  f.meshes[0].attach(f.meshes[3]);
  f.bases.set(f.meshes[3].uuid, f.meshes[3].position.clone());
  const c = camera('ortho', 9 / 16);
  apply(f, c, 1);
  near(projected(f.meshes[0], c).bottom, -0.75, 'parent edge');
  near(projected(f.meshes[3], c).top, 0.84, 'child edge');
});

test('manual layout offsets survive repeated solving and hide at zero', () => {
  const f = fixture(100);
  const c = camera('ortho', 9 / 16);
  apply(f, c, 1);
  const before = f.meshes[1].getWorldPosition(new THREE.Vector3());
  const delta = new THREE.Vector3(0.2, 0.1, 0);
  f.manual.set(f.meshes[1].uuid, worldOffsetToLocal(delta, f.meshes[1].parent));
  apply(f, c, 1);
  near(f.meshes[1].getWorldPosition(new THREE.Vector3()).distanceTo(before.add(delta)), 0, 'manual adjustment');
  apply(f, c, 0);
  assert.ok(f.meshes[1].position.equals(f.bases.get(f.meshes[1].uuid)));
});

test('empty and single-part imports stay finite', () => {
  const f = fixture(1);
  const c = camera('ortho', 1);
  f.meshes = f.meshes.slice(0, 1);
  apply(f, c, 1);
  assert.ok(f.meshes[0].position.toArray().every(Number.isFinite));
  f.meshes = [];
  apply(f, c, 1);
});

function house(zUp = false) {
  const root = new THREE.Group();
  // Deliberately misleading Z order and identical object origins: the true
  // heights live in the geometry, as they often do in OBJ architectural models.
  const definitions = [
    ['roof', [2.2, 0.3, 1.7], [0, 2.6, -0.1]],
    ['back-window', [0.5, 0.6, 0.08], [0.5, 1.1, 0.9]],
    ['foundation', [2.3, 0.25, 2], [0, -0.2, 0]],
    ['front-window', [0.5, 0.6, 0.08], [-0.5, 1.1, -0.9]],
    ['walls', [2, 1.9, 1.8], [0, 1.1, 0]],
  ];
  const meshes = definitions.map(([name, size, position]) => {
    const geometry = new THREE.BoxGeometry(...size);
    geometry.translate(...position);
    if (zUp) geometry.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry);
    mesh.name = name;
    root.add(mesh);
    return mesh;
  });
  if (zUp) root.rotation.x = -Math.PI / 2;
  root.updateMatrixWorld(true);
  return { root, meshes, bases: new Map(meshes.map(m => [m.uuid, m.position.clone()])),
    ranks: new Map(meshes.map((m, i) => [m.uuid, i])), manual: new Map() };
}
function worldCenter(mesh) {
  mesh.updateWorldMatrix(true, false);
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
}

for (const mode of ['ortho', 'perspective']) for (const zUp of [false, true]) {
  test(`${mode}, Z-up import ${zUp}: roof stays above walls and foundation; same-level parts stay together`, () => {
    const f = house(zUp);
    const c = camera(mode, 9 / 16);
    // Match the app's framing step: keep the assembled footprint inside the
    // portrait safe width, leaving space for vertical separation.
    c.zoom = 0.75;
    c.updateProjectionMatrix();
    c.position.set(6, 4, 10);
    c.lookAt(0, 1, 0);
    c.updateMatrixWorld(true);
    const original = new Map(f.meshes.map(m => [m.name, worldCenter(m)]));
    const originalCenters = f.meshes.map(m => worldCenter(m));
    for (const amount of [0, 250 / 1500, 0.5, 1]) {
      apply(f, c, amount);
      const centers = new Map(f.meshes.map(m => [m.name, worldCenter(m)]));
      assert.ok(centers.get('roof').y > centers.get('walls').y);
      assert.ok(centers.get('walls').y > centers.get('foundation').y);
      for (const name of ['back-window', 'front-window', 'walls']) {
        near(centers.get(name).y - original.get(name).y,
          centers.get('walls').y - original.get('walls').y, 'one translation for the wall layer');
      }
      f.meshes.forEach((m, i) => {
        near(worldCenter(m).x, originalCenters[i].x, 'preserve original X');
        near(worldCenter(m).z, originalCenters[i].z, 'preserve original Z');
      });
      const assembledGap = original.get('roof').y - original.get('foundation').y;
      const gap = centers.get('roof').y - centers.get('foundation').y;
      assert.ok(gap >= assembledGap - 1e-8, 'layers never compress or cross');
      if (amount === 1) assert.ok(gap > assembledGap + 0.2, 'opens meaningful structural gaps');
    }
    const expected = new Map(f.meshes.map(m => [m.name, worldCenter(m)]));
    f.meshes.reverse();
    apply(f, c, 1);
    f.meshes.forEach(m => near(worldCenter(m).distanceTo(expected.get(m.name)), 0, 'independent of file order'));
    c.position.set(-6, 4, -10);
    c.lookAt(0, 1, 0);
    c.updateMatrixWorld(true);
    apply(f, c, 1);
    const roof = f.meshes.find(m => m.name === 'roof');
    const base = f.meshes.find(m => m.name === 'foundation');
    assert.equal(f.ranks.get(roof.uuid), 1, 'orbit cannot change the top layer');
    assert.equal(f.ranks.get(base.uuid), 0, 'orbit cannot change the bottom layer');
  });
}
