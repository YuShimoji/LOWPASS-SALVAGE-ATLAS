export type InputAction =
  | "move-forward"
  | "move-backward"
  | "move-left"
  | "move-right"
  | "sprint"
  | "interact"
  | "cancel"
  | "pause"
  | "zoom-in"
  | "zoom-out"
  | "toggle-debug";

export const KEY_BINDINGS = {
  KeyW: "move-forward",
  ArrowUp: "move-forward",
  KeyS: "move-backward",
  ArrowDown: "move-backward",
  KeyA: "move-left",
  ArrowLeft: "move-left",
  KeyD: "move-right",
  ArrowRight: "move-right",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
  KeyE: "interact",
  Escape: "pause",
  F1: "toggle-debug",
} as const satisfies Record<string, InputAction>;

export interface MovementIntent {
  rawX: number;
  rawY: number;
  worldX: number;
  worldZ: number;
  sprint: boolean;
  interactPressed: boolean;
}

export interface FrameCommands {
  pausePressed: boolean;
  debugPressed: boolean;
  cancelPressed: boolean;
  zoomDirection: number;
}
