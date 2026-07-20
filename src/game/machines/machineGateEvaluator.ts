import { GATE_MAX_LOGIC_LOAD, GATE_MAX_VOLUME_LOAD, type GateViolation } from "../mission/gateEvaluator";
import type { MachineGateTraits } from "./machineTypes";

export interface MachineGateEvaluation {
  readonly accepted: boolean;
  readonly machineId: string;
  readonly traits: MachineGateTraits;
  readonly violations: readonly GateViolation[];
}

export function evaluateMachineForGate(
  machineId: string,
  traits: MachineGateTraits,
): MachineGateEvaluation {
  const violations: GateViolation[] = [];
  if (traits.volumeIndex > GATE_MAX_VOLUME_LOAD) {
    violations.push({
      code: "OBJECT_VOLUME_LIMIT_EXCEEDED",
      message: `${machineId}の容積負荷 ${traits.volumeIndex} は単体上限 ${GATE_MAX_VOLUME_LOAD} を超過しています`,
      subjectId: machineId,
      actual: traits.volumeIndex,
      limit: GATE_MAX_VOLUME_LOAD,
    });
  }
  if (traits.logicIndex > GATE_MAX_LOGIC_LOAD) {
    violations.push({
      code: "OBJECT_LOGIC_LIMIT_EXCEEDED",
      message: `${machineId}の論理負荷 ${traits.logicIndex} は単体上限 ${GATE_MAX_LOGIC_LOAD} を超過しています`,
      subjectId: machineId,
      actual: traits.logicIndex,
      limit: GATE_MAX_LOGIC_LOAD,
    });
  }
  return Object.freeze({ accepted: violations.length === 0, machineId, traits: { ...traits }, violations });
}
