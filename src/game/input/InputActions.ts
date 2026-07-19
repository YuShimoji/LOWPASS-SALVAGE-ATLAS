export type InputAction =
  | "move-forward"
  | "move-backward"
  | "move-left"
  | "move-right"
  | "sprint"
  | "interact"
  | "pause"
  | "toggle-debug";

export const KEY_BINDINGS = {
  KeyW: "move-forward",
  ArrowUp: "move-forward",
  KeyS: "move-backward",
  ArrowDown: "move-backward",
  KeyA: "move-left",
  KeyD: "move-right",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
  KeyE: "interact",
  Escape: "pause",
  F1: "toggle-debug",
} as const satisfies Record<string, InputAction>;

export interface MovementIntent {
  worldX: number;
  worldZ: number;
  sprint: boolean;
  interactPressed: boolean;
}

export interface FrameCommands {
  pausePressed: boolean;
  debugPressed: boolean;
}
