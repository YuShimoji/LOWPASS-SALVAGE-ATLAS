import type { Vec3 } from "../core/types";
import type { WorldColliderSpec } from "../../physics/physicsTypes";
import type { InsertionAnchorDefinition, InsertionPresetDefinition } from "../insertion/InsertionPlanner";
import type { NavigationGraphDefinition } from "../navigation/navigationTypes";
import type { SignalZoneDefinition } from "../communication/communicationTypes";
import type { ScoutDroneEncounterDefinition } from "../threat/threatTypes";
import type { PorterAndroidDefinition } from "../machines/machineTypes";

export interface FixedSalvageSpawn {
  readonly sourceId: string;
  readonly label: string;
  readonly resourceType: "water-filter" | "cooling-coil";
  readonly carryMode: "hand" | "cart-only";
  readonly required: boolean;
  readonly position: Vec3;
}

export interface SearchDiscoveryDefinition {
  readonly id: string;
  readonly kind: "resource" | "evidence";
  readonly label: string;
  readonly position: Vec3;
}

export interface SearchZoneDefinition {
  readonly id: string;
  readonly label: string;
  readonly entrance: Vec3;
  readonly searchPoints: readonly Vec3[];
  readonly discoveries: readonly SearchDiscoveryDefinition[];
}

export interface ToolShortcutDefinition {
  readonly id: string;
  readonly label: string;
  readonly requiredDefinitionIds: readonly ("crowbar" | "bolt-cutter")[];
  readonly interactionPosition: Vec3;
  readonly colliderId: string;
  readonly navigationEdgeId: string;
}

export interface FixedMissionDefinition {
  readonly id: string;
  readonly label: string;
  readonly destinationLabel: string;
  readonly playerSpawn: Vec3;
  readonly extractionPoint: Vec3;
  readonly extractionRadius: number;
  readonly cart: {
    readonly sourceId: "shopping-cart";
    readonly label: string;
    readonly initialPosition: Vec3;
  };
  readonly salvage: readonly FixedSalvageSpawn[];
  readonly colliders: readonly WorldColliderSpec[];
  readonly insertionAnchors: readonly InsertionAnchorDefinition[];
  readonly insertionPresets: readonly InsertionPresetDefinition[];
  readonly navigation: NavigationGraphDefinition;
  readonly signalZones: readonly SignalZoneDefinition[];
  readonly searchZones: readonly SearchZoneDefinition[];
  readonly toolShortcuts: readonly ToolShortcutDefinition[];
  readonly threatEncounter: ScoutDroneEncounterDefinition;
  readonly porterAndroid: PorterAndroidDefinition;
}
