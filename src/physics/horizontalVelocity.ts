/**
 * Short acceleration / deceleration ramps for the character controller.
 * Top speeds (WALK_SPEED / SPRINT_SPEED) are unchanged; only the approach to them is smoothed,
 * so a tap no longer teleports to full speed and releasing no longer stops on the same frame.
 */
export const MOVE_ACCELERATION = 24; // m/s^2: 0 -> 3.2 m/s in ~0.13 s, 0 -> 5.1 m/s in ~0.21 s
export const MOVE_DECELERATION = 30; // m/s^2: 3.2 m/s -> 0 in ~0.11 s
export const TURN_ACCELERATION = 46; // m/s^2 applied to the velocity component that opposes the new input

export interface PlanarVelocity {
  x: number;
  z: number;
}

/** Move `current` toward `target` (both m/s) by at most the allowed acceleration for this step. */
export function approachPlanarVelocity(current: PlanarVelocity, target: PlanarVelocity, dt: number): PlanarVelocity {
  const targetSpeed = Math.hypot(target.x, target.z);
  const currentSpeed = Math.hypot(current.x, current.z);
  let rate = targetSpeed > currentSpeed ? MOVE_ACCELERATION : MOVE_DECELERATION;
  if (targetSpeed > 0.001 && currentSpeed > 0.001) {
    // Reversing direction should feel decisive rather than slide like ice.
    const alignment = (current.x * target.x + current.z * target.z) / (currentSpeed * targetSpeed);
    if (alignment < 0.5) rate = TURN_ACCELERATION;
  }
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const gap = Math.hypot(dx, dz);
  const maxStep = rate * dt;
  if (gap <= maxStep || gap < 1e-6) return { x: target.x, z: target.z };
  return { x: current.x + (dx / gap) * maxStep, z: current.z + (dz / gap) * maxStep };
}
