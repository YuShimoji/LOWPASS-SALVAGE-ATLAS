import type {
  AgentControlMode,
  AgentRuntimeState,
  ControlSwitchContext,
  ControlSwitchResolution,
  CrewId,
  SquadControlState,
} from "./squadTypes";

export interface AgentControlTransitionResult {
  readonly accepted: boolean;
  readonly code: "CONTROL_MODE_CHANGED" | "CONTROL_SWITCH_REQUIRED";
  readonly reason: string;
}

export function transitionAgentControlMode(
  agent: AgentRuntimeState,
  nextMode: AgentControlMode,
): AgentControlTransitionResult {
  if (nextMode === "player-controlled") {
    return {
      accepted: false,
      code: "CONTROL_SWITCH_REQUIRED",
      reason: "player-controlledへの遷移はSquadControlStateの切替境界を使用してください",
    };
  }
  agent.controlMode = nextMode;
  if (nextMode === "incapacitated") {
    agent.currentOrder = null;
    agent.statusLabel = "INCAPACITATED // FUTURE BOUNDARY";
  }
  return { accepted: true, code: "CONTROL_MODE_CHANGED", reason: `${nextMode}へ遷移しました` };
}

export function evaluateControlSwitch(
  control: SquadControlState,
  agents: Readonly<Record<string, AgentRuntimeState>>,
  targetAgentId: CrewId,
  context: ControlSwitchContext,
): ControlSwitchResolution {
  const target = agents[targetAgentId];
  if (!target) return reject("UNKNOWN_AGENT", "対象隊員は遠征に参加していません");
  if (control.switchInProgress) return reject("SWITCH_IN_PROGRESS", "操作対象の切替処理中です");
  if (control.controlledAgentId === targetAgentId) return reject("ALREADY_CONTROLLED", "すでに操作中の隊員です");
  if (target.controlMode === "incapacitated") return reject("TARGET_INCAPACITATED", "対象隊員は操作不能です");
  if (context.exclusiveOperationActive) return reject("EXCLUSIVE_OPERATION_ACTIVE", "カート・抽出・モーダル操作中は切替できません");
  if (context.localSwitchAllowed) return accept("近距離の直接引継ぎを実行します");
  if (!context.hasFieldTerminal) return reject("FIELD_TERMINAL_REQUIRED", "遠隔切替には簡易フィールド端末が必要です");
  if (context.communicationBand !== "telemetry") return reject("TELEMETRY_REQUIRED", "遠隔切替にはtelemetry品質が必要です");
  return accept("telemetry経由の遠隔切替を実行します");
}

export function commitControlSwitch(
  control: SquadControlState,
  agents: Record<string, AgentRuntimeState>,
  targetAgentId: CrewId,
): void {
  const previous = agents[control.controlledAgentId];
  const target = agents[targetAgentId];
  if (!previous || !target) throw new Error("Cannot switch control to an unknown agent");
  control.switchInProgress = true;
  previous.controlMode = "autonomous";
  if (!previous.currentOrder) previous.statusLabel = "HOLD // CONTROL RELEASED";
  target.controlMode = "player-controlled";
  target.currentOrder = null;
  target.statusLabel = "PLAYER CONTROL";
  control.controlledAgentId = targetAgentId;
  control.switchInProgress = false;
}

function accept(reason: string): ControlSwitchResolution {
  return { accepted: true, code: "CONTROL_SWITCHED", reason };
}

function reject(code: Exclude<ControlSwitchResolution["code"], "CONTROL_SWITCHED">, reason: string): ControlSwitchResolution {
  return { accepted: false, code, reason };
}
