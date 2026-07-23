import type {
  SecurityBlackboardState,
  SecurityFact,
  SecurityMachineDescriptor,
  SecurityTask,
  SecurityTaskAssignment,
  SecurityTaskEnvironment,
  SecurityTaskReservation,
} from "./securityTypes";

const ATTACK_TASKS = new Set<SecurityTask>(["interdict-agent", "sabotage-relay"]);

export function allocateSecurityTasks(
  blackboard: SecurityBlackboardState,
  machines: readonly SecurityMachineDescriptor[],
  environment: SecurityTaskEnvironment,
  minimumTaskSeconds = 1.25,
  reassignmentCooldownSeconds = 0.5,
): void {
  const facts = Object.values(blackboard.sharedFacts)
    .filter((fact) => fact.expiresAtSeconds > environment.elapsedSeconds && fact.confidence >= 0.08)
    .sort(compareFacts);
  const nextAssignments: Record<string, SecurityTaskAssignment> = {};
  const reservations: Record<string, SecurityTaskReservation> = {};

  for (const machine of [...machines].filter((entry) => entry.operational).sort((left, right) => left.id.localeCompare(right.id))) {
    const previous = blackboard.currentAssignments[machine.id];
    if (previous && shouldKeepAssignment(previous, facts, environment)) {
      nextAssignments[machine.id] = previous;
      reserveAssignment(previous, reservations);
      continue;
    }
    const candidate = selectTask(machine, facts, reservations, environment);
    nextAssignments[machine.id] = {
      machineId: machine.id,
      task: candidate.task,
      targetId: candidate.fact?.targetId ?? null,
      factId: candidate.fact?.id ?? null,
      assignedAtSeconds: environment.elapsedSeconds,
      minimumUntilSeconds: environment.elapsedSeconds + minimumTaskSeconds,
      reassignAfterSeconds: environment.elapsedSeconds + minimumTaskSeconds + reassignmentCooldownSeconds,
    };
    reserveAssignment(nextAssignments[machine.id] as SecurityTaskAssignment, reservations);
  }

  if (!equalAssignments(blackboard.currentAssignments, nextAssignments)
    || !equalReservations(blackboard.taskReservations, reservations)) {
    blackboard.currentAssignments = nextAssignments;
    blackboard.taskReservations = reservations;
    blackboard.revision += 1;
  }
}

function selectTask(
  machine: SecurityMachineDescriptor,
  facts: readonly SecurityFact[],
  reservations: Readonly<Record<string, SecurityTaskReservation>>,
  environment: SecurityTaskEnvironment,
): { readonly task: SecurityTask; readonly fact: SecurityFact | null } {
  if (environment.presenceBand === "outnumbered") return { task: "disengage", fact: null };
  const reachable = facts.filter((fact) => environment.isReachable(machine.id, fact.position));
  const agentFact = reachable.find((fact) => fact.kind === "agent-sighting" && !environment.safeTargetIds.has(fact.targetId));
  const relayFact = reachable.find((fact) => fact.kind === "relay-sighting");
  const flareFact = reachable.find((fact) => fact.kind === "flare-sighting");

  if (machine.kind === "watcher") {
    if (agentFact) return { task: "maintain-overwatch", fact: agentFact };
    if (flareFact) return { task: "investigate-flare", fact: flareFact };
    return { task: "patrol", fact: null };
  }
  if (environment.presenceBand === "cautious") {
    return agentFact ? { task: "observe-agent", fact: agentFact } : { task: "patrol", fact: null };
  }
  if (relayFact && !reservationExists(reservations, "sabotage-relay", relayFact.targetId)) {
    return { task: "sabotage-relay", fact: relayFact };
  }
  if (agentFact && !reservationExists(reservations, "interdict-agent", agentFact.targetId)) {
    return { task: agentFact.directlyObserved ? "interdict-agent" : "observe-agent", fact: agentFact };
  }
  if (flareFact) return { task: "investigate-flare", fact: flareFact };
  return { task: "patrol", fact: null };
}

function shouldKeepAssignment(
  assignment: SecurityTaskAssignment,
  facts: readonly SecurityFact[],
  environment: SecurityTaskEnvironment,
): boolean {
  if (environment.presenceBand === "outnumbered") return assignment.task === "disengage";
  if (environment.presenceBand === "cautious" && ATTACK_TASKS.has(assignment.task)) return false;
  if (assignment.minimumUntilSeconds > environment.elapsedSeconds) {
    return !assignment.factId || facts.some((fact) => fact.id === assignment.factId);
  }
  return assignment.reassignAfterSeconds > environment.elapsedSeconds
    && (!assignment.factId || facts.some((fact) => fact.id === assignment.factId));
}

function reserveAssignment(
  assignment: SecurityTaskAssignment,
  reservations: Record<string, SecurityTaskReservation>,
): void {
  if ((assignment.task !== "interdict-agent" && assignment.task !== "sabotage-relay")
    || !assignment.targetId || !assignment.factId) return;
  const id = `${assignment.task}:${assignment.targetId}`;
  reservations[id] = {
    id,
    task: assignment.task,
    targetId: assignment.targetId,
    machineId: assignment.machineId,
    factId: assignment.factId,
  };
}

function reservationExists(
  reservations: Readonly<Record<string, SecurityTaskReservation>>,
  task: SecurityTaskReservation["task"],
  targetId: string,
): boolean {
  return Boolean(reservations[`${task}:${targetId}`]);
}

function compareFacts(left: SecurityFact, right: SecurityFact): number {
  return right.confidence - left.confidence
    || right.observedAtSeconds - left.observedAtSeconds
    || left.id.localeCompare(right.id);
}

function equalAssignments(
  left: Readonly<Record<string, SecurityTaskAssignment>>,
  right: Readonly<Record<string, SecurityTaskAssignment>>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function equalReservations(
  left: Readonly<Record<string, SecurityTaskReservation>>,
  right: Readonly<Record<string, SecurityTaskReservation>>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
