import type { Group, Object3D } from "three";
import type { MissionSessionState } from "../../game/mission/MissionSession";
import type { DistributedSquadState } from "../../game/squad/squadTypes";
import type { ThreatEncounterState } from "../../game/threat/threatTypes";
import type { PorterAndroidState } from "../../game/machines/machineTypes";

export interface MissionWorldView {
  readonly root: Group;
  readonly cameraOccluders: readonly Object3D[];
  readonly assetPackReadback: {
    readonly mode: "primitive" | "canary-v1";
    readonly exactHash: string | null;
    readonly loadDurationMs: number;
    readonly glbBytes: number;
    readonly resolvedBindingIds: readonly string[];
  };
  update(
    session: MissionSessionState,
    squad: DistributedSquadState,
    threat: ThreatEncounterState,
    porter: PorterAndroidState,
    elapsedSeconds: number,
  ): void;
  dispose(): void;
}
