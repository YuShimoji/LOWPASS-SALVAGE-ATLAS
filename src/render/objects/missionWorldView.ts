import type { Group, Object3D } from "three";
import type { MissionSessionState } from "../../game/mission/MissionSession";

export interface MissionWorldView {
  readonly root: Group;
  readonly cameraOccluders: readonly Object3D[];
  update(session: MissionSessionState, elapsedSeconds: number): void;
  dispose(): void;
}
