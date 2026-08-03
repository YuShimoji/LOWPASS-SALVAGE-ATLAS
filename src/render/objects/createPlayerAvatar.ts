import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh } from "three";
import type { Ps1MaterialFactory } from "../materials/Ps1MaterialFactory";

export function createPlayerAvatar(materials: Ps1MaterialFactory): Group {
  const root = new Group();
  root.name = "phase-a-player-avatar";

  const suit = materials.create({ color: "#b39b63", roughness: 0.92 });
  const armor = materials.create({ color: "#d0c49a", roughness: 0.86 });
  const dark = materials.create({ color: "#121b1e", roughness: 0.88 });
  const bronze = materials.create({ color: "#6f5b3d", metalness: 0.28, roughness: 0.8 });
  const visor = materials.createEmissive("#70ddd3", 0.82);

  const torso = new Mesh(new BoxGeometry(0.58, 0.68, 0.38, 1, 2, 1), suit);
  torso.position.y = 0.16;
  const chest = new Mesh(new BoxGeometry(0.4, 0.32, 0.08), armor);
  chest.position.set(0, 0.2, -0.23);
  const belt = new Mesh(new BoxGeometry(0.64, 0.12, 0.44), dark);
  belt.position.y = -0.18;
  root.add(torso, chest, belt);

  const head = new Mesh(new CylinderGeometry(0.25, 0.27, 0.34, 6), dark);
  head.position.y = 0.69;
  root.add(head);

  const face = new Mesh(new BoxGeometry(0.32, 0.12, 0.055), visor);
  face.position.set(0, 0.7, -0.255);
  const brow = new Mesh(new BoxGeometry(0.42, 0.08, 0.08), bronze);
  brow.position.set(0, 0.81, -0.22);
  root.add(face, brow);

  for (const side of [-1, 1]) {
    const shoulder = new Mesh(new BoxGeometry(0.2, 0.22, 0.42), armor);
    shoulder.position.set(side * 0.39, 0.35, 0);
    const arm = new Mesh(new BoxGeometry(0.16, 0.46, 0.2), suit);
    arm.position.set(side * 0.4, 0.02, 0);
    root.add(shoulder, arm);
  }

  for (const side of [-1, 1]) {
    const leg = new Mesh(new BoxGeometry(0.2, 0.46, 0.24), dark);
    leg.position.set(side * 0.15, -0.48, 0);
    const boot = new Mesh(new BoxGeometry(0.24, 0.18, 0.34), bronze);
    boot.position.set(side * 0.15, -0.72, -0.045);
    root.add(leg, boot);
  }

  const backpack = new Mesh(new BoxGeometry(0.46, 0.58, 0.24), dark);
  backpack.position.set(0, 0.2, 0.3);
  const packCap = new Mesh(new BoxGeometry(0.32, 0.12, 0.08), bronze);
  packCap.position.set(0, 0.42, 0.45);
  const packStatus = new Mesh(new BoxGeometry(0.12, 0.1, 0.045), visor);
  packStatus.position.set(0, 0.12, 0.445);
  root.add(backpack, packCap, packStatus);

  const direction = new Mesh(new ConeGeometry(0.075, 0.22, 4), visor);
  direction.rotation.x = -Math.PI / 2;
  direction.position.set(0, -0.06, -0.32);
  root.add(direction);

  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return root;
}
