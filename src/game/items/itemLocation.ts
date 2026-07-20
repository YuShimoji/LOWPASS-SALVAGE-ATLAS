import type { Vec3 } from "../core/types";
import type { CrewId } from "../squad/squadTypes";

export type ItemLocation =
  | { readonly kind: "ship-inventory" }
  | { readonly kind: "gate-demonstrator" }
  | { readonly kind: "crew"; readonly crewId: CrewId }
  | { readonly kind: "mission-ground"; readonly position: Vec3 }
  | { readonly kind: "cart"; readonly cartId: string }
  | { readonly kind: "machine-carried"; readonly machineId: string }
  | { readonly kind: "extraction-pad"; readonly missionId: string; readonly position: Vec3 }
  | { readonly kind: "consumed"; readonly missionId: string }
  | { readonly kind: "recovered-to-ship"; readonly missionId: string };

export type ItemLocationLedger = Record<string, ItemLocation>;

export function cloneItemLocationLedger(ledger: Readonly<ItemLocationLedger>): ItemLocationLedger {
  return Object.fromEntries(
    Object.entries(ledger).map(([itemId, location]) => [
      itemId,
      location.kind === "mission-ground" || location.kind === "extraction-pad"
        ? { ...location, position: { ...location.position } }
        : { ...location },
    ]),
  );
}
