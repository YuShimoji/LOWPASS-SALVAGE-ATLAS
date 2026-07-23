import { copyVec3 } from "../core/types";
import type {
  HostileMachineKnowledge,
  PendingSecurityBroadcast,
  SecurityFact,
} from "./securityTypes";

const MINIMUM_CONFIDENCE = 0.08;

export function createHostileMachineKnowledge(
  machineId: HostileMachineKnowledge["machineId"],
  elapsedSeconds = 0,
): HostileMachineKnowledge {
  return {
    machineId,
    localFacts: {},
    pendingBroadcasts: {},
    lastDecayAtSeconds: elapsedSeconds,
  };
}

export function observeSecurityFact(
  knowledge: HostileMachineKnowledge,
  fact: SecurityFact,
): SecurityFact {
  const stored: SecurityFact = {
    ...fact,
    position: copyVec3(fact.position),
    confidence: clamp(fact.confidence, 0, 1),
    uncertaintyRadius: Math.max(0, fact.uncertaintyRadius),
  };
  knowledge.localFacts[fact.id] = stored;
  return stored;
}

export function queueSecurityBroadcast(
  knowledge: HostileMachineKnowledge,
  broadcast: PendingSecurityBroadcast,
): void {
  const existing = knowledge.pendingBroadcasts[broadcast.id];
  if (existing && existing.readyAtSeconds <= broadcast.readyAtSeconds) return;
  knowledge.pendingBroadcasts[broadcast.id] = { ...broadcast };
}

export function collectReadyBroadcasts(
  knowledge: HostileMachineKnowledge,
  elapsedSeconds: number,
  linkConnected: (recipientMachineId: PendingSecurityBroadcast["recipientMachineId"]) => boolean,
): readonly { readonly broadcast: PendingSecurityBroadcast; readonly fact: SecurityFact }[] {
  const ready: { broadcast: PendingSecurityBroadcast; fact: SecurityFact }[] = [];
  for (const [broadcastId, broadcast] of Object.entries(knowledge.pendingBroadcasts).sort(([left], [right]) => left.localeCompare(right))) {
    const fact = knowledge.localFacts[broadcast.factId];
    if (!fact || fact.expiresAtSeconds <= elapsedSeconds) {
      delete knowledge.pendingBroadcasts[broadcastId];
      continue;
    }
    if (broadcast.readyAtSeconds > elapsedSeconds || !linkConnected(broadcast.recipientMachineId)) continue;
    ready.push({ broadcast: { ...broadcast }, fact: { ...fact, position: copyVec3(fact.position), directlyObserved: false } });
    delete knowledge.pendingBroadcasts[broadcastId];
  }
  return ready;
}

export function decayHostileMachineKnowledge(
  knowledge: HostileMachineKnowledge,
  elapsedSeconds: number,
  confidenceDecayPerSecond: number,
  uncertaintyGrowthPerSecond: number,
): readonly string[] {
  const dt = Math.max(0, elapsedSeconds - knowledge.lastDecayAtSeconds);
  knowledge.lastDecayAtSeconds = elapsedSeconds;
  const removed: string[] = [];
  for (const [factId, fact] of Object.entries(knowledge.localFacts)) {
    if (fact.expiresAtSeconds <= elapsedSeconds) {
      delete knowledge.localFacts[factId];
      removed.push(factId);
      continue;
    }
    fact.confidence = clamp(fact.confidence - confidenceDecayPerSecond * dt, 0, 1);
    fact.uncertaintyRadius += uncertaintyGrowthPerSecond * dt;
    if (fact.confidence < MINIMUM_CONFIDENCE) {
      delete knowledge.localFacts[factId];
      removed.push(factId);
    }
  }
  removed.sort();
  return removed;
}

export function securityFactId(kind: SecurityFact["kind"], targetId: string): string {
  return `security-fact:${kind}:${targetId}`;
}

export function securityBroadcastId(
  fact: SecurityFact,
  recipientMachineId: PendingSecurityBroadcast["recipientMachineId"],
): string {
  return `${fact.id}:${fact.observedAtSeconds.toFixed(3)}:${recipientMachineId}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
