import { Vector3 } from "three";
import type { PlayerState } from "../../game/simulation/GameState";

export function interpolatePlayerPosition(player: PlayerState, alpha: number, target: Vector3): Vector3 {
  target.set(
    player.previousPosition.x + (player.position.x - player.previousPosition.x) * alpha,
    player.previousPosition.y + (player.position.y - player.previousPosition.y) * alpha,
    player.previousPosition.z + (player.position.z - player.previousPosition.z) * alpha,
  );
  return target;
}
