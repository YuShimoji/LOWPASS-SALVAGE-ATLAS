import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Euler,
  InstancedMesh,
  type Material,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Replace a box's per-face 0..1 UVs with world-space planar UVs so one tiling texture keeps
 * the same texel size on every wall, shelf and floor regardless of the box dimensions.
 */
export function applyWorldUv(geometry: BufferGeometry, offset: Vec3Like, tileMeters: number): void {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  if (!position || !normal || !uv) return;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index) + offset.x;
    const y = position.getY(index) + offset.y;
    const z = position.getZ(index) + offset.z;
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));
    if (ny >= nx && ny >= nz) uv.setXY(index, x / tileMeters, z / tileMeters);
    else if (nx >= nz) uv.setXY(index, z / tileMeters, y / tileMeters);
    else uv.setXY(index, x / tileMeters, y / tileMeters);
  }
  uv.needsUpdate = true;
}

/**
 * Vertex colors that darken the lower part of a surface (flood waterline) and slightly the top
 * (soot under the ceiling). Materials using it must set `vertexColors: true`.
 */
export function applyWaterlineStain(
  geometry: BufferGeometry,
  offsetY: number,
  waterline: number,
  strength: number,
): void {
  const position = geometry.getAttribute("position");
  if (!position) return;
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index) + offsetY;
    const below = y <= waterline ? 1 - strength : y <= waterline + 0.35 ? 1 - strength * 0.45 : 1;
    const soot = y > 2.9 ? 0.82 : 1;
    const shade = below * soot;
    colors[index * 3] = shade;
    colors[index * 3 + 1] = shade * 1.01;
    colors[index * 3 + 2] = shade * 0.98;
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
}

export interface ClutterPiece {
  readonly position: Vec3Like;
  readonly scale: Vec3Like;
  readonly rotation?: Vec3Like;
}

/** One draw call for many unit boxes (products on shelves, floating debris, crate stacks). */
export function createBoxClutter(name: string, material: Material, pieces: readonly ClutterPiece[]): InstancedMesh {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, pieces.length);
  mesh.name = name;
  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const position = new Vector3();
  const scale = new Vector3();
  pieces.forEach((piece, index) => {
    euler.set(piece.rotation?.x ?? 0, piece.rotation?.y ?? 0, piece.rotation?.z ?? 0);
    quaternion.setFromEuler(euler);
    position.set(piece.position.x, piece.position.y, piece.position.z);
    scale.set(piece.scale.x, piece.scale.y, piece.scale.z);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Deterministic PRNG so dressing is identical on every visit and in every screenshot. */
export function createSeededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
