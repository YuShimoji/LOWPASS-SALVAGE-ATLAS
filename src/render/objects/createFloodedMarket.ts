import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  PointLight,
  TorusGeometry,
  type Object3D,
} from "three";
import type { ExpeditionManifest } from "../../game/mission/expeditionTypes";
import type { FixedMissionDefinition } from "../../game/mission/fixedMissionTypes";
import type { MissionSessionState } from "../../game/mission/MissionSession";
import type { DistributedSquadState } from "../../game/squad/squadTypes";
import type { Ps1MaterialFactory } from "../materials/Ps1MaterialFactory";
import { disposeObjectTree } from "./disposeObjectTree";
import type { MissionWorldView } from "./missionWorldView";

export function createFloodedMarket(
  materials: Ps1MaterialFactory,
  definition: FixedMissionDefinition,
  manifest: ExpeditionManifest,
  session: MissionSessionState,
  squad: DistributedSquadState,
): MissionWorldView {
  const root = new Group();
  root.name = "phase-d-flooded-market";
  const concrete = materials.create({ color: "#353b37" });
  const wall = materials.create({ color: "#59625b" });
  const shelf = materials.create({ color: "#42463d", metalness: 0.22 });
  const water = materials.create({
    color: "#183f43",
    emissive: "#123337",
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  });
  const amber = materials.createEmissive("#e0a35c", 0.75);
  const cyan = materials.createEmissive("#6bd2cc", 0.8);
  const red = materials.createEmissive("#d95d50", 0.65);
  const dark = materials.create({ color: "#202725" });
  const cameraOccluders: Object3D[] = [];
  const shortcutViews = new Map<string, Object3D>();

  for (const spec of definition.colliders) {
    if (!spec.visible) continue;
    const material = spec.surface === "floor" ? concrete : spec.surface === "fixture" ? shelf : wall;
    const mesh = new Mesh(
      new BoxGeometry(spec.halfExtents.x * 2, spec.halfExtents.y * 2, spec.halfExtents.z * 2),
      material,
    );
    mesh.name = `market-${spec.id}`;
    mesh.position.set(spec.center.x, spec.center.y, spec.center.z);
    mesh.receiveShadow = true;
    mesh.castShadow = spec.surface !== "floor";
    root.add(mesh);
    const shortcut = definition.toolShortcuts.find((candidate) => candidate.colliderId === spec.id);
    if (shortcut) shortcutViews.set(shortcut.id, mesh);
    if (spec.surface !== "floor") cameraOccluders.push(mesh);
  }

  const floodPlane = new Mesh(new PlaneGeometry(13.4, 13.4, 1, 1), water);
  floodPlane.rotation.x = -Math.PI / 2;
  floodPlane.position.y = 0.045;
  root.add(floodPlane);

  for (const x of [-5.6, -2.8, 0, 2.8, 5.6]) {
    const ceilingStrip = new Mesh(new BoxGeometry(1.45, 0.08, 0.18), x === 0 ? red : amber);
    ceilingStrip.position.set(x, 3.25, -2.6);
    root.add(ceilingStrip);
  }

  const marketSign = new Mesh(new BoxGeometry(4.2, 0.85, 0.18), materials.createEmissive("#6b8d7e", 0.48));
  marketSign.position.set(0, 2.55, -6.72);
  root.add(marketSign);

  for (const x of [-4.8, -1.6, 1.6, 4.8]) {
    const checkout = new Mesh(new BoxGeometry(1.1, 0.78, 1.35), dark);
    checkout.position.set(x, 0.39, 4.9);
    checkout.castShadow = true;
    root.add(checkout);
  }

  const extractionRing = new Mesh(new TorusGeometry(1.35, 0.1, 6, 20), cyan);
  extractionRing.rotation.x = Math.PI / 2;
  extractionRing.position.set(
    definition.extractionPoint.x,
    0.09,
    definition.extractionPoint.z,
  );
  root.add(extractionRing);
  const extractionLight = new PointLight("#63d8cd", 2.4, 6, 2);
  extractionLight.position.set(definition.extractionPoint.x, 1.6, definition.extractionPoint.z);
  root.add(extractionLight);

  const resourceViews = new Map<string, Group>();
  for (const resource of definition.salvage) {
    const itemId = `${session.sessionId}:${resource.sourceId}`;
    const resourceView = new Group();
    resourceView.name = `salvage-${resource.sourceId}`;
    if (resource.resourceType === "water-filter") {
      const casing = new Mesh(new BoxGeometry(0.58, 0.42, 0.42), cyan);
      const cap = new Mesh(new CylinderGeometry(0.1, 0.1, 0.18, 6), dark);
      cap.rotation.z = Math.PI / 2;
      cap.position.x = 0.34;
      resourceView.add(casing, cap);
    } else {
      const coil = new Mesh(new TorusGeometry(0.42, 0.12, 6, 12), amber);
      coil.rotation.x = Math.PI / 2;
      const housing = new Mesh(new BoxGeometry(0.95, 0.24, 0.82), dark);
      housing.position.y = -0.12;
      resourceView.add(housing, coil);
    }
    resourceView.position.set(resource.position.x, resource.position.y, resource.position.z);
    resourceView.traverse((object) => {
      if (object instanceof Mesh) object.castShadow = true;
    });
    root.add(resourceView);
    resourceViews.set(itemId, resourceView);
  }

  const cart = createCart(materials);
  cart.name = "mission-shopping-cart";
  root.add(cart);

  const crewViews = new Map<string, Group>();
  manifest.selectedAgentIds.forEach((crewId) => {
    const crew = createCrewMarker(materials, crewId, manifest.items.filter((item) => item.assignedAgentId === crewId).length);
    root.add(crew);
    crewViews.set(crewId, crew);
  });

  const relayViews = new Map<string, Group>();
  for (const relay of manifest.items.filter((item) => item.definitionId === "portable-relay")) {
    const view = createRelay(materials);
    view.name = `portable-relay-${relay.instanceId}`;
    view.visible = false;
    root.add(view);
    relayViews.set(relay.instanceId, view);
  }
  const beaconViews = new Map<string, Group>();

  const update = (activeSession: MissionSessionState, activeSquad: DistributedSquadState, elapsedSeconds: number): void => {
    const cartLocation = activeSession.itemLocations[activeSession.cartId];
    if (cartLocation?.kind === "mission-ground") {
      cart.position.set(cartLocation.position.x, cartLocation.position.y, cartLocation.position.z);
      cart.rotation.y = Math.sin(elapsedSeconds * 0.7) * 0.015;
    }
    for (const [itemId, view] of resourceViews) {
      const location = activeSession.itemLocations[itemId];
      if (location?.kind === "mission-ground") {
        view.visible = true;
        view.position.set(location.position.x, location.position.y, location.position.z);
      } else if (location?.kind === "cart") {
        view.visible = true;
        view.position.set(cart.position.x, cart.position.y + 0.58, cart.position.z);
      } else {
        view.visible = false;
      }
      view.rotation.y = elapsedSeconds * 0.35;
    }
    extractionRing.rotation.z = elapsedSeconds * 0.18;
    extractionLight.intensity = 2.1 + Math.sin(elapsedSeconds * 3.2) * 0.4;
    floodPlane.position.y = 0.045 + Math.sin(elapsedSeconds * 0.8) * 0.008;
    for (const [crewId, view] of crewViews) {
      const agent = activeSquad.agents[crewId];
      view.visible = Boolean(agent && activeSquad.control.controlledAgentId !== crewId);
      if (agent) {
        view.position.set(agent.position.x, 0, agent.position.z);
        view.rotation.y = agent.facingYaw;
      }
    }
    for (const [relayId, view] of relayViews) {
      const location = activeSession.itemLocations[relayId];
      view.visible = location?.kind === "mission-ground";
      if (location?.kind === "mission-ground") {
        view.position.set(location.position.x, location.position.y, location.position.z);
        view.rotation.y = elapsedSeconds * 0.35;
      }
    }
    for (const [shortcutId, view] of shortcutViews) {
      view.visible = !activeSquad.shortcutOpenById[shortcutId];
    }
    const activeBeaconIds = new Set(Object.keys(activeSquad.signals.beacons));
    for (const beacon of Object.values(activeSquad.signals.beacons)) {
      let view = beaconViews.get(beacon.id);
      if (!view) {
        view = createSignalBeacon(materials);
        view.name = beacon.id;
        root.add(view);
        beaconViews.set(beacon.id, view);
      }
      view.position.set(beacon.position.x, beacon.position.y, beacon.position.z);
      view.rotation.y = elapsedSeconds * 1.8;
      view.scale.setScalar(0.92 + Math.sin(elapsedSeconds * 5) * 0.08);
    }
    for (const [beaconId, view] of beaconViews) {
      if (activeBeaconIds.has(beaconId)) continue;
      root.remove(view);
      disposeObjectTree(view);
      beaconViews.delete(beaconId);
    }
  };

  update(session, squad, 0);
  return {
    root,
    cameraOccluders,
    update,
    dispose(): void {
      disposeObjectTree(root);
    },
  };
}

function createRelay(materials: Ps1MaterialFactory): Group {
  const relay = new Group();
  const housing = new Mesh(new BoxGeometry(0.42, 0.72, 0.36), materials.create({ color: "#56645e" }));
  housing.position.y = 0.36;
  const antenna = new Mesh(new CylinderGeometry(0.025, 0.025, 0.8, 5), materials.createEmissive("#7bd4c8", 0.5));
  antenna.position.y = 1;
  relay.add(housing, antenna);
  return relay;
}

function createSignalBeacon(materials: Ps1MaterialFactory): Group {
  const beacon = new Group();
  const flare = new Mesh(new CylinderGeometry(0.09, 0.12, 0.54, 6), materials.createEmissive("#f1814f", 1.2));
  flare.position.y = 0.3;
  const halo = new Mesh(new TorusGeometry(0.42, 0.045, 5, 12), materials.createEmissive("#ffd08c", 0.9));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.42;
  beacon.add(flare, halo);
  return beacon;
}

function createCart(materials: Ps1MaterialFactory): Group {
  const cart = new Group();
  const metal = materials.create({ color: "#81755c", metalness: 0.4 });
  const dark = materials.create({ color: "#1f2725" });
  const basket = new Mesh(new BoxGeometry(1.15, 0.55, 0.82), metal);
  basket.position.y = 0.35;
  cart.add(basket);
  const handle = new Mesh(new BoxGeometry(1.25, 0.08, 0.08), dark);
  handle.position.set(0, 0.84, 0.48);
  cart.add(handle);
  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.28, 0.28]) {
      const wheel = new Mesh(new CylinderGeometry(0.1, 0.1, 0.08, 6), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, -0.24, z);
      cart.add(wheel);
    }
  }
  return cart;
}

function createCrewMarker(materials: Ps1MaterialFactory, id: string, equipmentCount: number): Group {
  const crew = new Group();
  crew.name = `selected-crew-${id}`;
  const suit = materials.create({ color: id === "mara" ? "#9b765e" : "#6b8784" });
  const visor = materials.createEmissive("#8fdad6", 0.55);
  const body = new Mesh(new BoxGeometry(0.58, 1.05, 0.38), suit);
  body.position.y = 0.8;
  const head = new Mesh(new BoxGeometry(0.48, 0.42, 0.42), visor);
  head.position.y = 1.54;
  crew.add(body, head);
  for (let index = 0; index < equipmentCount; index += 1) {
    const equipment = new Mesh(new BoxGeometry(0.18, 0.22, 0.16), materials.create({ color: "#c7a363" }));
    equipment.position.set(-0.2 + index * 0.2, 0.86, -0.27);
    crew.add(equipment);
  }
  return crew;
}
