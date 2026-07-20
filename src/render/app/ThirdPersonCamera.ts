import { MathUtils, PerspectiveCamera, Raycaster, Vector3, type Object3D } from "three";

const MIN_PITCH = -0.08;
const MAX_PITCH = 0.72;

export class ThirdPersonCamera {
  readonly camera = new PerspectiveCamera(58, 1, 0.08, 80);
  private readonly target = new Vector3();
  private readonly desiredPosition = new Vector3();
  private readonly cameraDirection = new Vector3();
  private readonly raycaster = new Raycaster();
  private initialized = false;
  private yaw = 0;
  private pitch = 0.28;
  private distance = 4.1;

  applyLookDelta(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * 0.0026;
    this.pitch = MathUtils.clamp(this.pitch - deltaY * 0.0021, MIN_PITCH, MAX_PITCH);
  }

  getYaw(): number {
    return this.yaw;
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
    const horizontalDistance = Math.cos(this.pitch) * this.distance;
    this.desiredPosition.set(
      this.target.x + Math.sin(this.yaw) * horizontalDistance,
      this.target.y + 0.65 + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * horizontalDistance,
    );

    this.cameraDirection.subVectors(this.desiredPosition, this.target);
    const desiredDistance = this.cameraDirection.length();
    this.cameraDirection.normalize();
    this.raycaster.set(this.target, this.cameraDirection);
    this.raycaster.near = 0.15;
    this.raycaster.far = desiredDistance;
    const obstruction = this.raycaster.intersectObjects([...occluders], false)[0];
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
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }
}
