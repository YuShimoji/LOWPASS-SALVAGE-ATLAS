import { describe, expect, it } from "vitest";
import {
  assessPresence,
  DEFAULT_PRESENCE_SETTINGS,
  PresenceHysteresis,
  type PresenceEntity,
} from "./PresenceService";

const target = { x: 0, y: 0.93, z: 0 };
const visible = () => true;

function entity(
  id: string,
  side: PresenceEntity["side"],
  kind: PresenceEntity["kind"],
  x = 0,
): PresenceEntity {
  return { id, side, kind, position: { x, y: 0.93, z: 0 }, operational: true, perceptible: true };
}

describe("PresenceService", () => {
  it("classifies one hostile against one crew member as predatory", () => {
    const result = assessPresence("player", target, [
      entity("player", "allied", "crew"),
      entity("drone-1", "hostile", "hostile-drone"),
    ], 0, visible);
    expect(result).toMatchObject({ alliedPresence: 1, hostilePresence: 1, margin: 0, band: "predatory" });
  });

  it("classifies one hostile against two crew members as outnumbered", () => {
    const result = assessPresence("player", target, [
      entity("player", "allied", "crew"),
      entity("mara", "allied", "crew", 1),
      entity("drone-1", "hostile", "hostile-drone"),
    ], 0, visible);
    expect(result).toMatchObject({ alliedPresence: 2, hostilePresence: 1, margin: 1, band: "outnumbered" });
  });

  it("counts a friendly porter at 0.75 and reaches the outnumbered boundary", () => {
    const result = assessPresence("player", target, [
      entity("player", "allied", "crew"),
      entity("porter", "allied", "friendly-machine", 1),
      entity("drone-1", "hostile", "hostile-drone"),
    ], 0, visible);
    expect(result).toMatchObject({ alliedPresence: 1.75, hostilePresence: 1, margin: 0.75, band: "outnumbered" });
  });

  it("keeps two hostile drones against two crew predatory", () => {
    const result = assessPresence("player", target, [
      entity("player", "allied", "crew"), entity("mara", "allied", "crew", 1),
      entity("drone-1", "hostile", "hostile-drone"), entity("drone-2", "hostile", "hostile-drone", 2),
    ], 0, visible);
    expect(result.band).toBe("predatory");
  });

  it("classifies two hostile drones against three crew as outnumbered", () => {
    const result = assessPresence("player", target, [
      entity("player", "allied", "crew"), entity("mara", "allied", "crew", 1), entity("ito", "allied", "crew", 2),
      entity("drone-1", "hostile", "hostile-drone"), entity("drone-2", "hostile", "hostile-drone", 3),
    ], 0, visible);
    expect(result).toMatchObject({ alliedPresence: 3, hostilePresence: 2, band: "outnumbered" });
  });

  it("does not count a crew member behind a complete wall", () => {
    const result = assessPresence("player", target, [
      entity("player", "allied", "crew"), entity("mara", "allied", "crew", 1),
      entity("drone-1", "hostile", "hostile-drone"),
    ], 0, (_from, to) => to.x !== 1);
    expect(result).toMatchObject({ alliedPresence: 1, hostilePresence: 1, band: "predatory" });
    expect(result.contributingEntityIds).not.toContain("mara");
  });

  it("requires 0.8 seconds of stable support before changing bands", () => {
    const predatory = assessPresence("player", target, [
      entity("player", "allied", "crew"), entity("drone-1", "hostile", "hostile-drone"),
    ], 0, visible);
    const outnumbered = assessPresence("player", target, [
      entity("player", "allied", "crew"), entity("mara", "allied", "crew", 1),
      entity("drone-1", "hostile", "hostile-drone"),
    ], 1, visible);
    const tracker = new PresenceHysteresis(predatory);
    expect(tracker.update(outnumbered, 1).band).toBe("predatory");
    expect(tracker.update(outnumbered, 1.79).band).toBe("predatory");
    expect(tracker.update(outnumbered, 1.8).band).toBe("outnumbered");
  });

  it("is deterministic regardless of source entity order", () => {
    const entities = [
      entity("player", "allied", "crew"), entity("porter", "allied", "friendly-machine", 2),
      entity("drone-1", "hostile", "hostile-drone"),
    ];
    const first = assessPresence("player", target, entities, 2, visible, DEFAULT_PRESENCE_SETTINGS);
    const second = assessPresence("player", target, [...entities].reverse(), 2, visible, DEFAULT_PRESENCE_SETTINGS);
    expect(second).toEqual(first);
  });
});
