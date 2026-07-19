export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TransformState {
  position: Vec3;
  facingYaw: number;
}

export type EntityId = string;

export function copyVec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

export function distanceSquared(a: Vec3, b: Vec3): number {
  const x = a.x - b.x;
  const y = a.y - b.y;
  const z = a.z - b.z;
  return x * x + y * y + z * z;
}
