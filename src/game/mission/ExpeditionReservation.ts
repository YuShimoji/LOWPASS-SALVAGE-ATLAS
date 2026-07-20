import type { ItemLocationLedger } from "../items/itemLocation";
import { cloneItemLocationLedger } from "../items/itemLocation";
import type { ExpeditionManifest } from "./expeditionTypes";

export interface ExpeditionReservation {
  readonly reservationId: string;
  readonly manifestId: string;
  readonly reservedItemIds: readonly string[];
  readonly persistedWorldItemIds: readonly string[];
  readonly beforeLocations: Readonly<ItemLocationLedger>;
}

export interface ReservationCommit {
  readonly reservation: ExpeditionReservation;
  readonly locations: ItemLocationLedger;
}

export function reserveExpeditionItems(
  manifest: ExpeditionManifest,
  currentLocations: Readonly<ItemLocationLedger>,
  reservationId: string,
  persistedWorldItemIds: readonly string[] = [],
): ReservationCommit {
  const itemIds = manifest.items.map((item) => item.instanceId);
  const persistedIds = new Set(persistedWorldItemIds);
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error("Manifest contains duplicate item instances");
  }

  for (const item of manifest.items) {
    const location = currentLocations[item.instanceId];
    const availableInWorld = persistedIds.has(item.instanceId) && location?.kind === "mission-ground";
    if (location?.kind !== "ship-inventory" && !availableInWorld) {
      throw new Error(`Item ${item.instanceId} is not available in ship inventory`);
    }
  }

  const beforeLocations = cloneItemLocationLedger(currentLocations);
  const locations = cloneItemLocationLedger(currentLocations);
  for (const item of manifest.items) {
    if (persistedIds.has(item.instanceId)) continue;
    locations[item.instanceId] = { kind: "crew", crewId: item.assignedAgentId };
  }

  return {
    reservation: Object.freeze({
      reservationId,
      manifestId: manifest.manifestId,
      reservedItemIds: Object.freeze([...itemIds]),
      persistedWorldItemIds: Object.freeze(
        [...persistedIds].filter((itemId) => currentLocations[itemId]?.kind === "mission-ground"),
      ),
      beforeLocations: Object.freeze(beforeLocations),
    }),
    locations,
  };
}

export function rollbackExpeditionReservation(reservation: ExpeditionReservation): ItemLocationLedger {
  return cloneItemLocationLedger(reservation.beforeLocations);
}

export function settleExpeditionReservation(
  reservation: ExpeditionReservation,
  activeLocations: Readonly<ItemLocationLedger>,
  missionId: string,
): ItemLocationLedger {
  const settled = cloneItemLocationLedger(reservation.beforeLocations);
  for (const itemId of reservation.reservedItemIds) {
    const active = activeLocations[itemId];
    if (active?.kind === "crew") {
      settled[itemId] = { kind: "ship-inventory" };
    } else if (active?.kind === "mission-ground") {
      settled[itemId] = { kind: "mission-ground", position: { ...active.position } };
    } else if (active?.kind === "consumed") {
      settled[itemId] = { kind: "consumed", missionId };
    }
  }
  for (const itemId of reservation.persistedWorldItemIds) {
    const active = activeLocations[itemId];
    if (active?.kind === "crew") settled[itemId] = { kind: "ship-inventory" };
    else if (active?.kind === "mission-ground") {
      settled[itemId] = { kind: "mission-ground", position: { ...active.position } };
    }
  }
  for (const [itemId, location] of Object.entries(activeLocations)) {
    if (location.kind === "recovered-to-ship") {
      settled[itemId] = { kind: "recovered-to-ship", missionId };
    }
  }
  return settled;
}
