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
  colliderCount: number;
  collisionCount: number;
}

export interface PhysicsWorldConfig {
  readonly colliders: readonly WorldColliderSpec[];
  readonly initialPlayerPosition: Vec3;
  readonly kinematicObjects?: readonly KinematicObjectSpec[];
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
    for (const object of config.kinematicObjects ?? []) {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
          object.position.x,
          object.position.y,
          object.position.z,
        ),
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          object.halfExtents.x,
          object.halfExtents.y,
          object.halfExtents.z,
        ).setSensor(object.sensor ?? false),
        body,
      );
      kinematicBodies.set(object.id, body);
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

  getDiagnostics(): PhysicsDiagnostics {
    return {
      colliderCount: this.colliderCount,
      collisionCount: this.collisionCount,
    };
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
