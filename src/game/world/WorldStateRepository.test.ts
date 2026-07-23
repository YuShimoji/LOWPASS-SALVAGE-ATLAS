import { describe, expect, it } from "vitest";
import { FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID } from "./floodedMarketWorld";
import { InMemoryWorldStateRepository } from "./WorldStateRepository";
import type { WorldVisitSettlement } from "./worldTypes";

function settlement(expectedRevision = 0): WorldVisitSettlement {
  return {
    id: "repo-settlement",
    worldInstanceId: FLOODED_MARKET_WORLD_INSTANCE_ID,
    expectedRevision,
    missionOutcomeId: "repo-outcome",
    outcome: "partial",
    delta: { events: [{ type: "unique-item-extracted", itemId: "filter-01", visitId: "visit-repo" }] },
  };
}

describe("WorldStateRepository", () => {
  it("creates then loads the same persisted state", async () => {
    const repository = new InMemoryWorldStateRepository();
    expect((await repository.loadOrCreate(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID)).status).toBe("created");
    expect((await repository.loadOrCreate(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID)).status).toBe("loaded");
  });

  it("commits atomically and returns the committed revision", async () => {
    const repository = new InMemoryWorldStateRepository();
    await repository.loadOrCreate(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID);
    const result = await repository.commit(settlement(), FLOODED_MARKET_WORLD);
    expect(result).toMatchObject({ status: "applied", state: { revision: 1, visitCount: 1 } });
  });

  it("does not persist an injected write failure", async () => {
    const repository = new InMemoryWorldStateRepository();
    await repository.loadOrCreate(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID);
    repository.simulateNextWriteFailure();
    await expect(repository.commit(settlement(), FLOODED_MARKET_WORLD)).rejects.toThrow("WORLD_STATE_WRITE_FAILED");
    const loaded = await repository.loadOrCreate(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID);
    expect(loaded.state.revision).toBe(0);
    expect(loaded.state.uniqueItemStates.find((entry) => entry.entityId === "filter-01")?.recovered).toBe(false);
  });

  it("reports duplicate commit without rewriting", async () => {
    const repository = new InMemoryWorldStateRepository();
    await repository.loadOrCreate(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID);
    await repository.commit(settlement(), FLOODED_MARKET_WORLD);
    const duplicate = await repository.commit(settlement(), FLOODED_MARKET_WORLD);
    expect(duplicate.status).toBe("duplicate");
    expect(duplicate.state.revision).toBe(1);
  });

  it("resets only the selected world instance state", async () => {
    const repository = new InMemoryWorldStateRepository();
    await repository.loadOrCreate(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID);
    await repository.commit(settlement(), FLOODED_MARKET_WORLD);
    const reset = await repository.reset(FLOODED_MARKET_WORLD, FLOODED_MARKET_WORLD_INSTANCE_ID);
    expect(reset.revision).toBe(0);
    expect(reset.visitCount).toBe(0);
    expect(reset.securityState).toEqual({
      posture: "routine",
      confirmedContactVisitCount: 0,
      lastConfirmedContactVisitId: null,
      observedTacticTags: [],
    });
  });
});
