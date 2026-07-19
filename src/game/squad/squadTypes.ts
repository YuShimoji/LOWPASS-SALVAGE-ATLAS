import type { ItemInstanceId } from "../items/itemDefinitions";

export type CrewId = "player" | "mara" | "ito";
export type SquadCommand = "follow" | "hold" | "regroup" | "search" | "carry";

export interface CrewDefinition {
  id: CrewId;
  callsign: string;
  role: string;
  gateCapacityUnits: number;
  strengths: readonly string[];
}

export const CREW_DEFINITIONS: readonly CrewDefinition[] = [
  {
    id: "player",
    callsign: "Rook",
    role: "降下主任",
    gateCapacityUnits: 5,
    strengths: ["指揮", "回収"],
  },
  {
    id: "mara",
    callsign: "Mara",
    role: "機関技師",
    gateCapacityUnits: 5,
    strengths: ["修理", "重量物"],
  },
  {
    id: "ito",
    callsign: "Ito",
    role: "電測員",
    gateCapacityUnits: 5,
    strengths: ["通信", "探索"],
  },
] as const;

export interface CrewLoadout {
  crewId: CrewId;
  itemInstanceIds: readonly ItemInstanceId[];
}

export interface SquadOrder {
  command: SquadCommand;
  issuerId: CrewId;
  recipientIds: readonly CrewId[];
  targetEntityId: string | null;
}

export type CommunicationQuality = "clear" | "degraded" | "lost";

export interface RemoteControlEligibility {
  crewId: CrewId;
  quality: CommunicationQuality;
  canSwitchControl: boolean;
  reason: string | null;
}
