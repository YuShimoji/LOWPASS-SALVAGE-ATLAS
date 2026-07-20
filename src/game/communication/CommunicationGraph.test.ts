import { describe, expect, it } from "vitest";
import { FLOODED_MARKET_MISSION } from "../mission/fixed/floodedMarket";
import { CommunicationGraph, qualityToCommunicationBand } from "./CommunicationGraph";

describe("CommunicationGraph", () => {
  it("maps quality thresholds to none, burst, voice, and telemetry", () => {
    expect(qualityToCommunicationBand(0.17)).toBe("none");
    expect(qualityToCommunicationBand(0.18)).toBe("burst");
    expect(qualityToCommunicationBand(0.42)).toBe("voice");
    expect(qualityToCommunicationBand(0.72)).toBe("telemetry");
  });

  it("keeps a distant no-radio agent at none while allowing a nearby local instruction", () => {
    const graph = new CommunicationGraph(FLOODED_MARKET_MISSION.signalZones);
    graph.setNode({ id: "radio:player", kind: "agent-radio", position: { x: 0, y: 0.93, z: 4.8 }, agentId: "player", enabled: true });
    graph.setNode({ id: "radio:ito", kind: "agent-radio", position: { x: 0, y: 0.93, z: -6.15 }, agentId: "ito", enabled: false });
    expect(graph.evaluateAgentLinks("player", ["ito"]).ito).toMatchObject({ band: "none", localInstructionAllowed: false });
    graph.setNode({ id: "radio:ito", kind: "agent-radio", position: { x: 1, y: 0.93, z: 4.8 }, agentId: "ito", enabled: false });
    expect(graph.evaluateAgentLinks("player", ["ito"]).ito).toMatchObject({ band: "none", localInstructionAllowed: true });
  });

  it("applies authored underground attenuation and restores a route through a relay", () => {
    const graph = new CommunicationGraph(FLOODED_MARKET_MISSION.signalZones);
    graph.setNode({ id: "radio:player", kind: "agent-radio", position: { x: 0, y: 0.93, z: 4.8 }, agentId: "player", enabled: true });
    graph.setNode({ id: "radio:mara", kind: "agent-radio", position: { x: 0, y: 0.93, z: -6.15 }, agentId: "mara", enabled: true });
    const underground = graph.evaluateAgentLinks("player", ["mara"]).mara;
    expect(underground?.band).toBe("none");
    graph.setNode({ id: "relay:01", kind: "portable-relay", position: { x: 0, y: 0.93, z: -2 }, agentId: null, enabled: true });
    const relayed = graph.evaluateAgentLinks("player", ["mara"]).mara;
    expect(["voice", "telemetry"]).toContain(relayed?.band);
    expect(relayed?.routeNodeIds).toContain("relay:01");
    graph.removeNode("relay:01");
    expect(graph.evaluateAgentLinks("player", ["mara"]).mara?.band).toBe("none");
  });

  it("evaluates identical graph state deterministically", () => {
    const graph = new CommunicationGraph(FLOODED_MARKET_MISSION.signalZones);
    graph.setNode({ id: "radio:player", kind: "agent-radio", position: { x: 0, y: 0.93, z: 4.8 }, agentId: "player", enabled: true });
    graph.setNode({ id: "radio:mara", kind: "agent-radio", position: { x: 6, y: 0.93, z: 0 }, agentId: "mara", enabled: true });
    expect(graph.evaluateAgentLinks("player", ["player", "mara"])).toEqual(
      graph.evaluateAgentLinks("player", ["player", "mara"]),
    );
  });
});
