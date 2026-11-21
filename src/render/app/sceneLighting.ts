/**
 * Per-world lighting. Darkness belongs to the flooded market (decision 2026-08-04), so each
 * world view carries its own profile instead of the renderer owning one global palette.
 * Worlds without a profile fall back to DEFAULT_SCENE_LIGHTING (the pre-2026-11-21 values).
 */
export interface SceneLightingProfile {
  readonly id: string;
  readonly background: string;
  readonly fog: { readonly color: string; readonly near: number; readonly far: number };
  readonly exposure: number;
  readonly ambient: { readonly color: string; readonly intensity: number };
  readonly hemisphere: { readonly sky: string; readonly ground: string; readonly intensity: number };
  readonly key: { readonly color: string; readonly intensity: number; readonly position: readonly [number, number, number] };
  readonly fill: { readonly color: string; readonly intensity: number; readonly position: readonly [number, number, number] };
  /** Soft light that follows the controlled character so the silhouette stays readable in dark worlds. */
  readonly character: { readonly color: string; readonly intensity: number };
  readonly bloom: { readonly strength: number; readonly radius: number; readonly threshold: number };
  readonly vignette: { readonly offset: number; readonly darkness: number };
}

export const DEFAULT_SCENE_LIGHTING: SceneLightingProfile = {
  id: "default-daylight",
  background: "#07171a",
  fog: { color: "#07171a", near: 10, far: 34 },
  exposure: 1.18,
  ambient: { color: "#8aa5a1", intensity: 1.05 },
  hemisphere: { sky: "#a4cfca", ground: "#231c15", intensity: 1.55 },
  key: { color: "#ffddb2", intensity: 3.1, position: [3, 8, 4] },
  fill: { color: "#70bcc2", intensity: 1.4, position: [-6, 4, -5] },
  character: { color: "#ffffff", intensity: 0 },
  bloom: { strength: 0.25, radius: 0.3, threshold: 0.95 },
  vignette: { offset: 0.9, darkness: 0.6 },
};

/** Keyframe 01: dark market, warm wall lamps, teal machine light, red alarm. */
export const FLOODED_MARKET_LIGHTING: SceneLightingProfile = {
  id: "flooded-market-night",
  background: "#030a0b",
  fog: { color: "#061517", near: 7, far: 26 },
  exposure: 1.05,
  ambient: { color: "#4f6f72", intensity: 0.24 },
  hemisphere: { sky: "#3f6a6e", ground: "#120d08", intensity: 0.42 },
  key: { color: "#9fc4c8", intensity: 0.7, position: [2, 9, 3] },
  fill: { color: "#3a8f96", intensity: 0.3, position: [-6, 4, -5] },
  character: { color: "#ffe1bd", intensity: 4.2 },
  bloom: { strength: 0.62, radius: 0.42, threshold: 0.72 },
  vignette: { offset: 1.05, darkness: 1.15 },
};

/** Keyframe 02: dark hangar, warm hanging lamps, teal terminals and gate rim. */
export const SHIP_DECK_LIGHTING: SceneLightingProfile = {
  id: "ship-deck-night",
  background: "#05090a",
  fog: { color: "#070c0d", near: 7, far: 24 },
  exposure: 1.08,
  ambient: { color: "#5a6a66", intensity: 0.28 },
  hemisphere: { sky: "#4d6965", ground: "#17110a", intensity: 0.44 },
  key: { color: "#ffd9a8", intensity: 0.8, position: [3, 8, 4] },
  fill: { color: "#3e8d92", intensity: 0.3, position: [-6, 4, -5] },
  character: { color: "#ffe1bd", intensity: 3.6 },
  bloom: { strength: 0.58, radius: 0.4, threshold: 0.74 },
  vignette: { offset: 1.0, darkness: 1.05 },
};
