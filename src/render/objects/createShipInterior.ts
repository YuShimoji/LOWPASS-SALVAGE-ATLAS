import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  type Object3D,
  PlaneGeometry,
  PointLight,
  TorusGeometry,
} from "three";
import { SHIP_COLLIDERS } from "../../game/content/shipLayout";
import type { Ps1MaterialFactory } from "../materials/Ps1MaterialFactory";
import { SHIP_DECK_LIGHTING, type SceneLightingProfile } from "../app/sceneLighting";
import { disposeObjectTree } from "./disposeObjectTree";
import { applyWaterlineStain, applyWorldUv, createBoxClutter, createSeededRandom, type ClutterPiece } from "./surfaceDetail";

export interface ShipInteriorView {
  root: Group;
  cameraOccluders: readonly Object3D[];
  lighting?: SceneLightingProfile;
  animate(elapsedSeconds: number, gateFeedback: GateVisualFeedback | null): void;
  dispose(): void;
}

export interface GateVisualFeedback {
  accepted: boolean;
  startedAtSeconds: number;
}

export function createShipInterior(materials: Ps1MaterialFactory): ShipInteriorView {
  const root = new Group();
  root.name = "phase-a-ship-interior";
  const grime = materials.getSurfaceTexture("grime");
  const floor = materials.create({ color: "#3a4140", roughness: 0.42, metalness: 0.22, map: grime });
  const wall = materials.create({ color: "#545a52", roughness: 0.8, metalness: 0.18, map: grime, vertexColors: true });
  const fixture = materials.create({ color: "#262d2c", roughness: 0.78, metalness: 0.2, map: grime, vertexColors: true });
  const brass = materials.create({ color: "#735f3e", metalness: 0.38, roughness: 0.72 });
  const ivory = materials.create({ color: "#b6ae8a", roughness: 0.86 });
  const amber = materials.createEmissive("#e3a45c", 0.95);
  const cyan = materials.createEmissive("#64d8cf", 0.9);
  const gateRingMaterial = materials.create({
    color: "#8d7650",
    emissive: "#243832",
    emissiveIntensity: 0.45,
    metalness: 0.42,
  });
  const gateSurfaceMaterial = materials.create({
    color: "#304343",
    emissive: "#406f6d",
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.54,
    side: 2,
    depthWrite: false,
  });
  const cameraOccluders: Object3D[] = [];

  for (const spec of SHIP_COLLIDERS) {
    if (!spec.visible) continue;
    const material = spec.surface === "floor" ? floor : spec.surface === "fixture" ? fixture : wall;
    const mesh = new Mesh(
      new BoxGeometry(spec.halfExtents.x * 2, spec.halfExtents.y * 2, spec.halfExtents.z * 2),
      material,
    );
    mesh.name = `ship-${spec.id}`;
    mesh.position.set(spec.center.x, spec.center.y, spec.center.z);
    applyWorldUv(mesh.geometry, spec.center, 1.6);
    if (spec.surface !== "floor") applyWaterlineStain(mesh.geometry, spec.center.y, 0.25, 0.3);
    mesh.receiveShadow = true;
    mesh.castShadow = spec.surface !== "floor";
    root.add(mesh);
    cameraOccluders.push(mesh);
  }

  // Yellow-black hazard lanes along the walkway (keyframe 02), with cyan studs near the gate.
  const hazard = materials.create({ color: "#ffffff", map: materials.getSurfaceTexture("hazard"), roughness: 0.55, metalness: 0.1 });
  for (const x of [-1.25, 1.25]) {
    const lane = new Mesh(new BoxGeometry(0.16, 0.02, 12.6), hazard);
    lane.position.set(x, 0.012, -3.3);
    applyWorldUv(lane.geometry, lane.position, 0.6);
    lane.receiveShadow = true;
    root.add(lane);
  }
  for (let z = -6.6; z >= -9; z -= 0.8) {
    for (const x of [-1.25, 1.25]) {
      const stud = new Mesh(new BoxGeometry(0.1, 0.03, 0.22), cyan);
      stud.position.set(x, 0.03, z);
      root.add(stud);
    }
  }

  for (const x of [-5.15, 5.15]) {
    for (const z of [2.7, 0, -2.7]) {
      const rib = new Mesh(new BoxGeometry(0.18, 3.4, 0.18), brass);
      rib.position.set(x, 1.7, z);
      root.add(rib);
    }
  }

  const windowFrame = new Mesh(new BoxGeometry(0.1, 1.9, 2.7), brass);
  windowFrame.position.set(-5.97, 1.9, -1.65);
  root.add(windowFrame);
  const windowPane = new Mesh(
    new PlaneGeometry(2.35, 1.55),
    materials.create({
      color: "#13262e",
      emissive: "#183641",
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.82,
      side: 2,
    }),
  );
  windowPane.rotation.y = Math.PI / 2;
  windowPane.position.set(-5.9, 1.9, -1.65);
  root.add(windowPane);

  const gateRing = new Mesh(new TorusGeometry(1.65, 0.18, 6, 20), gateRingMaterial);
  gateRing.position.set(0, 1.7, -9.94);
  gateRing.castShadow = true;
  root.add(gateRing);
  const gateInnerRing = new Mesh(new TorusGeometry(1.31, 0.075, 6, 20), cyan);
  gateInnerRing.position.set(0, 1.7, -9.91);
  root.add(gateInnerRing);

  const gateSurface = new Mesh(
    new CircleLikeGeometry(1.49, 20),
    gateSurfaceMaterial,
  );
  gateSurface.position.set(0, 1.7, -9.96);
  root.add(gateSurface);
  const gateLight = new PointLight("#5caaa0", 4, 7, 2);
  gateLight.position.set(0, 1.7, -9.2);
  root.add(gateLight);

  const gateScreen = new Mesh(new BoxGeometry(0.72, 0.42, 0.04), cyan);
  gateScreen.position.set(2.85, 1.26, -7.03);
  gateScreen.rotation.x = -0.28;
  root.add(gateScreen);

  const fieldTerminal = new Mesh(new BoxGeometry(0.62, 0.34, 0.44), cyan);
  fieldTerminal.position.set(-2.1, 0.22, -8);
  fieldTerminal.rotation.y = 0.18;
  root.add(fieldTerminal);

  const advancedTerminal = new Mesh(
    new BoxGeometry(0.82, 0.5, 0.58),
    materials.createEmissive("#d79b5d", 0.55),
  );
  advancedTerminal.position.set(0, 0.3, -8);
  root.add(advancedTerminal);

  const cart = new Group();
  cart.position.set(2.1, 0, -8);
  const cartBasket = new Mesh(new BoxGeometry(1.05, 0.48, 0.7), brass);
  cartBasket.position.y = 0.62;
  cart.add(cartBasket);
  for (const x of [-0.4, 0.4]) {
    for (const z of [-0.24, 0.24]) {
      const wheel = new Mesh(new CylinderGeometry(0.1, 0.1, 0.08, 6), fixture);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.12, z);
      cart.add(wheel);
    }
  }
  const cartHandle = new Mesh(new BoxGeometry(1.2, 0.08, 0.08), fixture);
  cartHandle.position.set(0, 1.08, 0.42);
  cart.add(cartHandle);
  root.add(cart);

  for (const x of [-2.2, 0, 2.2]) {
    const berth = new Mesh(new BoxGeometry(1.45, 0.38, 0.82), fixture);
    berth.position.set(x, 0.28, 3.35);
    berth.castShadow = true;
    root.add(berth);
    const berthLamp = new Mesh(new BoxGeometry(0.34, 0.06, 0.12), amber);
    berthLamp.position.set(x, 0.54, 2.94);
    const berthFrame = new Mesh(new BoxGeometry(1.7, 0.12, 1.02), ivory);
    berthFrame.position.set(x, 0.52, 3.35);
    root.add(berthLamp, berthFrame);
  }

  for (const x of [-4.75, 4.75]) {
    for (const z of [-6.2, -3.2, -0.2]) {
      const locker = new Group();
      const shell = new Mesh(new BoxGeometry(0.48, 1.2, 1.1), fixture);
      const latch = new Mesh(new BoxGeometry(0.06, 0.26, 0.32), amber);
      latch.position.set(x < 0 ? 0.27 : -0.27, 0, -0.28);
      locker.add(shell, latch);
      locker.position.set(x, 1.05, z);
      root.add(locker);
    }
  }

  for (const x of [-3.4, 3.4]) {
    const conduit = new Mesh(new CylinderGeometry(0.08, 0.08, 13, 6), brass);
    conduit.rotation.x = Math.PI / 2;
    conduit.position.set(x, 3.28, -3);
    root.add(conduit);
  }

  // Ceiling faces down only, so a high camera pitch still sees the deck from above.
  const ceiling = new Mesh(new PlaneGeometry(13, 15), materials.create({ color: "#161b1a", map: grime, roughness: 0.92 }));
  applyWorldUv(ceiling.geometry, { x: 0, y: 0, z: 0 }, 2);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3.6, -3);
  root.add(ceiling);

  // Warm hanging lamps over the berths and lockers, teal terminal glow, red alarm above the gate.
  const lampGlow = materials.createEmissive("#ffc07a", 2.8);
  const lampShade = materials.create({ color: "#2b261f", metalness: 0.45, roughness: 0.6 });
  for (const [x, y, z, intensity] of [[-2.6, 2.75, 1.6, 9], [2.6, 2.75, 1.6, 9], [-3.9, 2.6, -2.2, 6], [3.9, 2.6, -2.2, 6]] as const) {
    const cord = new Mesh(new CylinderGeometry(0.015, 0.015, 3.6 - y, 4), lampShade);
    cord.position.set(x, (3.6 + y) / 2, z);
    const shade = new Mesh(new CylinderGeometry(0.12, 0.26, 0.2, 6), lampShade);
    shade.position.set(x, y, z);
    const bulb = new Mesh(new BoxGeometry(0.16, 0.08, 0.16), lampGlow);
    bulb.position.set(x, y - 0.12, z);
    const light = new PointLight("#ffb46b", intensity, 7.5, 2);
    light.position.set(x, y - 0.35, z);
    light.userData.decorative = true;
    root.add(cord, shade, bulb, light);
  }
  const terminalLight = new PointLight("#4fd9cc", 5, 5, 2);
  terminalLight.position.set(0, 1.1, -7.3);
  terminalLight.userData.decorative = true;
  root.add(terminalLight);
  const alarmGlow = materials.createEmissive("#ff3a2c", 3);
  const alarm = new Mesh(new BoxGeometry(0.36, 0.2, 0.14), alarmGlow);
  alarm.position.set(0, 3.55, -9.85);
  const alarmLight = new PointLight("#ff3326", 4, 6, 2);
  alarmLight.position.set(0, 3.3, -9.3);
  alarmLight.userData.decorative = true;
  root.add(alarm, alarmLight);
  for (const x of [-2.05, 2.05]) {
    const gatePylon = new Mesh(new BoxGeometry(0.16, 0.9, 0.12), cyan);
    gatePylon.position.set(x, 1.7, -9.95);
    root.add(gatePylon);
  }

  // Stacked cases against the walls, clear of the walkway and interaction points.
  const random = createSeededRandom(0x5a1d0c);
  const cases: ClutterPiece[] = [];
  for (const [cx, cz, count] of [[-5.45, 2.4, 3], [5.45, 2.2, 2], [5.4, 3.5, 3], [-3.45, -5.2, 2], [3.45, -5.5, 3]] as const) {
    for (let level = 0; level < count; level += 1) {
      const wide = 0.72 - level * 0.1;
      cases.push({
        position: { x: cx + (random() - 0.5) * 0.1, y: 0.22 + level * 0.42, z: cz + (random() - 0.5) * 0.1 },
        scale: { x: wide, y: 0.42, z: 0.52 + random() * 0.12 },
        rotation: { x: 0, y: (random() - 0.5) * 0.4, z: 0 },
      });
    }
  }
  root.add(createBoxClutter("ship-deck-cases", materials.create({ color: "#4a4130", roughness: 0.8, metalness: 0.25, map: grime }), cases));

  return {
    root,
    cameraOccluders,
    lighting: SHIP_DECK_LIGHTING,
    animate(elapsedSeconds: number, gateFeedback: GateVisualFeedback | null): void {
      const pulse = 0.42 + Math.sin(elapsedSeconds * 2.1) * 0.08;
      let scale = 1 + pulse * 0.008;
      let lightIntensity = 4;
      gateRingMaterial.color.set("#8d7650");
      gateRingMaterial.emissive.set("#243832");
      gateSurfaceMaterial.color.set("#304343");
      gateSurfaceMaterial.emissive.set("#406f6d");

      if (gateFeedback) {
        const age = elapsedSeconds - gateFeedback.startedAtSeconds;
        if (age >= 0 && age < 1.8) {
          const decay = 1 - age / 1.8;
          scale += Math.sin(age * 29) * 0.045 * decay;
          lightIntensity = 6 + decay * 10;
          const color = gateFeedback.accepted ? "#55e59c" : "#ff594d";
          gateRingMaterial.color.set(color);
          gateRingMaterial.emissive.set(color);
          gateSurfaceMaterial.color.set(color);
          gateSurfaceMaterial.emissive.set(color);
        }
      }

      gateSurface.scale.setScalar(scale);
      gateRing.scale.setScalar(scale);
      gateLight.intensity = lightIntensity;
      gateLight.color.set(gateFeedback?.accepted ? "#55e59c" : gateFeedback ? "#ff594d" : "#5caaa0");
      gateSurface.rotation.z = elapsedSeconds * 0.025;
      gateInnerRing.rotation.z = -elapsedSeconds * 0.04;
      const alarmPulse = 0.5 + 0.5 * Math.sin(elapsedSeconds * 1.7);
      alarmLight.intensity = 1.5 + alarmPulse * 3;
      alarmGlow.emissiveIntensity = 1.2 + alarmPulse * 2;
    },
    dispose(): void {
      disposeObjectTree(root);
    },
  };
}

class CircleLikeGeometry extends CylinderGeometry {
  constructor(radius: number, segments: number) {
    super(radius, radius, 0.025, segments, 1, false);
    this.rotateX(Math.PI / 2);
  }
}
