import { copyVec3 } from "../core/types";
import type {
  SecurityBlackboardState,
  SecurityFact,
  SecurityPressureTokens,
} from "./securityTypes";

export function createSecurityPressureTokens(): SecurityPressureTokens {
  return {
    lockOnByAgentId: {},
    activeInterdictionMachineId: null,
    relaySabotageByRelayId: {},
    graceUntilByAgentId: {},
  };
}

export function createSecurityBlackboard(): SecurityBlackboardState {
  return {
    sharedFacts: {},
    currentAssignments: {},
    taskReservations: {},
    pressureTokens: createSecurityPressureTokens(),
    revision: 0,
  };
}

export function shareSecurityFact(blackboard: SecurityBlackboardState, fact: SecurityFact): boolean {
  const existing = blackboard.sharedFacts[fact.id];
  if (existing && existing.observedAtSeconds >= fact.observedAtSeconds) return false;
  blackboard.sharedFacts[fact.id] = {
    ...fact,
    position: copyVec3(fact.position),
    directlyObserved: false,
  };
  blackboard.revision += 1;
  return true;
}

export function expireSecurityFacts(blackboard: SecurityBlackboardState, elapsedSeconds: number): readonly string[] {
  const expired: string[] = [];
  for (const [factId, fact] of Object.entries(blackboard.sharedFacts)) {
    if (fact.expiresAtSeconds > elapsedSeconds && fact.confidence >= 0.08) continue;
    delete blackboard.sharedFacts[factId];
    expired.push(factId);
  }
  if (expired.length === 0) return expired;
  const expiredSet = new Set(expired);
  for (const [machineId, assignment] of Object.entries(blackboard.currentAssignments)) {
    if (assignment.factId && expiredSet.has(assignment.factId)) delete blackboard.currentAssignments[machineId];
  }
  for (const [reservationId, reservation] of Object.entries(blackboard.taskReservations)) {
    if (expiredSet.has(reservation.factId)) delete blackboard.taskReservations[reservationId];
  }
  blackboard.revision += 1;
  return expired.sort();
}
