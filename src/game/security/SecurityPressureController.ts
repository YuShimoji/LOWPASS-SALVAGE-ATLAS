import type { PresenceBand } from "../threat/PresenceService";
import type { HostileMachineId, SecurityPressureTokens } from "./securityTypes";

export interface SecurityPressureSettings {
  readonly maximumConcurrentLockOnsPerAgent: number;
  readonly maximumConcurrentInterdictions: number;
  readonly maximumConcurrentRelaySabotages: number;
  readonly postInterferenceGraceSeconds: number;
}

export class SecurityPressureController {
  constructor(
    readonly tokens: SecurityPressureTokens,
    private readonly settings: SecurityPressureSettings,
  ) {}

  canBeginLockOn(
    machineId: HostileMachineId,
    targetAgentId: string,
    elapsedSeconds: number,
    presenceBand: PresenceBand,
    directSight: boolean,
    safeZone: boolean,
  ): boolean {
    if (!directSight || safeZone || presenceBand !== "predatory") return false;
    if ((this.tokens.graceUntilByAgentId[targetAgentId] ?? 0) > elapsedSeconds) return false;
    const holder = this.tokens.lockOnByAgentId[targetAgentId];
    if (holder && holder !== machineId) return false;
    const lockCount = Number(Boolean(holder));
    return lockCount < this.settings.maximumConcurrentLockOnsPerAgent || holder === machineId;
  }

  beginLockOn(machineId: HostileMachineId, targetAgentId: string): void {
    this.tokens.lockOnByAgentId[targetAgentId] = machineId;
  }

  releaseLockOn(machineId: HostileMachineId, targetAgentId?: string | null): void {
    if (targetAgentId && this.tokens.lockOnByAgentId[targetAgentId] === machineId) {
      delete this.tokens.lockOnByAgentId[targetAgentId];
      return;
    }
    for (const [agentId, holder] of Object.entries(this.tokens.lockOnByAgentId)) {
      if (holder === machineId) delete this.tokens.lockOnByAgentId[agentId];
    }
  }

  beginInterdiction(machineId: HostileMachineId, targetAgentId: string, elapsedSeconds: number): boolean {
    if (this.tokens.activeInterdictionMachineId && this.tokens.activeInterdictionMachineId !== machineId) return false;
    if (this.settings.maximumConcurrentInterdictions < 1) return false;
    this.tokens.activeInterdictionMachineId = machineId;
    this.tokens.graceUntilByAgentId[targetAgentId] = elapsedSeconds + this.settings.postInterferenceGraceSeconds;
    this.releaseLockOn(machineId, targetAgentId);
    return true;
  }

  endInterdiction(machineId: HostileMachineId): void {
    if (this.tokens.activeInterdictionMachineId === machineId) this.tokens.activeInterdictionMachineId = null;
  }

  canBeginRelaySabotage(
    machineId: HostileMachineId,
    relayId: string,
    presenceBand: PresenceBand,
    safeZone: boolean,
  ): boolean {
    if (presenceBand !== "predatory" || safeZone) return false;
    const holder = this.tokens.relaySabotageByRelayId[relayId];
    if (holder && holder !== machineId) return false;
    const activeCount = Object.keys(this.tokens.relaySabotageByRelayId).length;
    return holder === machineId || activeCount < this.settings.maximumConcurrentRelaySabotages;
  }

  beginRelaySabotage(machineId: HostileMachineId, relayId: string): void {
    this.tokens.relaySabotageByRelayId[relayId] = machineId;
  }

  releaseRelaySabotage(machineId: HostileMachineId, relayId?: string | null): void {
    if (relayId && this.tokens.relaySabotageByRelayId[relayId] === machineId) {
      delete this.tokens.relaySabotageByRelayId[relayId];
      return;
    }
    for (const [id, holder] of Object.entries(this.tokens.relaySabotageByRelayId)) {
      if (holder === machineId) delete this.tokens.relaySabotageByRelayId[id];
    }
  }

  clearAttackTokens(machineId: HostileMachineId): void {
    this.releaseLockOn(machineId);
    this.releaseRelaySabotage(machineId);
    this.endInterdiction(machineId);
  }
}
