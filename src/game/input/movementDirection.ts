/** Camera-relative input on the ground plane: x = strafe (right +), y = forward (+). */
export interface PlanarInput {
  readonly x: number;
  readonly y: number;
}

/** How fast a held keyboard direction may swing toward a newly pressed one (rad/s). 90° takes about 0.22 s. */
export const KEYBOARD_TURN_RATE = 7;
/** Changes wider than this (about 115°) are reversals: they apply at once so the crew turns on the spot instead of arcing into walls. */
export const KEYBOARD_SNAP_ANGLE = 2.0;

const IDLE_LENGTH = 0.01;

/**
 * Rotates the previous input direction toward the target at a limited rate, keeping the target's magnitude.
 * Keyboards only express eight directions; this lets W -> W+D -> D read as a curve rather than 45° steps.
 */
export function steerInputDirection(previous: PlanarInput | null, target: PlanarInput, dt: number): PlanarInput {
  const targetLength = Math.hypot(target.x, target.y);
  if (targetLength < IDLE_LENGTH) return { x: target.x, y: target.y };
  if (!previous || Math.hypot(previous.x, previous.y) < IDLE_LENGTH) return { x: target.x, y: target.y };

  const fromAngle = Math.atan2(previous.y, previous.x);
  const toAngle = Math.atan2(target.y, target.x);
  const difference = wrapAngle(toAngle - fromAngle);
  if (Math.abs(difference) > KEYBOARD_SNAP_ANGLE) return { x: target.x, y: target.y };

  const maxStep = KEYBOARD_TURN_RATE * Math.max(0, dt);
  const step = Math.max(-maxStep, Math.min(maxStep, difference));
  const angle = fromAngle + step;
  return { x: Math.cos(angle) * targetLength, y: Math.sin(angle) * targetLength };
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
