import type { Group, Object3D } from "three";
import type { SceneLightingProfile } from "../app/sceneLighting";
import type { MissionSessionState } from "../../game/mission/MissionSession";
import type { DistributedSquadState } from "../../game/squad/squadTypes";
import type { ThreatEncounterState } from "../../game/threat/threatTypes";
import type { PorterAndroidState } from "../../game/machines/machineTypes";

export interface MissionWorldView {
  readonly root: Group;
  readonly cameraOccluders: readonly Object3D[];
  /** Optional per-world lighting; the renderer falls back to its default profile. */
  readonly lighting?: SceneLightingProfile;
  readonly assetPackReadback: {
    readonly mode: "primitive" | "canary-v1";
    readonly exactHash: string | null;
    readonly loadDurationMs: number;
    readonly glbBytes: number;
    readonly resolvedBindingIds: readonly string[];
  };
  /** Optional presentation toggle for worlds with a planar water reflection. */
  setWaterReflection?(enabled: boolean): void;
  update(
    session: MissionSessionState,
    squad: DistributedSquadState,
    threat: ThreatEncounterState,
    porter: PorterAndroidState,
    elapsedSeconds: number,
  ): void;
  dispose(): void;
}
