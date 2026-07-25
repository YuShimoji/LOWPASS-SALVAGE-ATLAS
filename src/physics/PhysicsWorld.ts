import RAPIER from "@dimforge/rapier3d-compat";
import type { MovementIntent } from "../game/input/InputActions";
import type { PhysicsSnapshot } from "../game/simulation/GameSimulation";
import { INITIAL_PLAYER_POSITION } from "../game/simulation/GameState";
import { SHIP_COLLIDERS } from "../game/content/shipLayout";
import type { Vec3 } from "../game/core/types";
import type { KinematicObjectSpec, WorldColliderSpec } from "./physicsTypes";

const WALK_SPEED = 3.2;
const SPRINT_SPEED = 5.1;
const GRAVITY = -18;

export interface PhysicsDiagnostics {
  rigidBodyCount: number;
  colliderCount: number;
  collisionCount: number;
}

export interface PhysicsWorldConfig {
  readonly colliders: readonly WorldColliderSpec[];
  readonly initialPlayerPosition: Vec3;
  readonly kinematicObjects?: readonly KinematicObjectSpec[];
}

export interface KinematicCartPairStep {
  readonly cartPosition: Vec3;
  readonly cartFacingYaw: number;
  readonly player: PhysicsSnapshot;
  readonly collisionBlocked: boolean;
}

const DEFAULT_CONFIG: PhysicsWorldConfig = {
  colliders: SHIP_COLLIDERS,
  initialPlayerPosition: INITIAL_PLAYER_POSITION,
};

let rapierInitialization: Promise<void> | null = null;

export class PhysicsWorld {
  private verticalVelocity = 0;
  private grounded = false;
  private collisionCount = 0;

  private constructor(
    private readonly world: RAPIER.World,
    private readonly playerBody: RAPIER.RigidBody,
    private readonly playerCollider: RAPIER.Collider,
    private readonly characterController: RAPIER.KinematicCharacterController,
    private readonly colliderCount: number,
    private readonly kinematicBodies: ReadonlyMap<string, RAPIER.RigidBody>,
    private readonly kinematicColliders: ReadonlyMap<string, RAPIER.Collider>,
    private readonly worldColliders: ReadonlyMap<string, RAPIER.Collider>,
  ) {}

  static async create(config: PhysicsWorldConfig = DEFAULT_CONFIG): Promise<PhysicsWorld> {
    rapierInitialization ??= RAPIER.init();
    await rapierInitialization;

    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    const worldColliders = new Map<string, RAPIER.Collider>();
    for (const collider of config.colliders) {
      const instance = world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          collider.halfExtents.x,
          collider.halfExtents.y,
          collider.halfExtents.z,
        )
          .setTranslation(collider.center.x, collider.center.y, collider.center.z)
          .setFriction(0.8),
      );
      worldColliders.set(collider.id, instance);
    }

    const playerBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        config.initialPlayerPosition.x,
        config.initialPlayerPosition.y,
        config.initialPlayerPosition.z,
      ),
    );
    const playerCollider = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.55, 0.35).setFriction(0.2),
      playerBody,
    );
    const characterController = world.createCharacterController(0.03);
    characterController.setSlideEnabled(true);
    characterController.enableAutostep(0.35, 0.25, false);
    characterController.enableSnapToGround(0.2);
    characterController.setMaxSlopeClimbAngle(Math.PI * 0.28);

    const kinematicBodies = new Map<string, RAPIER.RigidBody>();
    const kinematicColliders = new Map<string, RAPIER.Collider>();
    for (const object of config.kinematicObjects ?? []) {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
          object.position.x,
          object.position.y,
          object.position.z,
        ),
      );
      const collider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          object.halfExtents.x,
          object.halfExtents.y,
          object.halfExtents.z,
        ).setSensor(object.sensor ?? false),
        body,
      );
      kinematicBodies.set(object.id, body);
      kinematicColliders.set(object.id, collider);
    }

    world.timestep = 1 / 60;
    world.step();
    return new PhysicsWorld(
      world,
      playerBody,
      playerCollider,
      characterController,
      config.colliders.length + 1 + kinematicBodies.size,
      kinematicBodies,
      kinematicColliders,
      worldColliders,
    );
  }

  stepCharacter(input: MovementIntent, dt: number): PhysicsSnapshot {
    const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
    this.verticalVelocity = this.grounded ? Math.min(this.verticalVelocity, -0.5) : this.verticalVelocity + GRAVITY * dt;

    const desired = {
      x: input.worldX * speed * dt,
      y: this.verticalVelocity * dt,
      z: input.worldZ * speed * dt,
    };
    this.characterController.computeColliderMovement(this.playerCollider, desired);
    const movement = this.characterController.computedMovement();
    const current = this.playerBody.translation();

    this.grounded = this.characterController.computedGrounded();
    this.collisionCount = this.characterController.numComputedCollisions();
    if (this.grounded && this.verticalVelocity < 0) this.verticalVelocity = 0;

    this.playerBody.setNextKinematicTranslation({
      x: current.x + movement.x,
      y: current.y + movement.y,
      z: current.z + movement.z,
    });
    this.world.timestep = dt;
    this.world.step();

    const updated = this.playerBody.translation();
    return {
      position: { x: updated.x, y: updated.y, z: updated.z },
      grounded: this.grounded,
      speed: Math.hypot(movement.x, movement.z) / dt,
    };
  }

  stepKinematicCartPair(
    id: string,
    currentPosition: Vec3,
    currentFacingYaw: number,
    desiredPosition: Vec3,
    desiredFacingYaw: number,
    operatorOffset: number,
    dt: number,
  ): KinematicCartPairStep {
    const body = this.kinematicBodies.get(id);
    const collider = this.kinematicColliders.get(id);
    if (!body || !collider) {
      return {
        cartPosition: { ...currentPosition },
        cartFacingYaw: currentFacingYaw,
        player: {
          position: copyPosition(this.playerBody.translation()),
          grounded: this.grounded,
          speed: 0,
        },
        collisionBlocked: true,
      };
    }

    const clearanceShape = new RAPIER.Cuboid(0.62, 0.38, 0.98);
    const startCenter = cartPairCenter(currentPosition, currentFacingYaw);
    const desiredCenter = cartPairCenter(desiredPosition, desiredFacingYaw);
    const translation = {
      x: desiredCenter.x - startCenter.x,
      y: 0,
      z: desiredCenter.z - startCenter.z,
    };
    const hit = this.world.castShape(
      startCenter,
      yawRotation(currentFacingYaw),
      translation,
      clearanceShape,
      0.02,
      1,
      false,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      collider,
      body,
      (candidate) =>
        candidate.handle !== this.playerCollider.handle
        && candidate.handle !== collider.handle,
    );
    const movementFraction = Math.max(0, Math.min(1, hit?.time_of_impact ?? 1));
    const cartPosition = {
      x: currentPosition.x + (desiredPosition.x - currentPosition.x) * movementFraction,
      y: currentPosition.y,
      z: currentPosition.z + (desiredPosition.z - currentPosition.z) * movementFraction,
    };

    let rotationBlocked = false;
    this.world.intersectionsWithShape(
      cartPairCenter(cartPosition, desiredFacingYaw),
      yawRotation(desiredFacingYaw),
      clearanceShape,
      () => {
        rotationBlocked = true;
        return false;
      },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      collider,
      body,
      (candidate) =>
        candidate.handle !== this.playerCollider.handle
        && candidate.handle !== collider.handle,
    );
    const cartFacingYaw = rotationBlocked ? currentFacingYaw : desiredFacingYaw;
    body.setNextKinematicTranslation(cartPosition);
    body.setNextKinematicRotation(yawRotation(cartFacingYaw));
    const playerPosition = {
      x: cartPosition.x + Math.sin(cartFacingYaw) * operatorOffset,
      y: 0.93,
      z: cartPosition.z + Math.cos(cartFacingYaw) * operatorOffset,
    };
    const previousPlayer = copyPosition(this.playerBody.translation());
    this.playerBody.setNextKinematicTranslation(playerPosition);
    this.world.timestep = dt;
    this.world.step();
    const updatedPlayer = this.playerBody.translation();
    const actualDistance = Math.hypot(
      updatedPlayer.x - previousPlayer.x,
      updatedPlayer.z - previousPlayer.z,
    );
    const collisionBlocked = movementFraction < 0.999 || rotationBlocked;
    this.grounded = true;
    this.verticalVelocity = 0;
    this.collisionCount = collisionBlocked ? 1 : 0;

    return {
      cartPosition,
      cartFacingYaw,
      player: {
        position: copyPosition(updatedPlayer),
        grounded: true,
        speed: dt > 0 ? actualDistance / dt : 0,
      },
      collisionBlocked,
    };
  }

  getDiagnostics(): PhysicsDiagnostics {
    return {
      rigidBodyCount: this.world.bodies.len(),
      colliderCount: this.colliderCount,
      collisionCount: this.collisionCount,
    };
  }

  hasLineOfSight(from: Vec3, to: Vec3): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance <= 0.001) return true;
    const ray = new RAPIER.Ray(from, { x: dx / distance, y: dy / distance, z: dz / distance });
    const hit = this.world.castRay(
      ray,
      Math.max(0, distance - 0.12),
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      this.playerCollider,
    );
    return hit === null;
  }

  setKinematicObjectPosition(id: string, position: Vec3): void {
    const body = this.kinematicBodies.get(id);
    if (!body) return;
    body.setNextKinematicTranslation(position);
  }

  setWorldColliderEnabled(id: string, enabled: boolean): boolean {
    const collider = this.worldColliders.get(id);
    if (!collider) return false;
    collider.setEnabled(enabled);
    return true;
  }

  isWorldColliderEnabled(id: string): boolean | null {
    return this.worldColliders.get(id)?.isEnabled() ?? null;
  }

  teleportCharacter(position: Vec3): void {
    this.verticalVelocity = 0;
    this.grounded = false;
    this.playerBody.setTranslation(position, true);
    this.playerBody.setNextKinematicTranslation(position);
  }

  dispose(): void {
    this.world.free();
  }
}

function cartPairCenter(position: Vec3, facingYaw: number): Vec3 {
  return {
    x: position.x + Math.sin(facingYaw) * 0.52,
    y: position.y + 0.12,
    z: position.z + Math.cos(facingYaw) * 0.52,
  };
}

function yawRotation(facingYaw: number): RAPIER.Rotation {
  return {
    x: 0,
    y: Math.sin(facingYaw / 2),
    z: 0,
    w: Math.cos(facingYaw / 2),
  };
}

function copyPosition(position: RAPIER.Vector): Vec3 {
  return { x: position.x, y: position.y, z: position.z };
}
