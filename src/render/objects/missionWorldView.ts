import type { Group, Object3D } from "three";
import type { MissionSessionState } from "../../game/mission/MissionSession";
import type { DistributedSquadState } from "../../game/squad/squadTypes";

export interface MissionWorldView {
  readonly root: Group;
  readonly cameraOccluders: readonly Object3D[];
  update(session: MissionSessionState, squad: DistributedSquadState, elapsedSeconds: number): void;
  dispose(): void;
}
