import type { Vec3 } from "../core/types";

export type InteractionAction =
  | { readonly type: "show-notice" }
  | { readonly type: "open-expedition-console" }
  | { readonly type: "scan-gate-item"; readonly itemInstanceId: string }
  | { readonly type: "mission-item"; readonly itemInstanceId: string }
  | { readonly type: "mission-cart-toggle" }
  | { readonly type: "mission-shortcut"; readonly shortcutId: string }
  | { readonly type: "mission-threat-disable"; readonly threatId: string }
  | { readonly type: "mission-relay-restart"; readonly itemInstanceId: string }
  | { readonly type: "mission-porter-auth"; readonly machineId: string }
  | { readonly type: "mission-porter-command"; readonly machineId: string; readonly command: "follow" | "hold" | "carry-to" }
  | { readonly type: "mission-extract" };

export interface InteractionDefinition {
  readonly id: string;
  readonly position: Vec3;
  readonly radius: number;
  readonly prompt: string;
  readonly response: string;
  readonly action: InteractionAction;
}
