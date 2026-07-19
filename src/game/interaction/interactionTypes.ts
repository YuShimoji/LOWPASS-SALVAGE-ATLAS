import type { Vec3 } from "../core/types";

export type InteractionAction =
  | { readonly type: "show-notice" }
  | { readonly type: "open-expedition-console" }
  | { readonly type: "scan-gate-item"; readonly itemInstanceId: string }
  | { readonly type: "mission-item"; readonly itemInstanceId: string }
  | { readonly type: "mission-cart-toggle" }
  | { readonly type: "mission-extract" };

export interface InteractionDefinition {
  readonly id: string;
  readonly position: Vec3;
  readonly radius: number;
  readonly prompt: string;
  readonly response: string;
  readonly action: InteractionAction;
}
