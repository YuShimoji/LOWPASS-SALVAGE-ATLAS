import { MathUtils, PerspectiveCamera, Raycaster, Vector3, type Object3D } from "three";

export const MIN_CAMERA_PITCH = -0.08;
export const MAX_CAMERA_PITCH = 0.72;
export const MIN_CAMERA_DISTANCE = 2.3;
export const MAX_CAMERA_DISTANCE = 6.5;
export const DEFAULT_CAMERA_DISTANCE = 4.1;
export const MISSION_START_MAX_PITCH = 0.42;

export interface CameraDiagnostics {
  readonly desiredDistance: number;
  readonly effectiveDistance: number;
  readonly occlusionActive: boolean;
  readonly yaw: number;
  readonly pitch: number;
}

export class ThirdPersonCamera {
  readonly camera = new PerspectiveCamera(58, 1, 0.08, 80);
  private readonly target = new Vector3();
  /** Look target that trails the character slightly, so starts and stops read as motion. */
  private readonly followTarget = new Vector3();
  private readonly desiredPosition = new Vector3();
  private readonly cameraDirection = new Vector3();
  private readonly raycaster = new Raycaster();
  private initialized = false;
  private yaw = 0;
  private pitch = 0.28;
  private desiredDistance = DEFAULT_CAMERA_DISTANCE;
  private smoothedDistance = DEFAULT_CAMERA_DISTANCE;
  private effectiveDistance = DEFAULT_CAMERA_DISTANCE;
  private occlusionActive = false;

  applyLookDelta(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * 0.0026;
    // Moving the mouse or stick up looks up: the camera drops behind the shoulder (lower pitch).
    this.pitch = MathUtils.clamp(this.pitch + deltaY * 0.0021, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH);
  }

  getYaw(): number {
    return this.yaw;
  }

  applyWheelZoom(deltaY: number): void {
    this.desiredDistance = MathUtils.clamp(
      this.desiredDistance + deltaY * 0.004,
      MIN_CAMERA_DISTANCE,
      MAX_CAMERA_DISTANCE,
    );
  }

  applyZoomInput(direction: number, frameSeconds: number): void {
    if (Math.abs(direction) < 0.01) return;
    this.desiredDistance = MathUtils.clamp(
      this.desiredDistance + direction * 2.6 * frameSeconds,
      MIN_CAMERA_DISTANCE,
      MAX_CAMERA_DISTANCE,
    );
  }

  getDiagnostics(): CameraDiagnostics {
    return {
      desiredDistance: this.desiredDistance,
      effectiveDistance: this.effectiveDistance,
      occlusionActive: this.occlusionActive,
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }

  reset(yaw = 0, pitch = 0.28): void {
    this.yaw = yaw;
    this.pitch = MathUtils.clamp(pitch, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH);
    this.initialized = false;
  }

  /** QA/evidence only: pin a camera pose so before/after screenshots share the same framing. */
  setPoseForQa(yaw: number, pitch: number, distance: number): void {
    this.yaw = yaw;
    this.pitch = MathUtils.clamp(pitch, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH);
    this.desiredDistance = MathUtils.clamp(distance, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
    this.smoothedDistance = this.desiredDistance;
    this.initialized = false;
  }

  resetFromStart(playerPosition: { x: number; y: number; z: number }, cameraPosition: { x: number; y: number; z: number }): void {
    const dx = cameraPosition.x - playerPosition.x;
    const dz = cameraPosition.z - playerPosition.z;
    const horizontal = Math.hypot(dx, dz);
    const pitch = Math.atan2(cameraPosition.y - (playerPosition.y + 1.03), Math.max(horizontal, 0.001));
    // Authored start cameras can sit high; keep the opening view at shoulder height (≈24°).
    this.reset(Math.atan2(dx, dz), Math.min(pitch, MISSION_START_MAX_PITCH));
  }

  update(playerPosition: Vector3, frameSeconds: number, occluders: readonly Object3D[]): void {
    this.target.set(playerPosition.x, playerPosition.y + 0.38, playerPosition.z);
    if (!this.initialized) this.followTarget.copy(this.target);
    else this.followTarget.lerp(this.target, 1 - Math.exp(-14 * frameSeconds));
    const focus = this.followTarget;
    const distanceSmoothing = 1 - Math.exp(-8 * frameSeconds);
    this.smoothedDistance = MathUtils.lerp(this.smoothedDistance, this.desiredDistance, distanceSmoothing);
    const horizontalDistance = Math.cos(this.pitch) * this.smoothedDistance;
    this.desiredPosition.set(
      focus.x + Math.sin(this.yaw) * horizontalDistance,
      focus.y + 0.65 + Math.sin(this.pitch) * this.smoothedDistance,
      focus.z + Math.cos(this.yaw) * horizontalDistance,
    );

    this.cameraDirection.subVectors(this.desiredPosition, focus);
    const rayDistance = this.cameraDirection.length();
    this.cameraDirection.normalize();
    this.raycaster.set(focus, this.cameraDirection);
    this.raycaster.near = 0.15;
    this.raycaster.far = rayDistance;
    const obstruction = this.raycaster.intersectObjects([...occluders], false)[0];
    this.occlusionActive = Boolean(obstruction);
    if (obstruction) {
      const safeDistance = Math.max(obstruction.distance - 0.18, 0.75);
      this.desiredPosition.copy(focus).addScaledVector(this.cameraDirection, safeDistance);
    }

    if (!this.initialized) {
      this.camera.position.copy(this.desiredPosition);
      this.initialized = true;
    } else {
      const smoothing = 1 - Math.exp(-9 * frameSeconds);
      this.camera.position.lerp(this.desiredPosition, smoothing);
    }
    this.camera.lookAt(focus);
    this.effectiveDistance = this.camera.position.distanceTo(focus);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }
}
