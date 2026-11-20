import { BoxGeometry, Group, Mesh, PlaneGeometry, PointLight } from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import type { Ps1MaterialFactory } from "../materials/Ps1MaterialFactory";
import { applyWorldUv, createBoxClutter, createSeededRandom, type ClutterPiece } from "./surfaceDetail";

/**
 * Visual-only dressing for the flooded market (keyframe 01). Nothing here is a collider,
 * navigation node or interaction: rules, routes and ItemLocation projection stay untouched.
 */
export interface MarketDressing {
  readonly root: Group;
  animate(elapsedSeconds: number): void;
  setReflection(enabled: boolean): void;
  dispose(): void;
}

const SHELF_X = 4.6;
const SHELF_FACE = 4.05;
const SHELF_Z_MIN = -4.0;
const SHELF_Z_MAX = 1.6;

export function createMarketDressing(materials: Ps1MaterialFactory): MarketDressing {
  const root = new Group();
  root.name = "flooded-market-dressing";
  const grime = materials.getSurfaceTexture("grime");
  const random = createSeededRandom(0x01f100d);

  // Low-resolution planar reflection just under the translucent flood water (wet floor of keyframe 01).
  // Owns a render target, so the market view must call dispose() on exit.
  const reflector = new Reflector(new PlaneGeometry(13.4, 13.4), {
    textureWidth: 480,
    textureHeight: 270,
    color: "#71807f",
    multisample: 0,
    clipBias: 0.002,
  });
  reflector.name = "market-water-reflection";
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.y = 0.03;
  root.add(reflector);

  // Ceiling faces down only, so the high default camera still sees through it from above.
  const ceiling = new Mesh(
    new PlaneGeometry(14, 14, 1, 1),
    materials.create({ color: "#1b2121", map: grime, roughness: 0.95 }),
  );
  applyWorldUv(ceiling.geometry, { x: 0, y: 0, z: 0 }, 2.4);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 3.62;
  ceiling.name = "market-ceiling";
  root.add(ceiling);

  // Warm wall lamps (keyframe 01 left/right sconces).
  const lampHousing = materials.create({ color: "#2a2622", metalness: 0.4, roughness: 0.6 });
  const lampGlow = materials.createEmissive("#ffbf73", 2.6);
  for (const [x, z] of [[-6.7, -3.6], [-6.7, 2.6], [6.7, -3.6], [6.7, 2.6]] as const) {
    const side = Math.sign(x);
    const housing = new Mesh(new BoxGeometry(0.16, 0.34, 0.56), lampHousing);
    housing.position.set(x, 2.5, z);
    const glow = new Mesh(new BoxGeometry(0.06, 0.2, 0.44), lampGlow);
    glow.position.set(x - side * 0.1, 2.48, z);
    const light = new PointLight("#ffb066", 11, 8.5, 2);
    light.position.set(x - side * 0.55, 2.4, z);
    light.name = "market-wall-lamp";
    light.userData.decorative = true;
    root.add(housing, glow, light);
  }

  // Back service doorway glowing teal, with the red alarm lamp above it.
  const doorFrame = materials.create({ color: "#151b1b", metalness: 0.35, roughness: 0.7 });
  const doorGlow = materials.createEmissive("#58e3d6", 1.6);
  const doorway = new Group();
  doorway.name = "market-service-doorway";
  const glowPanel = new Mesh(new BoxGeometry(1.5, 2.2, 0.04), doorGlow);
  glowPanel.position.set(0, 1.1, 0);
  for (const x of [-0.82, 0.82]) {
    const jamb = new Mesh(new BoxGeometry(0.14, 2.36, 0.16), doorFrame);
    jamb.position.set(x, 1.18, 0.04);
    doorway.add(jamb);
  }
  const lintel = new Mesh(new BoxGeometry(1.78, 0.16, 0.16), doorFrame);
  lintel.position.set(0, 2.3, 0.04);
  doorway.add(glowPanel, lintel);
  doorway.position.set(0.9, 0, -6.72);
  root.add(doorway);
  const doorLight = new PointLight("#46d8cb", 12, 9, 2);
  doorLight.position.set(0.9, 1.3, -5.9);
  doorLight.name = "market-door-light";
  doorLight.userData.decorative = true;
  root.add(doorLight);

  const alarmLamp = materials.createEmissive("#ff3a2c", 3.2);
  const alarm = new Mesh(new BoxGeometry(0.34, 0.18, 0.14), alarmLamp);
  alarm.position.set(0.9, 2.62, -6.66);
  alarm.name = "market-alarm-lamp";
  const alarmLight = new PointLight("#ff3326", 7, 7.5, 2);
  alarmLight.position.set(0.9, 2.55, -6.2);
  alarmLight.name = "market-alarm-light";
  alarmLight.userData.decorative = true;
  root.add(alarm, alarmLight);

  // Shelf planks and stock on the aisle-facing sides of both shelf fixtures.
  const plank = materials.create({ color: "#4a4a40", metalness: 0.3, roughness: 0.62, map: grime });
  for (const side of [-1, 1]) {
    for (const y of [0.42, 0.88, 1.34]) {
      const board = new Mesh(new BoxGeometry(0.16, 0.05, SHELF_Z_MAX - SHELF_Z_MIN + 0.1), plank);
      board.position.set(side * (SHELF_FACE - 0.07), y, (SHELF_Z_MIN + SHELF_Z_MAX) / 2);
      applyWorldUv(board.geometry, board.position, 1.6);
      board.receiveShadow = true;
      root.add(board);
    }
  }
  const stock: ClutterPiece[][] = [[], [], []];
  for (const side of [-1, 1]) {
    for (const shelfY of [0.445, 0.905, 1.365, 1.6]) {
      let z = SHELF_Z_MIN + 0.12;
      while (z < SHELF_Z_MAX - 0.15) {
        const width = 0.12 + random() * 0.18;
        if (random() > 0.22) {
          const height = 0.1 + random() * (shelfY >= 1.6 ? 0.42 : 0.26);
          const depth = 0.16 + random() * 0.12;
          const toppled = random() > 0.9;
          stock[Math.floor(random() * 3)]?.push({
            position: { x: side * (shelfY >= 1.6 ? SHELF_X - 0.1 + random() * 0.3 : SHELF_FACE - 0.12 + depth / 2), y: shelfY + (toppled ? width / 2 : height / 2), z: z + width / 2 },
            scale: { x: depth, y: toppled ? width : height, z: toppled ? height : width },
            rotation: { x: toppled ? Math.PI / 2 : 0, y: (random() - 0.5) * 0.3, z: 0 },
          });
        }
        z += width + 0.03 + random() * 0.08;
      }
    }
  }
  // Stock knocked into the water at the shelf feet.
  for (let index = 0; index < 18; index += 1) {
    const side = random() > 0.5 ? 1 : -1;
    const size = 0.12 + random() * 0.2;
    stock[index % 3]?.push({
      position: { x: side * (SHELF_FACE - 0.25 - random() * 0.5), y: 0.05 + size * 0.3, z: SHELF_Z_MIN + random() * (SHELF_Z_MAX - SHELF_Z_MIN) },
      scale: { x: size, y: size * 0.8, z: size * 1.2 },
      rotation: { x: (random() - 0.5) * 0.9, y: random() * Math.PI, z: (random() - 0.5) * 0.9 },
    });
  }
  const stockMaterials = [
    materials.create({ color: "#8a7350", roughness: 0.9 }),
    materials.create({ color: "#4f6b66", roughness: 0.82 }),
    materials.create({ color: "#a9a487", roughness: 0.86 }),
  ];
  stock.forEach((pieces, index) => {
    const material = stockMaterials[index];
    if (material && pieces.length > 0) root.add(createBoxClutter(`market-shelf-stock-${index}`, material, pieces));
  });

  // Floating debris across the flood plane, kept out of the extraction ring.
  const debris: ClutterPiece[] = [];
  while (debris.length < 38) {
    const x = (random() - 0.5) * 12.8;
    const z = (random() - 0.5) * 12.8;
    if (Math.hypot(x, z - 4.8) < 1.7) continue;
    if (Math.abs(x) > SHELF_FACE - 0.1 && Math.abs(x) < 5.2 && z > SHELF_Z_MIN && z < SHELF_Z_MAX) continue;
    const long = random() > 0.55;
    debris.push({
      position: { x, y: 0.06, z },
      scale: { x: long ? 0.42 + random() * 0.5 : 0.16 + random() * 0.22, y: 0.03 + random() * 0.04, z: long ? 0.08 + random() * 0.07 : 0.14 + random() * 0.2 },
      rotation: { x: (random() - 0.5) * 0.12, y: random() * Math.PI, z: (random() - 0.5) * 0.12 },
    });
  }
  root.add(createBoxClutter("market-floating-debris", materials.create({ color: "#5d5444", roughness: 0.92 }), debris));

  // Crate stacks and a toppled display unit pushed against the walls.
  const crates: ClutterPiece[] = [];
  for (const [cx, cz, count] of [[-6.15, -6.1, 3], [6.1, 6.15, 3], [-6.2, 5.9, 2], [6.15, -6.2, 2]] as const) {
    for (let level = 0; level < count; level += 1) {
      const size = 0.62 - level * 0.08;
      crates.push({
        position: { x: cx + (random() - 0.5) * 0.12, y: 0.31 + level * 0.58 - level * 0.04, z: cz + (random() - 0.5) * 0.12 },
        scale: { x: size, y: 0.58, z: size },
        rotation: { x: 0, y: (random() - 0.5) * 0.5, z: 0 },
      });
    }
  }
  crates.push({ position: { x: -6.35, y: 0.62, z: 3.9 }, scale: { x: 0.42, y: 1.7, z: 2.2 }, rotation: { x: 0, y: 0.08, z: 0.42 } });
  crates.push({ position: { x: 6.3, y: 0.42, z: -0.6 }, scale: { x: 0.5, y: 0.9, z: 1.6 }, rotation: { x: 0.2, y: -0.1, z: -0.3 } });
  root.add(createBoxClutter("market-wall-crates", materials.create({ color: "#4b4033", roughness: 0.88, map: grime }), crates));

  return {
    root,
    setReflection(enabled: boolean): void {
      reflector.visible = enabled;
    },
    dispose(): void {
      root.remove(reflector);
      reflector.dispose();
    },
    animate(elapsedSeconds: number): void {
      const pulse = 0.5 + 0.5 * Math.sin(elapsedSeconds * 2.6);
      alarmLight.intensity = 3 + pulse * 6;
      alarmLamp.emissiveIntensity = 1.4 + pulse * 2.4;
    },
  };
}
