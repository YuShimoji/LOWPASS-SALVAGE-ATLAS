import { describe, expect, it } from "vitest";
import { FLOODED_MARKET_MISSION } from "../mission/fixed/floodedMarket";
import { WaypointNavigationService } from "../navigation/WaypointNavigationService";
import { PorterAndroidController, type PorterMissionPort } from "./PorterAndroidController";

function createMissionPort(): PorterMissionPort {
  return {
    missionId: FLOODED_MARKET_MISSION.id,
    itemLocations: {
      coil: { kind: "mission-ground", position: { x: 0, y: 0.38, z: -1.7 } },
    },
    transferResourceToMachine(itemId, machineId) {
      if (this.itemLocations[itemId]?.kind !== "mission-ground") return false;
      this.itemLocations[itemId] = { kind: "machine-carried", machineId };
      return true;
    },
    placeMachineResourceAtExtraction(itemId, machineId) {
      const location = this.itemLocations[itemId];
      if (location?.kind !== "machine-carried" || location.machineId !== machineId) return false;
      this.itemLocations[itemId] = {
        kind: "extraction-pad",
        missionId: this.missionId,
        position: { ...FLOODED_MARKET_MISSION.extractionPoint },
      };
      return true;
    },
    placeMachineResourceSafely(itemId, machineId, position) {
      const location = this.itemLocations[itemId];
      if (location?.kind !== "machine-carried" || location.machineId !== machineId) return false;
      this.itemLocations[itemId] = { kind: "mission-ground", position: { ...position } };
      return true;
    },
  };
}

function authContext(hasFieldTerminal = true) {
  return {
    agentId: "player" as const,
    position: { ...FLOODED_MARKET_MISSION.porterAndroid.spawn },
    operable: true,
    hasFieldTerminal,
    exclusiveOperationActive: false,
  };
}

function createController(mission = createMissionPort()) {
  return {
    mission,
    controller: new PorterAndroidController(
      FLOODED_MARKET_MISSION.porterAndroid,
      new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation),
      mission,
    ),
  };
}

function authenticate(controller: PorterAndroidController): void {
  expect(controller.beginAuthentication(authContext(), 0).accepted).toBe(true);
  controller.fixedUpdate(1 / 60, 3.01, authContext(), { player: authContext().position });
  expect(controller.state.authenticated).toBe(true);
}

describe("PorterAndroidController", () => {
  it("rejects authentication without a field terminal and accepts a valid handshake", () => {
    const { controller } = createController();
    expect(controller.beginAuthentication(authContext(false), 0).code).toBe("FIELD_TERMINAL_REQUIRED");
    authenticate(controller);
    expect(controller.state.mode).toBe("friendly-idle");
    expect(controller.state.faction).toBe("friendly");
    expect(controller.contributesPresence()).toBe(true);
  });

  it("interrupts an in-progress handshake when its operating agent is interdicted", () => {
    const { controller } = createController();
    expect(controller.beginAuthentication(authContext(), 0).accepted).toBe(true);
    controller.fixedUpdate(1 / 60, 1, authContext(), { player: authContext().position });
    expect(controller.interruptExclusiveOperation("player", 1.1)).toBe(true);
    controller.fixedUpdate(1 / 60, 4, authContext(), { player: authContext().position });
    expect(controller.state.authenticated).toBe(false);
    expect(controller.state.mode).toBe("dormant");
  });

  it("supports follow and hold commands", () => {
    const { controller } = createController();
    authenticate(controller);
    expect(controller.issueCommand("follow", "player", 4, null, FLOODED_MARKET_MISSION.extractionPoint).accepted).toBe(true);
    for (let step = 0; step < 180; step += 1) {
      controller.fixedUpdate(1 / 60, 4 + step / 60, null, { player: { x: 1, y: 0.93, z: -1.5 } });
    }
    expect(controller.state.mode).toBe("following");
    expect(controller.issueCommand("hold", "player", 8, null, FLOODED_MARKET_MISSION.extractionPoint).code).toBe("PORTER_HOLD");
    expect(controller.state.mode).toBe("holding");
  });

  it("carries the cart-only resource to the extraction pad and remains outside the gate", () => {
    const { controller, mission } = createController();
    authenticate(controller);
    expect(controller.issueCommand("carry-to", "player", 4, "coil", FLOODED_MARKET_MISSION.extractionPoint).accepted).toBe(true);
    for (let step = 0; step < 1800 && controller.state.mode !== "gate-rejected"; step += 1) {
      controller.fixedUpdate(1 / 60, 4 + step / 60, null, { player: { x: 0, y: 0.93, z: 4.8 } });
    }
    expect(mission.itemLocations.coil?.kind).toBe("extraction-pad");
    expect(controller.state.mode).toBe("gate-rejected");
    expect(controller.state.gateEvaluationCodes).toEqual([
      "OBJECT_VOLUME_LIMIT_EXCEEDED",
      "OBJECT_LOGIC_LIMIT_EXCEEDED",
    ]);
    expect(controller.getOutcome()).toEqual({
      machineId: "porter-market-01",
      disposition: "friendly-left-behind",
      assistedItemIds: ["coil"],
    });
  });

  it("safely places a carried resource when destination path recovery fails", () => {
    const mission = createMissionPort();
    let pathCalls = 0;
    const failingNavigation = {
      findPath(start: { x: number; y: number; z: number }, goal: { x: number; y: number; z: number }) {
        pathCalls += 1;
        if (pathCalls === 1) return { ok: true as const, nodeIds: ["a"], points: [{ ...start }, { ...goal }], cost: 1 };
        return { ok: false as const, code: "NO_PATH" as const, reason: "blocked" };
      },
      projectToNavigablePoint() { return null; },
    };
    const controller = new PorterAndroidController(FLOODED_MARKET_MISSION.porterAndroid, failingNavigation, mission);
    authenticate(controller);
    controller.issueCommand("carry-to", "player", 4, "coil", FLOODED_MARKET_MISSION.extractionPoint);
    for (let step = 0; step < 600 && controller.state.mode !== "path-failed"; step += 1) {
      controller.fixedUpdate(1 / 60, 4 + step / 60, null, {});
    }
    expect(controller.state.mode).toBe("path-failed");
    expect(mission.itemLocations.coil?.kind).toBe("mission-ground");
    expect(controller.state.failureReport).toContain("SAFE DROP");
  });

  it("restores a friendly Porter at its safe anchor without repeating the handshake", () => {
    const mission = createMissionPort();
    const safeAnchor = { x: 3.45, y: 0.93, z: -4.65 };
    const controller = new PorterAndroidController(
      FLOODED_MARKET_MISSION.porterAndroid,
      new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation),
      mission,
      0,
      { friendly: true, position: safeAnchor },
    );
    expect(controller.state).toMatchObject({
      authenticated: true,
      faction: "friendly",
      mode: "friendly-idle",
      position: safeAnchor,
    });
    expect(controller.getInteractions("coil").some((entry) => entry.action.type === "mission-porter-auth")).toBe(false);
    expect(controller.beginAuthentication(authContext(), 0).code).toBe("ALREADY_AUTHENTICATED");
    expect(controller.contributesPresence()).toBe(true);
  });

  it("keeps friendly presence without a terminal but rejects the advanced carry command", () => {
    const mission = createMissionPort();
    const controller = new PorterAndroidController(
      FLOODED_MARKET_MISSION.porterAndroid,
      new WaypointNavigationService(FLOODED_MARKET_MISSION.navigation),
      mission,
      0,
      { friendly: true, position: FLOODED_MARKET_MISSION.porterAndroid.spawn },
    );
    expect(controller.getInteractions("coil", false).some((entry) => entry.action.type === "mission-porter-command" && entry.action.command === "carry-to")).toBe(false);
    expect(controller.issueCommand(
      "carry-to",
      "player",
      1,
      "coil",
      FLOODED_MARKET_MISSION.extractionPoint,
      false,
    ).code).toBe("FIELD_TERMINAL_REQUIRED");
    expect(controller.contributesPresence()).toBe(true);
    expect(controller.getGateEvaluation().accepted).toBe(false);
  });
});
