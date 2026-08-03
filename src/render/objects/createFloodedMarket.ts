import {
  BoxGeometry,
  ConeGeometry,
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
  const concrete = materials.create({ color: "#34413e", roughness: 0.94 });
  const wall = materials.create({ color: "#5b675e", roughness: 0.9 });
  const shelf = materials.create({ color: "#465047", metalness: 0.28, roughness: 0.78 });
  const water = materials.create({
    color: "#0d3439",
    emissive: "#08292d",
    emissiveIntensity: 0.34,
    metalness: 0.12,
    roughness: 0.34,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
  });
  const waterSheen = materials.create({
    color: "#2f7b80",
    emissive: "#18575d",
    emissiveIntensity: 0.42,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    roughness: 0.22,
  });
  const amber = materials.createEmissive("#e6a85d", 0.9);
  const cyan = materials.createEmissive("#64ddd3", 0.95);
  const red = materials.createEmissive("#ef654f", 0.85);
  const dark = materials.create({ color: "#141d1d", roughness: 0.9 });
  const ivory = materials.create({ color: "#b8b18f", roughness: 0.88 });
  const bronze = materials.create({ color: "#735f3e", metalness: 0.34, roughness: 0.76 });
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

  const floodPlane = new Mesh(new PlaneGeometry(13.4, 13.4, 8, 8), water);
  floodPlane.rotation.x = -Math.PI / 2;
  floodPlane.position.y = 0.045;
  root.add(floodPlane);
  const floodHighlight = new Mesh(new PlaneGeometry(9.8, 12.4, 6, 8), waterSheen);
  floodHighlight.rotation.x = -Math.PI / 2;
  floodHighlight.position.set(0, 0.056, -0.2);
  floodHighlight.rotation.z = -0.07;
  root.add(floodHighlight);

  for (const z of [-5.2, -3.2, -1.2, 0.8, 2.8, 4.8]) {
    for (const x of [-1.05, 1.05]) {
      const routeStud = new Mesh(new BoxGeometry(0.16, 0.035, 0.38), z < 3.5 ? bronze : amber);
      routeStud.position.set(x, 0.072, z);
      root.add(routeStud);
    }
  }

  for (const x of [-5.6, -2.8, 0, 2.8, 5.6]) {
    const ceilingStrip = new Mesh(new BoxGeometry(1.45, 0.08, 0.18), x === 0 ? red : amber);
    ceilingStrip.position.set(x, 3.25, -2.6);
    root.add(ceilingStrip);
  }

  const marketSign = new Mesh(new BoxGeometry(4.2, 0.85, 0.18), materials.createEmissive("#6b8d7e", 0.48));
  marketSign.position.set(0, 2.55, -6.72);
  root.add(marketSign);

  for (const x of [-3.4, 0, 3.4]) {
    const hangingSign = new Group();
    const panel = new Mesh(new BoxGeometry(2.05, 0.52, 0.12), dark);
    const cap = new Mesh(new BoxGeometry(2.15, 0.08, 0.16), x === 0 ? red : amber);
    cap.position.y = 0.3;
    for (const side of [-1, 1]) {
      const hanger = new Mesh(new CylinderGeometry(0.025, 0.025, 0.62, 5), bronze);
      hanger.position.set(side * 0.72, 0.61, 0);
      hangingSign.add(hanger);
    }
    hangingSign.add(panel, cap);
    hangingSign.position.set(x, 2.35, 0.6);
    root.add(hangingSign);
  }

  for (const x of [-4.8, -1.6, 1.6, 4.8]) {
    const checkout = new Mesh(new BoxGeometry(1.1, 0.78, 1.35), dark);
    checkout.position.set(x, 0.39, 4.9);
    checkout.castShadow = true;
    const counter = new Mesh(new BoxGeometry(1.24, 0.13, 1.46), ivory);
    counter.position.set(x, 0.83, 4.9);
    const locator = new Mesh(new BoxGeometry(0.34, 0.09, 0.06), amber);
    locator.position.set(x, 0.72, 4.2);
    root.add(checkout, counter, locator);
  }

  for (const x of [-2.5, 0, 2.5]) {
    const servicePanel = new Group();
    const housing = new Mesh(new BoxGeometry(1.5, 0.92, 0.18), dark);
    const fan = new Mesh(new TorusGeometry(0.31, 0.055, 6, 14), bronze);
    fan.position.z = -0.12;
    servicePanel.add(housing, fan);
    servicePanel.position.set(x, 1.58, -6.58);
    root.add(servicePanel);
  }

  const extractionRing = new Mesh(new TorusGeometry(1.35, 0.1, 6, 20), cyan);
  extractionRing.rotation.x = Math.PI / 2;
  extractionRing.position.set(
    definition.extractionPoint.x,
    0.09,
    definition.extractionPoint.z,
  );
  root.add(extractionRing);
  const extractionSurface = new Mesh(
    new CylinderGeometry(1.22, 1.22, 0.025, 20),
    materials.create({
      color: "#276c6d",
      emissive: "#3aaba5",
      emissiveIntensity: 0.52,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
  );
  extractionSurface.position.set(definition.extractionPoint.x, 0.075, definition.extractionPoint.z);
  root.add(extractionSurface);
  for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
    const marker = new Mesh(new CylinderGeometry(0.055, 0.08, 0.42, 6), cyan);
    marker.position.set(
      definition.extractionPoint.x + Math.cos(angle) * 1.46,
      0.25,
      definition.extractionPoint.z + Math.sin(angle) * 1.46,
    );
    root.add(marker);
  }
  const extractionLight = new PointLight("#63d8cd", 2.4, 6, 2);
  extractionLight.position.set(definition.extractionPoint.x, 1.6, definition.extractionPoint.z);
  root.add(extractionLight);

  const resourceViews = new Map<string, Group>();
  for (const resource of definition.salvage) {
    const itemId = `${session.sessionId}:${resource.sourceId}`;
    const resourceView = new Group();
    resourceView.name = `salvage-${resource.sourceId}`;
    if (resource.resourceType === "water-filter") {
      const casing = new Mesh(new CylinderGeometry(0.19, 0.19, 0.54, 8), ivory);
      casing.rotation.z = Math.PI / 2;
      const band = new Mesh(new TorusGeometry(0.205, 0.045, 5, 10), cyan);
      band.rotation.y = Math.PI / 2;
      for (const x of [-0.29, 0.29]) {
        const cap = new Mesh(new CylinderGeometry(0.14, 0.14, 0.08, 8), dark);
        cap.rotation.z = Math.PI / 2;
        cap.position.x = x;
        resourceView.add(cap);
      }
      resourceView.add(casing, band);
    } else {
      const housing = new Mesh(new BoxGeometry(0.98, 0.56, 0.78), ivory);
      const grille = new Mesh(new TorusGeometry(0.24, 0.055, 6, 14), bronze);
      grille.rotation.y = Math.PI / 2;
      grille.position.x = -0.51;
      for (const z of [-0.24, 0, 0.24]) {
        const coil = new Mesh(new CylinderGeometry(0.045, 0.045, 0.8, 6), bronze);
        coil.rotation.z = Math.PI / 2;
        coil.position.set(0.05, 0, z);
        resourceView.add(coil);
      }
      const status = new Mesh(new BoxGeometry(0.12, 0.08, 0.04), amber);
      status.position.set(0.5, 0.15, -0.2);
      resourceView.add(housing, grille, status);
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
    floodHighlight.position.x = Math.sin(elapsedSeconds * 0.18) * 0.12;
    floodHighlight.position.z = -0.2 + Math.cos(elapsedSeconds * 0.14) * 0.1;
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
  const shell = materials.create({ color: "#2d3532", metalness: 0.52, roughness: 0.58 });
  const guard = materials.create({ color: "#56604f", metalness: 0.34, roughness: 0.72 });
  const hull = new Mesh(new ConeGeometry(0.4, 1.02, 4), shell);
  hull.rotation.x = -Math.PI / 2;
  hull.position.z = -0.08;
  hull.castShadow = true;
  const spine = new Mesh(new BoxGeometry(0.34, 0.18, 0.58), guard);
  spine.position.set(0, 0.08, 0.12);
  const optic = new Mesh(new BoxGeometry(0.24, 0.1, 0.055), materials.createEmissive("#ef654f", 1.05));
  optic.position.set(0, -0.01, -0.57);
  const keel = new Mesh(new ConeGeometry(0.11, 0.38, 4), shell);
  keel.position.set(0, -0.27, -0.2);
  const rotor = new Group();
  for (const x of [-0.52, 0.52]) {
    const arm = new Mesh(new BoxGeometry(0.38, 0.07, 0.12), shell);
    arm.position.set(x * 0.52, 0.02, 0.09);
    const ring = new Mesh(new TorusGeometry(0.24, 0.045, 6, 14), guard);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.02, 0.09);
    const blade = new Mesh(new BoxGeometry(0.38, 0.025, 0.055), shell);
    blade.position.set(x, 0.02, 0.09);
    rotor.add(arm, ring, blade);
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
  root.add(hull, spine, optic, keel, rotor, contactHalo, scanBeam);
  return { root, rotor, contactHalo, scanBeam, wideScan: null };
}

function createObservationDrone(materials: Ps1MaterialFactory): DroneView {
  const root = new Group();
  const shell = materials.create({ color: "#394541", metalness: 0.46, roughness: 0.62 });
  const guard = materials.create({ color: "#77745f", metalness: 0.32, roughness: 0.72 });
  const hull = new Mesh(new BoxGeometry(1.12, 0.25, 0.56), shell);
  const canopy = new Mesh(new BoxGeometry(0.58, 0.22, 0.72), guard);
  canopy.position.y = 0.12;
  const keel = new Mesh(new BoxGeometry(0.34, 0.42, 0.52), shell);
  keel.position.y = -0.25;
  const optic = new Mesh(new BoxGeometry(0.8, 0.12, 0.055), materials.createEmissive("#e6a85d", 0.98));
  optic.position.set(0, -0.08, -0.315);
  const rotor = new Group();
  for (const x of [-0.76, 0.76]) {
    for (const z of [-0.19, 0.19]) {
      const pod = new Mesh(new BoxGeometry(0.48, 0.12, 0.36), shell);
      pod.position.set(x, 0, z);
      const ring = new Mesh(new TorusGeometry(0.18, 0.035, 6, 12), guard);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.075, z);
      const blade = new Mesh(new BoxGeometry(0.28, 0.02, 0.045), shell);
      blade.position.set(x, 0.075, z);
      rotor.add(pod, ring, blade);
    }
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
  root.add(hull, canopy, keel, optic, rotor, contactHalo, scanBeam, wideScan);
  return { root, rotor, contactHalo, scanBeam, wideScan };
}

function createPorterAndroid(materials: Ps1MaterialFactory): {
  readonly root: Group;
  readonly loadArms: Group;
  readonly statusLight: Mesh;
} {
  const root = new Group();
  const shell = materials.create({ color: "#72776a", metalness: 0.32, roughness: 0.76 });
  const dark = materials.create({ color: "#1b2423", roughness: 0.88 });
  const bronze = materials.create({ color: "#806845", metalness: 0.3, roughness: 0.74 });
  const chassis = new Mesh(new BoxGeometry(1.02, 0.72, 0.78), shell);
  chassis.position.y = 0.78;
  const canopy = new Mesh(new BoxGeometry(0.76, 0.2, 0.68), bronze);
  canopy.position.y = 1.22;
  const base = new Mesh(new BoxGeometry(1.2, 0.34, 0.92), dark);
  base.position.y = 0.26;
  const statusLight = new Mesh(new BoxGeometry(0.46, 0.14, 0.055), materials.createEmissive("#64ddd3", 0.95));
  statusLight.position.set(0, 0.92, -0.42);
  statusLight.visible = false;
  for (const x of [-0.52, 0.52]) {
    for (const z of [-0.31, 0.31]) {
      const wheel = new Mesh(new CylinderGeometry(0.18, 0.18, 0.12, 8), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.2, z);
      root.add(wheel);
    }
  }
  const loadArms = new Group();
  for (const x of [-0.52, 0.52]) {
    const arm = new Mesh(new BoxGeometry(0.15, 0.72, 0.16), bronze);
    arm.position.set(x, 0.7, -0.27);
    const fork = new Mesh(new BoxGeometry(0.15, 0.12, 0.58), bronze);
    fork.position.set(x, 0.36, -0.48);
    loadArms.add(arm, fork);
  }
  root.add(chassis, canopy, base, statusLight, loadArms);
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
  const shell = materials.create({ color: "#4e5c56", metalness: 0.28, roughness: 0.78 });
  const bronze = materials.create({ color: "#806845", metalness: 0.32, roughness: 0.72 });
  const housing = new Mesh(new CylinderGeometry(0.25, 0.3, 0.34, 8), shell);
  housing.position.y = 0.22;
  const linkRing = new Mesh(new TorusGeometry(0.26, 0.045, 6, 12), materials.createEmissive("#64ddd3", 0.74));
  linkRing.rotation.x = Math.PI / 2;
  linkRing.position.y = 0.38;
  const antenna = new Mesh(new CylinderGeometry(0.025, 0.035, 0.82, 6), bronze);
  antenna.position.y = 0.86;
  for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const foot = new Mesh(new BoxGeometry(0.08, 0.08, 0.34), bronze);
    foot.position.set(Math.sin(angle) * 0.22, 0.07, Math.cos(angle) * 0.22);
    foot.rotation.y = angle;
    relay.add(foot);
  }
  relay.add(housing, linkRing, antenna);
  return relay;
}

function createSignalBeacon(materials: Ps1MaterialFactory): Group {
  const beacon = new Group();
  const cage = materials.create({ color: "#332725", metalness: 0.36, roughness: 0.72 });
  const base = new Mesh(new CylinderGeometry(0.15, 0.19, 0.22, 8), cage);
  base.position.y = 0.12;
  const flare = new Mesh(new CylinderGeometry(0.08, 0.12, 0.48, 6), materials.createEmissive("#ff694e", 1.35));
  flare.position.y = 0.42;
  const halo = new Mesh(new TorusGeometry(0.42, 0.045, 5, 12), materials.createEmissive("#ffd08c", 0.9));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.5;
  for (const x of [-0.13, 0.13]) {
    const bar = new Mesh(new BoxGeometry(0.035, 0.52, 0.035), cage);
    bar.position.set(x, 0.43, 0);
    beacon.add(bar);
  }
  beacon.add(base, flare, halo);
  return beacon;
}

function createCart(materials: Ps1MaterialFactory): Group {
  const cart = new Group();
  const metal = materials.create({ color: "#7c6948", metalness: 0.46, roughness: 0.7 });
  const dark = materials.create({ color: "#17201f", roughness: 0.88 });
  const strap = materials.createEmissive("#d99a52", 0.48);
  const floor = new Mesh(new BoxGeometry(1.06, 0.1, 0.76), dark);
  floor.position.y = 0.08;
  cart.add(floor);
  for (const x of [-0.54, 0.54]) {
    for (const z of [-0.36, 0.36]) {
      const post = new Mesh(new BoxGeometry(0.055, 0.58, 0.055), metal);
      post.position.set(x, 0.39, z);
      cart.add(post);
    }
  }
  for (const y of [0.2, 0.48, 0.68]) {
    for (const z of [-0.36, 0.36]) {
      const rail = new Mesh(new BoxGeometry(1.12, 0.045, 0.045), metal);
      rail.position.set(0, y, z);
      cart.add(rail);
    }
    for (const x of [-0.54, 0.54]) {
      const rail = new Mesh(new BoxGeometry(0.045, 0.045, 0.76), metal);
      rail.position.set(x, y, 0);
      cart.add(rail);
    }
  }
  for (const x of [-0.32, 0.32]) {
    const tieDown = new Mesh(new BoxGeometry(0.055, 0.64, 0.045), strap);
    tieDown.rotation.x = Math.PI / 2;
    tieDown.position.set(x, 0.71, 0);
    cart.add(tieDown);
  }
  const handle = new Mesh(new BoxGeometry(1.24, 0.09, 0.09), dark);
  handle.position.set(0, 0.88, 0.5);
  for (const x of [-0.5, 0.5]) {
    const stem = new Mesh(new BoxGeometry(0.07, 0.55, 0.07), metal);
    stem.position.set(x, 0.62, 0.46);
    stem.rotation.x = -0.16;
    cart.add(stem);
  }
  cart.add(handle);
  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.28, 0.28]) {
      const wheel = new Mesh(new CylinderGeometry(0.12, 0.12, 0.1, 8), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, -0.36, z);
      cart.add(wheel);
    }
  }
  return cart;
}

function createCrewMarker(materials: Ps1MaterialFactory, id: string, equipmentCount: number): Group {
  const crew = new Group();
  crew.name = `selected-crew-${id}`;
  const suit = materials.create({ color: id === "mara" ? "#8b674f" : id === "ito" ? "#607a7b" : "#aa925d" });
  const armor = materials.create({ color: "#c2b991", roughness: 0.88 });
  const dark = materials.create({ color: "#151e20", roughness: 0.88 });
  const visor = materials.createEmissive("#70ddd3", 0.76);
  const body = new Mesh(new BoxGeometry(0.58, 0.72, 0.4), suit);
  body.position.y = 0.88;
  const chest = new Mesh(new BoxGeometry(0.4, 0.28, 0.07), armor);
  chest.position.set(0, 0.92, -0.235);
  const head = new Mesh(new CylinderGeometry(0.23, 0.25, 0.36, 6), dark);
  head.position.y = 1.48;
  const face = new Mesh(new BoxGeometry(0.3, 0.11, 0.05), visor);
  face.position.set(0, 1.49, -0.25);
  const pack = new Mesh(new BoxGeometry(0.44, 0.54, 0.22), dark);
  pack.position.set(0, 0.92, 0.3);
  crew.add(body, chest, head, face, pack);
  for (const side of [-1, 1]) {
    const arm = new Mesh(new BoxGeometry(0.16, 0.58, 0.2), suit);
    arm.position.set(side * 0.39, 0.82, 0);
    const leg = new Mesh(new BoxGeometry(0.2, 0.62, 0.24), dark);
    leg.position.set(side * 0.16, 0.32, 0);
    crew.add(arm, leg);
  }
  for (let index = 0; index < equipmentCount; index += 1) {
    const equipment = new Mesh(new BoxGeometry(0.16, 0.2, 0.14), materials.create({ color: "#b58c4f" }));
    equipment.position.set(-0.2 + index * 0.2, 0.82, -0.29);
    crew.add(equipment);
  }
  return crew;
}
