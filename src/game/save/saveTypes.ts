import type { ExpeditionManifest } from "../mission/expeditionTypes";
import type { VisualSettings } from "../simulation/GameState";

// Drafts are deliberately excluded: only confirmed expedition data crosses the save boundary.
export interface LowpassSaveDataV1 {
  readonly schemaVersion: 1;
  readonly settings: VisualSettings;
  readonly confirmedManifest: ExpeditionManifest | null;
}
