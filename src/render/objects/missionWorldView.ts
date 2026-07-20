import type { Group, Object3D } from "three";
import type { MissionSessionState } from "../../game/mission/MissionSession";
import type { DistributedSquadState } from "../../game/squad/squadTypes";
import type { ThreatEncounterState } from "../../game/threat/threatTypes";

export interface MissionWorldView {
  readonly root: Group;
  readonly cameraOccluders: readonly Object3D[];
  update(
    session: MissionSessionState,
    squad: DistributedSquadState,
    threat: ThreatEncounterState,
    elapsedSeconds: number,
  ): void;
  dispose(): void;
}
