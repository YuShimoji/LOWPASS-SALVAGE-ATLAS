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
import { disposeObjectTree } from "./disposeObjectTree";

export interface ShipInteriorView {
  root: Group;
  cameraOccluders: readonly Object3D[];
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
  const floor = materials.create({ color: "#303a3a" });
  const wall = materials.create({ color: "#59605a" });
  const fixture = materials.create({ color: "#252d2c" });
  const brass = materials.create({ color: "#8d7650", metalness: 0.35 });
  const amber = materials.createEmissive("#d69b58", 0.8);
  const cyan = materials.createEmissive("#65c6bf", 0.75);
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
    mesh.receiveShadow = true;
    mesh.castShadow = spec.surface !== "floor";
    root.add(mesh);
    cameraOccluders.push(mesh);
  }

  for (let z = 3; z >= -9; z -= 1.5) {
    const strip = new Mesh(new BoxGeometry(0.12, 0.018, 0.78), brass);
    strip.position.set(0, 0.025, z);
    root.add(strip);
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

  const gateSurface = new Mesh(
    new CircleLikeGeometry(1.49, 20),
    gateSurfaceMaterial,
  );
  gateSurface.position.set(0, 1.7, -9.96);
  root.add(gateSurface);
  const gateLight = new PointLight("#5caaa0", 1.2, 7, 2);
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
    root.add(berthLamp);
  }

  for (const x of [-3.4, 3.4]) {
    const conduit = new Mesh(new CylinderGeometry(0.08, 0.08, 13, 6), brass);
    conduit.rotation.x = Math.PI / 2;
    conduit.position.set(x, 3.28, -3);
    root.add(conduit);
  }

  return {
    root,
    cameraOccluders,
    animate(elapsedSeconds: number, gateFeedback: GateVisualFeedback | null): void {
      const pulse = 0.42 + Math.sin(elapsedSeconds * 2.1) * 0.08;
      let scale = 1 + pulse * 0.008;
      let lightIntensity = 1.2;
      gateRingMaterial.color.set("#8d7650");
      gateRingMaterial.emissive.set("#243832");
      gateSurfaceMaterial.color.set("#304343");
      gateSurfaceMaterial.emissive.set("#406f6d");

      if (gateFeedback) {
        const age = elapsedSeconds - gateFeedback.startedAtSeconds;
        if (age >= 0 && age < 1.8) {
          const decay = 1 - age / 1.8;
          scale += Math.sin(age * 29) * 0.045 * decay;
          lightIntensity = 2.6 + decay * 4.2;
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
