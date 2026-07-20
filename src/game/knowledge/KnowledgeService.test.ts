import { describe, expect, it } from "vitest";
import type { ItemLocationLedger } from "../items/itemLocation";
import { KnowledgeService } from "./KnowledgeService";
import { SignalBeaconService } from "../signals/SignalBeaconService";

describe("KnowledgeService", () => {
  it("records local discoveries, queues while disconnected, flushes on reconnect, and deduplicates", () => {
    const service = new KnowledgeService(["player", "mara"]);
    const entry = {
      id: "knowledge:coil-log",
      kind: "evidence" as const,
      label: "冷却ログ",
      sourceId: "coil-log",
      position: { x: 1, y: 0.93, z: -4 },
      discoveredByAgentId: "mara" as const,
      discoveredAtSeconds: 4,
    };
    service.discover(entry, false);
    service.discover(entry, false);
    expect(Object.keys(service.state.byAgent.mara?.entries ?? {})).toHaveLength(1);
    expect(Object.keys(service.state.byAgent.mara?.pendingReports ?? {})).toHaveLength(1);
    service.flushPending("mara", true);
    service.flushPending("mara", true);
    expect(Object.keys(service.state.squad.entries)).toHaveLength(1);
    expect(Object.keys(service.state.squad.receivedReportIds)).toHaveLength(1);
  });

  it("shares immediately when the discovering agent is connected", () => {
    const service = new KnowledgeService(["player", "ito"]);
    service.discover({
      id: "knowledge:filter",
      kind: "resource",
      label: "フィルター箱",
      sourceId: "filter",
      position: { x: 0, y: 0.93, z: 0 },
      discoveredByAgentId: "ito",
      discoveredAtSeconds: 1,
    }, true);
    expect(service.state.squad.entries["knowledge:filter"]?.label).toBe("フィルター箱");
  });
});

describe("SignalBeaconService", () => {
  it("consumes one flare, creates and expires a beacon, and records NPC recognition", () => {
    const service = new SignalBeaconService();
    const locations: ItemLocationLedger = { "flare-01": { kind: "crew", crewId: "player" } };
    const deployed = service.deployFlare("player", { x: 0, y: 0.93, z: 0 }, 1, ["flare-01"], locations);
    expect(deployed.accepted).toBe(true);
    expect(locations["flare-01"]?.kind).toBe("consumed");
    service.update(2, { player: { x: 0, y: 0.93, z: 0 }, mara: { x: 4, y: 0.93, z: 0 } });
    expect(deployed.beacon?.recognizedByAgentIds).toContain("mara");
    service.update(47, {});
    expect(service.getActiveBeacon()).toBeNull();
    expect(service.deployFlare("player", { x: 0, y: 0.93, z: 0 }, 50, ["flare-01"], locations).code).toBe("NO_FLARE_AVAILABLE");
  });
});
