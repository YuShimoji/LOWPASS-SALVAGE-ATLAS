import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  PointLight,
  TorusGeometry,
  Vector3,
  type Object3D,
} from "three";
import type { ExpeditionManifest } from "../../game/mission/expeditionTypes";
import type { FixedMissionDefinition } from "../../game/mission/fixedMissionTypes";
import type { MissionSessionState } from "../../game/mission/MissionSession";
import type { DistributedSquadState } from "../../game/squad/squadTypes";
import type { ThreatEncounterState } from "../../game/threat/threatTypes";
import type { PorterAndroidState } from "../../game/machines/machineTypes";
import type { Ps1MaterialFactory } from "../materials/Ps1MaterialFactory";
import { disposeObjectTree } from "./disposeObjectTree";
import type { MissionWorldView } from "./missionWorldView";
import type {
  CanaryRoleInstance,
  LoadedCanaryMissionAssetPack,
} from "../assets/CanaryMissionAssetPack";

export function createFloodedMarket(
  materials: Ps1MaterialFactory,
  definition: FixedMissionDefinition,
  manifest: ExpeditionManifest,
  session: MissionSessionState,
  squad: DistributedSquadState,
  threat: ThreatEncounterState,
  porter: PorterAndroidState,
  canaryAssetPack: LoadedCanaryMissionAssetPack | null = null,
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
  const relayIds = new Set([
    ...manifest.items.filter((item) => item.definitionId === "portable-relay").map((item) => item.instanceId),
    ...Object.entries(session.itemLocations)
      .filter(([itemId, location]) => itemId.startsWith("relay-") && location.kind === "mission-ground")
      .map(([itemId]) => itemId),
  ]);
  for (const relayId of relayIds) {
    const view = createRelay(materials);
    view.name = `portable-relay-${relayId}`;
    view.visible = false;
    root.add(view);
    relayViews.set(relayId, view);
  }
  const beaconViews = new Map<string, Group>();
  const scoutDrone = createScoutDrone(materials);
  scoutDrone.root.name = "phase-e-hostile-scout-drone";
  root.add(scoutDrone.root);
  const additionalDroneViews = new Map<string, DroneView>();
  const ensureAdditionalDroneView = (drone: ThreatEncounterState["additionalDrones"][number]): DroneView => {
    const existing = additionalDroneViews.get(drone.id);
    if (existing) return existing;
    const view = drone.definitionId === "hostile-observation-drone"
      ? createObservationDrone(materials)
      : createScoutDrone(materials);
    view.root.name = drone.definitionId === "hostile-observation-drone"
      ? `phase-g-hostile-observation-drone-${drone.id}`
      : `phase-e-hostile-scout-drone-${drone.id}`;
    root.add(view.root);
    additionalDroneViews.set(drone.id, view);
    return view;
  };
  for (const drone of threat.additionalDrones) ensureAdditionalDroneView(drone);
  const porterView = createPorterAndroid(materials);
  porterView.root.name = "phase-e-friendly-porter-android";
  root.add(porterView.root);
  const canaryViews = canaryAssetPack
    ? {
        needle: canaryAssetPack.createInstance("hostile-needle"),
        watcher: canaryAssetPack.createInstance("hostile-watcher"),
        porter: canaryAssetPack.createInstance("allied-porter"),
        cart: canaryAssetPack.createInstance("push-cart"),
        terminal: canaryAssetPack.createInstance("field-terminal"),
      }
    : null;
  if (canaryViews) {
    root.add(
      canaryViews.needle.root,
      canaryViews.watcher.root,
      canaryViews.porter.root,
      canaryViews.cart.root,
      canaryViews.terminal.root,
    );
    canaryViews.needle.root.visible = false;
    canaryViews.watcher.root.visible = false;
    canaryViews.porter.root.visible = false;
    canaryViews.cart.root.visible = false;
    canaryViews.terminal.root.visible = false;
    cart.visible = false;
    porterView.root.visible = false;
  }
  const canaryLockBeam = canaryViews
    ? new Mesh(new BoxGeometry(0.055, 0.055, 1), materials.createEmissive("#ef745f", 1.15))
    : null;
  const canaryWideScan = canaryViews
    ? new Mesh(
        new BoxGeometry(3.4, 0.018, 4.4),
        materials.create({
          color: "#d9b56f",
          emissive: "#9b7843",
          emissiveIntensity: 0.35,
          transparent: true,
          opacity: 0.1,
          depthWrite: false,
        }),
      )
    : null;
  if (canaryLockBeam) {
    canaryLockBeam.visible = false;
    root.add(canaryLockBeam);
  }
  if (canaryWideScan) {
    canaryWideScan.visible = false;
    root.add(canaryWideScan);
  }
  const terminalItem = manifest.items.find((item) => item.definitionId === "field-terminal") ?? null;
  const worldAnchor = new Vector3();
  const worldTarget = new Vector3();
  const lastKnownMarker = new Mesh(
    new TorusGeometry(0.7, 0.045, 5, 16),
    materials.createEmissive("#df9259", 0.58),
  );
  lastKnownMarker.name = "controlled-agent-last-known-threat-marker";
  lastKnownMarker.rotation.x = Math.PI / 2;
  lastKnownMarker.visible = false;
  root.add(lastKnownMarker);

  const update = (
    activeSession: MissionSessionState,
    activeSquad: DistributedSquadState,
    activeThreat: ThreatEncounterState,
    activePorter: PorterAndroidState,
    elapsedSeconds: number,
  ): void => {
    const cartLocation = activeSession.itemLocations[activeSession.cartId];
    if (cartLocation?.kind === "mission-ground") {
      cart.position.set(cartLocation.position.x, cartLocation.position.y, cartLocation.position.z);
      cart.rotation.y = activeSession.cartFacingYaw;
      if (canaryViews) {
        setCanaryTransform(canaryViews.cart, cartLocation.position.x, cartLocation.position.y - 0.48, cartLocation.position.z, activeSession.cartFacingYaw);
        canaryViews.cart.root.visible = true;
      }
    }
    for (const [itemId, view] of resourceViews) {
      const location = activeSession.itemLocations[itemId];
      if (location?.kind === "mission-ground") {
        view.visible = true;
        view.position.set(location.position.x, location.position.y, location.position.z);
      } else if (location?.kind === "cart") {
        view.visible = true;
        view.position.set(cart.position.x, cart.position.y + 0.58, cart.position.z);
      } else if (location?.kind === "machine-carried" && location.machineId === activePorter.id) {
        view.visible = true;
        view.position.set(activePorter.position.x, activePorter.position.y + 1.05, activePorter.position.z);
      } else if (location?.kind === "extraction-pad") {
        view.visible = true;
        view.position.set(location.position.x, location.position.y + 0.28, location.position.z);
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
        view.scale.setScalar(activeSquad.disabledRelayItemIds.includes(relayId) ? 0.82 : 1);
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
    const drone = activeThreat.drone;
    scoutDrone.root.visible = drone.visible && !canaryViews;
    scoutDrone.root.position.set(drone.position.x, drone.position.y, drone.position.z);
    scoutDrone.root.rotation.y = drone.facingYaw;
    scoutDrone.root.rotation.z = drone.mode === "disabled" ? 0.72 : 0;
    scoutDrone.root.rotation.x = drone.mode === "lock-on" ? -0.24 : 0;
    scoutDrone.scanBeam.visible = drone.mode === "lock-on" && Boolean(drone.lastKnownTargetPosition);
    if (scoutDrone.scanBeam.visible && drone.lastKnownTargetPosition) {
      orientScanBeam(scoutDrone.scanBeam, drone.position, drone.lastKnownTargetPosition);
    }
    scoutDrone.rotor.rotation.y = elapsedSeconds * (drone.active ? 8 : 0.25);
    if (canaryViews) {
      setCanaryTransform(canaryViews.needle, drone.position.x, drone.position.y - 1.55, drone.position.z, drone.facingYaw);
      canaryViews.needle.root.visible = drone.visible;
      canaryViews.needle.root.rotation.x = drone.mode === "lock-on" ? -0.24 : 0;
      if (canaryLockBeam) {
        canaryLockBeam.visible = drone.mode === "lock-on" && Boolean(drone.lastKnownTargetPosition);
        const lockOrigin = canaryViews.needle.bindings["socket-needle-lock-origin"];
        if (canaryLockBeam.visible && lockOrigin && drone.lastKnownTargetPosition) {
          canaryViews.needle.root.updateMatrixWorld(true);
          lockOrigin.getWorldPosition(worldAnchor);
          worldTarget.set(
            drone.lastKnownTargetPosition.x,
            drone.lastKnownTargetPosition.y,
            drone.lastKnownTargetPosition.z,
          );
          orientWorldScanBeam(canaryLockBeam, worldAnchor, worldTarget);
        }
      }
    }
    const controlledKnowledge = activeThreat.byAgent[activeSquad.control.controlledAgentId];
    const controlledContact = controlledKnowledge?.contact ?? null;
    scoutDrone.contactHalo.visible = Boolean(controlledContact?.freshness === "live" && drone.visible);
    scoutDrone.contactHalo.rotation.z = elapsedSeconds * 1.7;
    lastKnownMarker.visible = controlledContact?.freshness === "stale";
    if (controlledContact) {
      lastKnownMarker.position.set(controlledContact.position.x, 0.12, controlledContact.position.z);
      lastKnownMarker.rotation.z = elapsedSeconds * 0.35;
    }
    const activeAdditionalIds = new Set(activeThreat.additionalDrones.map((droneState) => droneState.id));
    for (const view of additionalDroneViews.values()) view.root.visible = false;
    activeThreat.additionalDrones.forEach((additional) => {
      const view = ensureAdditionalDroneView(additional);
      view.root.visible = additional.visible && !(canaryViews && additional.definitionId === "hostile-observation-drone");
      view.root.position.set(additional.position.x, additional.position.y, additional.position.z);
      view.root.rotation.y = additional.facingYaw;
      view.rotor.rotation.y = elapsedSeconds * 7.2;
      view.scanBeam.visible = false;
      if (view.wideScan) {
        view.wideScan.visible = additional.active && additional.mode !== "disabled";
        view.wideScan.rotation.y = Math.sin(elapsedSeconds * 0.85) * 0.46;
      }
      if (canaryViews && additional.definitionId === "hostile-observation-drone") {
        setCanaryTransform(
          canaryViews.watcher,
          additional.position.x,
          additional.position.y - 2.65,
          additional.position.z,
          additional.facingYaw,
        );
        canaryViews.watcher.root.visible = additional.visible;
        if (canaryWideScan) {
          const scanOrigin = canaryViews.watcher.bindings["socket-watcher-scan-origin"];
          canaryWideScan.visible = additional.active && additional.mode !== "disabled";
          if (scanOrigin) {
            canaryViews.watcher.root.updateMatrixWorld(true);
            scanOrigin.getWorldPosition(worldAnchor);
            canaryWideScan.position.set(worldAnchor.x, worldAnchor.y - 0.72, worldAnchor.z - 2.1);
            canaryWideScan.rotation.y = additional.facingYaw + Math.sin(elapsedSeconds * 0.85) * 0.46;
          }
        }
      }
    });
    for (const [id, view] of additionalDroneViews) {
      if (!activeAdditionalIds.has(id)) view.root.visible = false;
    }
    porterView.root.position.set(activePorter.position.x, activePorter.position.y - 0.93, activePorter.position.z);
    porterView.root.rotation.y = activePorter.facing;
    porterView.statusLight.visible = activePorter.authenticated;
    porterView.loadArms.rotation.x = activePorter.carriedItemId ? -0.34 : Math.sin(elapsedSeconds * 2) * 0.03;
    porterView.root.rotation.z = activePorter.mode === "gate-rejected" ? Math.sin(elapsedSeconds * 8) * 0.025 : 0;
    if (canaryViews) {
      setCanaryTransform(
        canaryViews.porter,
        activePorter.position.x,
        activePorter.position.y - 0.93,
        activePorter.position.z,
        activePorter.facing,
      );
      canaryViews.porter.root.visible = true;
      canaryViews.porter.root.rotation.z = activePorter.mode === "gate-rejected" ? Math.sin(elapsedSeconds * 8) * 0.025 : 0;
      const terminalOwner = terminalItem ? activeSquad.agents[terminalItem.assignedAgentId] : null;
      const terminalLocation = terminalItem ? activeSession.itemLocations[terminalItem.instanceId] : null;
      canaryViews.terminal.root.visible = Boolean(terminalOwner && terminalLocation?.kind === "crew");
      if (terminalOwner && canaryViews.terminal.root.visible) {
        setCanaryTransform(
          canaryViews.terminal,
          terminalOwner.position.x + 0.38,
          terminalOwner.position.y - 0.93,
          terminalOwner.position.z + 0.18,
          terminalOwner.facingYaw,
        );
      }
      const cartLoadAnchor = canaryViews.cart.bindings["socket-cart-load"];
      if (cartLoadAnchor) {
        canaryViews.cart.root.updateMatrixWorld(true);
        cartLoadAnchor.getWorldPosition(worldAnchor);
        for (const [itemId, view] of resourceViews) {
          if (activeSession.itemLocations[itemId]?.kind === "cart") view.position.copy(worldAnchor);
        }
      }
      const porterCarryAnchor = canaryViews.porter.bindings["socket-porter-carry"];
      if (porterCarryAnchor) {
        canaryViews.porter.root.updateMatrixWorld(true);
        porterCarryAnchor.getWorldPosition(worldAnchor);
        for (const [itemId, view] of resourceViews) {
          const location = activeSession.itemLocations[itemId];
          if (location?.kind === "machine-carried" && location.machineId === activePorter.id) view.position.copy(worldAnchor);
        }
      }
    }
  };

  update(session, squad, threat, porter, 0);
  return {
    root,
    cameraOccluders,
    assetPackReadback: canaryAssetPack
      ? {
          mode: "canary-v1",
          exactHash: canaryAssetPack.registry.exactGlbSha256,
          loadDurationMs: canaryAssetPack.loadDurationMs,
          glbBytes: canaryAssetPack.glbBytes,
          resolvedBindingIds: canaryAssetPack.resolvedBindingIds,
        }
      : {
          mode: "primitive",
          exactHash: null,
          loadDurationMs: 0,
          glbBytes: 0,
          resolvedBindingIds: [],
        },
    update,
    dispose(): void {
      canaryAssetPack?.dispose();
      disposeObjectTree(root);
    },
  };
}

interface DroneView {
  readonly root: Group;
  readonly rotor: Group;
  readonly contactHalo: Mesh;
  readonly scanBeam: Mesh;
  readonly wideScan: Mesh | null;
}

function setCanaryTransform(
  instance: CanaryRoleInstance,
  x: number,
  y: number,
  z: number,
  yaw: number,
): void {
  instance.root.position.set(x, y, z);
  instance.root.rotation.y = yaw;
}

function orientWorldScanBeam(beam: Mesh, from: Vector3, to: Vector3): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const distance = Math.max(0.1, Math.hypot(dx, dy, dz));
  beam.position.set((from.x + to.x) * 0.5, (from.y + to.y) * 0.5, (from.z + to.z) * 0.5);
  beam.rotation.y = Math.atan2(-dx, -dz);
  beam.rotation.x = Math.atan2(dy, Math.hypot(dx, dz));
  beam.scale.z = distance;
}

function createScoutDrone(materials: Ps1MaterialFactory): DroneView {
  const root = new Group();
  const hull = new Mesh(new BoxGeometry(0.74, 0.28, 0.5), materials.create({ color: "#3d4641", metalness: 0.48 }));
  hull.castShadow = true;
  const optic = new Mesh(new BoxGeometry(0.18, 0.16, 0.08), materials.createEmissive("#d95d50", 0.92));
  optic.position.set(0, -0.02, -0.29);
  const rotor = new Group();
  for (const x of [-0.52, 0.52]) {
    const arm = new Mesh(new BoxGeometry(0.44, 0.045, 0.05), materials.create({ color: "#202725" }));
    arm.position.x = x;
    const ring = new Mesh(new TorusGeometry(0.23, 0.028, 5, 12), materials.create({ color: "#59625b", metalness: 0.5 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.x = x;
    rotor.add(arm, ring);
  }
  const contactHalo = new Mesh(
    new TorusGeometry(0.62, 0.045, 5, 16),
    materials.createEmissive("#ef745f", 0.86),
  );
  contactHalo.rotation.x = Math.PI / 2;
  contactHalo.position.y = 0.42;
  contactHalo.visible = false;
  const scanBeam = new Mesh(
    new BoxGeometry(0.055, 0.055, 1),
    materials.createEmissive("#ef745f", 1.15),
  );
  scanBeam.visible = false;
  root.add(hull, optic, rotor, contactHalo, scanBeam);
  return { root, rotor, contactHalo, scanBeam, wideScan: null };
}

function createObservationDrone(materials: Ps1MaterialFactory): DroneView {
  const root = new Group();
  const hull = new Mesh(new BoxGeometry(1.22, 0.2, 0.42), materials.create({ color: "#4b5652", metalness: 0.42 }));
  const keel = new Mesh(new BoxGeometry(0.28, 0.34, 0.5), materials.create({ color: "#26302e", metalness: 0.36 }));
  keel.position.y = -0.16;
  const optic = new Mesh(new BoxGeometry(0.72, 0.11, 0.08), materials.createEmissive("#e0a35c", 0.86));
  optic.position.set(0, -0.08, -0.26);
  const rotor = new Group();
  for (const x of [-0.78, 0.78]) {
    const arm = new Mesh(new BoxGeometry(0.48, 0.04, 0.08), materials.create({ color: "#252d2b" }));
    arm.position.x = x;
    const ring = new Mesh(new TorusGeometry(0.27, 0.025, 5, 12), materials.create({ color: "#697670", metalness: 0.48 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.x = x;
    rotor.add(arm, ring);
  }
  const contactHalo = new Mesh(
    new TorusGeometry(0.74, 0.035, 5, 16),
    materials.createEmissive("#e0a35c", 0.62),
  );
  contactHalo.rotation.x = Math.PI / 2;
  contactHalo.position.y = 0.38;
  contactHalo.visible = false;
  const scanBeam = new Mesh(new BoxGeometry(0.01, 0.01, 0.01), materials.createEmissive("#e0a35c", 0.2));
  scanBeam.visible = false;
  const wideScan = new Mesh(
    new BoxGeometry(3.4, 0.018, 4.4),
    materials.create({
      color: "#d9b56f",
      emissive: "#9b7843",
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    }),
  );
  wideScan.position.set(0, -0.72, -2.1);
  root.add(hull, keel, optic, rotor, contactHalo, scanBeam, wideScan);
  return { root, rotor, contactHalo, scanBeam, wideScan };
}

function createPorterAndroid(materials: Ps1MaterialFactory): {
  readonly root: Group;
  readonly loadArms: Group;
  readonly statusLight: Mesh;
} {
  const root = new Group();
  const chassis = new Mesh(new BoxGeometry(0.92, 1.15, 0.7), materials.create({ color: "#66716a", metalness: 0.34 }));
  chassis.position.y = 0.78;
  const base = new Mesh(new BoxGeometry(1.15, 0.28, 0.86), materials.create({ color: "#252d2b" }));
  base.position.y = 0.14;
  const statusLight = new Mesh(new BoxGeometry(0.42, 0.12, 0.05), materials.createEmissive("#70d6b3", 0.78));
  statusLight.position.set(0, 1.12, -0.38);
  statusLight.visible = false;
  const loadArms = new Group();
  for (const x of [-0.52, 0.52]) {
    const arm = new Mesh(new BoxGeometry(0.18, 0.82, 0.18), materials.create({ color: "#9b8058", metalness: 0.22 }));
    arm.position.set(x, 0.68, -0.28);
    loadArms.add(arm);
  }
  root.add(chassis, base, statusLight, loadArms);
  return { root, loadArms, statusLight };
}

function orientScanBeam(beam: Mesh, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): void {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.max(0.1, Math.hypot(dx, dz));
  beam.position.set(dx * 0.5, (to.y - from.y) * 0.5, dz * 0.5);
  beam.rotation.y = Math.atan2(-dx, -dz);
  beam.scale.z = distance;
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
