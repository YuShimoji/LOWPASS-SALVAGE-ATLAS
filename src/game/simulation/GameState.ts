import type { EntityId, TransformState } from "../core/types";
import { createInitialExpeditionDraft, type ExpeditionDraft, type ExpeditionManifest } from "../mission/expeditionTypes";
import type { ItemGateEvaluation } from "../mission/gateEvaluator";
import type { InteractionAction } from "../interaction/interactionTypes";
import { createInitialItemLocations } from "../items/itemDefinitions";
import type { ItemLocationLedger } from "../items/itemLocation";
import type { FixedMissionResult, MissionSessionState } from "../mission/MissionSession";

export type RuntimeMode = "playing" | "paused";

export interface VisualSettings {
  lowResolution: boolean;
  distanceFog: boolean;
  vertexSnap: boolean;
  dithering: boolean;
}

export interface PlayerState extends TransformState {
  id: EntityId;
  previousPosition: TransformState["position"];
  grounded: boolean;
  movementSpeed: number;
}

export interface InteractionState {
  targetId: EntityId | null;
  prompt: string | null;
  notice: string | null;
  noticeRevision: number;
  activatedAction: InteractionAction | null;
  activationRevision: number;
}

export interface GateScanState {
  itemInstanceId: string;
  scannedAtSeconds: number;
  revision: number;
  evaluation: ItemGateEvaluation;
}

export type ActiveModal = "none" | "settings" | "expedition" | "manifest-summary" | "mission-result";

export interface ExpeditionState {
  draft: ExpeditionDraft;
  confirmedManifest: ExpeditionManifest | null;
  gateScan: GateScanState | null;
}

export interface GameState {
  runtime: {
    mode: RuntimeMode;
    elapsedSeconds: number;
    tick: number;
  };
  player: PlayerState;
  interaction: InteractionState;
  expedition: ExpeditionState;
  world: {
    mode: "ship" | "mission-loading" | "mission";
    completedExpeditions: number;
  };
  inventory: {
    itemLocations: ItemLocationLedger;
  };
  mission: {
    session: MissionSessionState | null;
    lastResult: FixedMissionResult | null;
  };
  ui: {
    activeModal: ActiveModal;
  };
  settings: VisualSettings;
}

export const INITIAL_PLAYER_POSITION = Object.freeze({ x: 0, y: 0.93, z: 0.4 });

export function createInitialGameState(): GameState {
  return {
    runtime: {
      mode: "playing",
      elapsedSeconds: 0,
      tick: 0,
    },
    player: {
      id: "crew-player",
      position: { ...INITIAL_PLAYER_POSITION },
      previousPosition: { ...INITIAL_PLAYER_POSITION },
      facingYaw: 0,
      grounded: false,
      movementSpeed: 0,
    },
    interaction: {
      targetId: null,
      prompt: null,
      notice: "居住甲板シミュレーション接続完了",
      noticeRevision: 1,
      activatedAction: null,
      activationRevision: 0,
    },
    expedition: {
      draft: createInitialExpeditionDraft(),
      confirmedManifest: null,
      gateScan: null,
    },
    world: {
      mode: "ship",
      completedExpeditions: 0,
    },
    inventory: {
      itemLocations: createInitialItemLocations(),
    },
    mission: {
      session: null,
      lastResult: null,
    },
    ui: {
      activeModal: "none",
    },
    settings: {
      lowResolution: true,
      distanceFog: true,
      vertexSnap: true,
      dithering: true,
    },
  };
}
