import type { EntityId, TransformState } from "../core/types";
import { createInitialExpeditionDraft, type ExpeditionDraft, type ExpeditionManifest } from "../mission/expeditionTypes";
import type { ItemGateEvaluation } from "../mission/gateEvaluator";
import type { InteractionAction } from "../content/shipLayout";

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

export type ActiveModal = "none" | "settings" | "expedition" | "manifest-summary";

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
