import RAPIER from "@dimforge/rapier3d-compat";
import type { MovementIntent } from "../game/input/InputActions";
import type { PhysicsSnapshot } from "../game/simulation/GameSimulation";
import { INITIAL_PLAYER_POSITION } from "../game/simulation/GameState";
import { SHIP_COLLIDERS } from "../game/content/shipLayout";

const WALK_SPEED = 3.2;
const SPRINT_SPEED = 5.1;
const GRAVITY = -18;

export interface PhysicsDiagnostics {
  colliderCount: number;
  collisionCount: number;
}

export class PhysicsWorld {
  private verticalVelocity = 0;
  private grounded = false;
  private collisionCount = 0;

  private constructor(
    private readonly world: RAPIER.World,
    private readonly playerBody: RAPIER.RigidBody,
    private readonly playerCollider: RAPIER.Collider,
    private readonly characterController: RAPIER.KinematicCharacterController,
  ) {}

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();

    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    for (const collider of SHIP_COLLIDERS) {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          collider.halfExtents.x,
          collider.halfExtents.y,
          collider.halfExtents.z,
        )
          .setTranslation(collider.center.x, collider.center.y, collider.center.z)
          .setFriction(0.8),
      );
    }

    const playerBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        INITIAL_PLAYER_POSITION.x,
        INITIAL_PLAYER_POSITION.y,
        INITIAL_PLAYER_POSITION.z,
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

    world.timestep = 1 / 60;
    world.step();
    return new PhysicsWorld(world, playerBody, playerCollider, characterController);
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
      colliderCount: SHIP_COLLIDERS.length + 1,
      collisionCount: this.collisionCount,
    };
  }

  dispose(): void {
    this.world.free();
  }
}
