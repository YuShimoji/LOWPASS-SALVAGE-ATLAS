import { MathUtils, PerspectiveCamera, Raycaster, Vector3, type Object3D } from "three";

const MIN_PITCH = -0.08;
const MAX_PITCH = 0.72;
export const MIN_CAMERA_DISTANCE = 2.3;
export const MAX_CAMERA_DISTANCE = 6.5;
export const DEFAULT_CAMERA_DISTANCE = 4.1;

export interface CameraDiagnostics {
  readonly desiredDistance: number;
  readonly effectiveDistance: number;
  readonly occlusionActive: boolean;
}

export class ThirdPersonCamera {
  readonly camera = new PerspectiveCamera(58, 1, 0.08, 80);
  private readonly target = new Vector3();
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
    this.pitch = MathUtils.clamp(this.pitch - deltaY * 0.0021, MIN_PITCH, MAX_PITCH);
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
    };
  }

  reset(yaw = 0, pitch = 0.28): void {
    this.yaw = yaw;
    this.pitch = MathUtils.clamp(pitch, MIN_PITCH, MAX_PITCH);
    this.initialized = false;
  }

  resetFromStart(playerPosition: { x: number; y: number; z: number }, cameraPosition: { x: number; y: number; z: number }): void {
    const dx = cameraPosition.x - playerPosition.x;
    const dz = cameraPosition.z - playerPosition.z;
    const horizontal = Math.hypot(dx, dz);
    const pitch = Math.atan2(cameraPosition.y - (playerPosition.y + 1.03), Math.max(horizontal, 0.001));
    this.reset(Math.atan2(dx, dz), pitch);
  }

  update(playerPosition: Vector3, frameSeconds: number, occluders: readonly Object3D[]): void {
    this.target.set(playerPosition.x, playerPosition.y + 0.38, playerPosition.z);
    const distanceSmoothing = 1 - Math.exp(-8 * frameSeconds);
    this.smoothedDistance = MathUtils.lerp(this.smoothedDistance, this.desiredDistance, distanceSmoothing);
    const horizontalDistance = Math.cos(this.pitch) * this.smoothedDistance;
    this.desiredPosition.set(
      this.target.x + Math.sin(this.yaw) * horizontalDistance,
      this.target.y + 0.65 + Math.sin(this.pitch) * this.smoothedDistance,
      this.target.z + Math.cos(this.yaw) * horizontalDistance,
    );

    this.cameraDirection.subVectors(this.desiredPosition, this.target);
    const rayDistance = this.cameraDirection.length();
    this.cameraDirection.normalize();
    this.raycaster.set(this.target, this.cameraDirection);
    this.raycaster.near = 0.15;
    this.raycaster.far = rayDistance;
    const obstruction = this.raycaster.intersectObjects([...occluders], false)[0];
    this.occlusionActive = Boolean(obstruction);
    if (obstruction) {
      const safeDistance = Math.max(obstruction.distance - 0.18, 0.75);
      this.desiredPosition.copy(this.target).addScaledVector(this.cameraDirection, safeDistance);
    }

    if (!this.initialized) {
      this.camera.position.copy(this.desiredPosition);
      this.initialized = true;
    } else {
      const smoothing = 1 - Math.exp(-9 * frameSeconds);
      this.camera.position.lerp(this.desiredPosition, smoothing);
    }
    this.camera.lookAt(this.target);
    this.effectiveDistance = this.camera.position.distanceTo(this.target);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }
}
