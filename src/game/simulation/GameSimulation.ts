import { distanceSquared, copyVec3, type Vec3 } from "../core/types";
import type { MovementIntent } from "../input/InputActions";
import { SHIP_INTERACTIONS } from "../content/shipLayout";
import type { InteractionDefinition } from "../interaction/interactionTypes";
import type { GameState, VisualSettings } from "./GameState";

export interface PhysicsSnapshot {
  position: Vec3;
  grounded: boolean;
  speed: number;
}

export class GameSimulation {
  private interactions: readonly InteractionDefinition[] = SHIP_INTERACTIONS;

  constructor(readonly state: GameState) {}

  fixedUpdate(dt: number, input: MovementIntent, physics: PhysicsSnapshot): void {
    const player = this.state.player;
    player.previousPosition = copyVec3(player.position);
    player.position = copyVec3(physics.position);
    player.grounded = physics.grounded;
    player.movementSpeed = physics.speed;

    if (Math.hypot(input.worldX, input.worldZ) > 0.01) {
      player.facingYaw = Math.atan2(-input.worldX, -input.worldZ);
    }

    this.state.runtime.elapsedSeconds += dt;
    this.state.runtime.tick += 1;
    this.refreshInteraction(input.interactPressed);
  }

  togglePause(): void {
    this.state.runtime.mode = this.state.runtime.mode === "playing" ? "paused" : "playing";
  }

  setVisualSetting<K extends keyof VisualSettings>(key: K, value: VisualSettings[K]): void {
    this.state.settings[key] = value;
  }

  setNotice(message: string): void {
    this.state.interaction.notice = message;
    this.state.interaction.noticeRevision += 1;
  }

  setModal(modal: GameState["ui"]["activeModal"]): void {
    this.state.ui.activeModal = modal;
    this.state.runtime.mode = modal === "none" ? "playing" : "paused";
  }

  setInteractions(interactions: readonly InteractionDefinition[]): void {
    this.interactions = interactions;
    this.refreshInteraction(false);
  }

  teleportPlayer(position: Vec3): void {
    this.state.player.position = copyVec3(position);
    this.state.player.previousPosition = copyVec3(position);
    this.state.player.movementSpeed = 0;
    this.refreshInteraction(false);
  }

  private refreshInteraction(activate: boolean): void {
    const nearest = findNearestInteraction(this.state.player.position, this.interactions);
    this.state.interaction.targetId = nearest?.id ?? null;
    this.state.interaction.prompt = nearest?.prompt ?? null;

    if (activate && nearest) {
      this.setNotice(nearest.response);
      this.state.interaction.activatedAction = nearest.action;
      this.state.interaction.activationRevision += 1;
    }
  }
}

export function findNearestInteraction(
  position: Vec3,
  interactions: readonly InteractionDefinition[],
): InteractionDefinition | null {
  let nearest: InteractionDefinition | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const interaction of interactions) {
    const candidateDistance = distanceSquared(position, interaction.position);
    if (candidateDistance <= interaction.radius ** 2 && candidateDistance < nearestDistance) {
      nearest = interaction;
      nearestDistance = candidateDistance;
    }
  }

  return nearest;
}
