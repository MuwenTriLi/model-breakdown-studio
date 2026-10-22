import * as THREE from "three";

type Camera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
type Frame = { top: number; right: number; bottom: number; left: number };

// A displacement is a vector: inverse rotation alone loses the import scale.
// The inverse linear transform also handles nested, non-uniform and mirrored scales.
export function worldOffsetToLocal(offset: THREE.Vector3, parent: THREE.Object3D | null) {
  if (!parent) return offset.clone();
  parent.updateWorldMatrix(true, false);
  return offset.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(parent.matrixWorld).invert());
}

export function applyCanvasExplode(
  meshes: THREE.Mesh[],
  bases: Map<string, THREE.Vector3>,
  ranks: Map<string, number>,
  manualOffsets: Map<string, THREE.Vector3>,
  camera: Camera,
  frame: Frame,
  formation: number,
) {
  // Always solve from the assembled pose, so repeated calls cannot drift.
  for (const mesh of meshes) {
    const base = bases.get(mesh.uuid);
    if (base) mesh.position.copy(base);
  }
  for (const mesh of meshes) mesh.updateWorldMatrix(true, false);
  if (formation <= 0) return;
  camera.updateMatrixWorld(true);
  const visible = meshes.filter((mesh) => {
    for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
      if (!node.visible) return false;
    }
    return true;
  });
  const records = visible.flatMap((mesh) => {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    if (!bounds || bounds.isEmpty()) return [];
    const corners: THREE.Vector3[] = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          corners.push(new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld));
        }
      }
    }
    const min = Math.min(...corners.map(p => p.y));
    const max = Math.max(...corners.map(p => p.y));
    return [{ mesh, corners, height: (min + max) / 2, min, max }];
  }).sort((a, b) => a.height - b.height);
  if (!records.length) return;

  // Physical height AFTER the import orientation, never file order or Z depth.
  // Nearby centers share a translation, retaining same-level assemblies.
  const heightSpan = Math.max(...records.map(r => r.max)) - Math.min(...records.map(r => r.min));
  const tolerance = Math.max(heightSpan * 0.015, Number.EPSILON);
  const layers: Array<{ height: number; records: typeof records; lower: number; upper: number }> = [];
  for (const record of records) {
    const previous = layers.at(-1);
    if (previous && record.height - previous.height <= tolerance) previous.records.push(record);
    else layers.push({ height: record.height, records: [record], lower: -Infinity, upper: Infinity });
  }
  ranks.clear();
  const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const axis = new THREE.Vector4(0, 1, 0, 0).applyMatrix4(projection);
  const top = 1 - frame.top / 50;
  const bottom = -1 + frame.bottom / 50;
  const left = -1 + frame.left / 50;
  const right = 1 - frame.right / 50;
  // Clip-space inequalities remain linear for a world-Y translation, including
  // perspective depth. This preserves each part's original world X/Z footprint.
  const planes = [
    new THREE.Vector4(0, 1, 0, -bottom), new THREE.Vector4(0, -1, 0, top),
    new THREE.Vector4(1, 0, 0, -left), new THREE.Vector4(-1, 0, 0, right),
    new THREE.Vector4(0, 0, 1, 1), new THREE.Vector4(0, 0, -1, 1),
  ];
  let cannotFit = false;
  layers.forEach((layer, index) => {
    const rank = layers.length > 1 ? index / (layers.length - 1) : 0.5;
    for (const record of layer.records) {
      ranks.set(record.mesh.uuid, rank);
      for (const corner of record.corners) {
        const clip = new THREE.Vector4(corner.x, corner.y, corner.z, 1).applyMatrix4(projection);
        for (const plane of planes) {
          const slope = plane.dot(axis);
          const intercept = plane.dot(clip);
          if (Math.abs(slope) < 1e-10) {
            if (intercept < -1e-8) cannotFit = true;
          } else if (slope > 0) layer.lower = Math.max(layer.lower, -intercept / slope);
          else layer.upper = Math.min(layer.upper, -intercept / slope);
        }
      }
    }
  });
  const interval = (spread: number) => {
    let lower = -Infinity;
    let upper = Infinity;
    layers.forEach((layer, i) => {
      const rank = layers.length > 1 ? i / (layers.length - 1) : 0.5;
      lower = Math.max(lower, layer.lower - rank * spread);
      upper = Math.min(upper, layer.upper - rank * spread);
    });
    return { lower, upper, gap: lower - upper };
  };
  let spread = 0;
  let shift = 0;
  const limit = layers.at(-1)!.upper - layers[0].lower;
  if (!cannotFit && Number.isFinite(limit) && limit >= 0 && layers.length > 1) {
    let feasible = 0;
    // A convex interval search handles perspective views where a positive gap
    // can fit even if translating the assembled model alone cannot.
    if (interval(0).gap > 0) {
      let lo = 0;
      let hi = limit;
      for (let i = 0; i < 40; i++) {
        const a = lo + (hi - lo) / 3;
        const b = hi - (hi - lo) / 3;
        if (interval(a).gap < interval(b).gap) hi = b; else lo = a;
      }
      feasible = (lo + hi) / 2;
    }
    if (interval(feasible).gap <= 1e-8) {
      let hi = limit;
      for (let i = 0; i < 40; i++) {
        const mid = (feasible + hi) / 2;
        if (interval(mid).gap <= 0) feasible = mid; else hi = mid;
      }
      spread = feasible;
      const range = interval(spread);
      shift = (range.lower + range.upper) / 2;
    }
  }
  const targetCenters = new Map<THREE.Mesh, THREE.Vector3>();
  for (const record of records) {
    const mesh = record.mesh;
    // A shared nonnegative spread can only open the gaps, never invert layers.
    const vertical = (shift + (ranks.get(mesh.uuid) ?? 0) * spread) * formation;
    const worldOffset = new THREE.Vector3(0, vertical, 0);
    const manual = manualOffsets.get(mesh.uuid);
    if (manual) worldOffset.add(manual.clone().applyMatrix3(
      new THREE.Matrix3().setFromMatrix4(mesh.parent?.matrixWorld ?? new THREE.Matrix4()),
    ));
    targetCenters.set(mesh, mesh.getWorldPosition(new THREE.Vector3()).add(worldOffset));
  }
  // Parent meshes must move first. Convert absolute destinations through the
  // final parent matrix so a child does not inherit a second explosion offset.
  const depthOf = (mesh: THREE.Object3D) => {
    let depth = 0;
    for (let node = mesh.parent; node; node = node.parent) depth++;
    return depth;
  };
  for (const mesh of [...targetCenters.keys()].sort((a, b) => depthOf(a) - depthOf(b))) {
    const target = targetCenters.get(mesh)!.clone();
    mesh.parent?.updateWorldMatrix(true, false);
    mesh.position.copy(mesh.parent ? mesh.parent.worldToLocal(target) : target);
    mesh.updateWorldMatrix(false, false);
  }
}
