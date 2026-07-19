import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh } from "three";
import type { Ps1MaterialFactory } from "../materials/Ps1MaterialFactory";

export function createPlayerAvatar(materials: Ps1MaterialFactory): Group {
  const root = new Group();
  root.name = "phase-a-player-avatar";

  const suit = materials.create({ color: "#c3ad72" });
  const dark = materials.create({ color: "#172126" });
  const visor = materials.createEmissive("#8de2d2", 0.65);

  const torso = new Mesh(new BoxGeometry(0.52, 0.66, 0.34, 1, 2, 1), suit);
  torso.position.y = 0.18;
  root.add(torso);

  const head = new Mesh(new CylinderGeometry(0.25, 0.27, 0.34, 6), dark);
  head.position.y = 0.69;
  root.add(head);

  const face = new Mesh(new BoxGeometry(0.3, 0.14, 0.05), visor);
  face.position.set(0, 0.7, -0.24);
  root.add(face);

  for (const side of [-1, 1]) {
    const leg = new Mesh(new BoxGeometry(0.19, 0.48, 0.22), dark);
    leg.position.set(side * 0.15, -0.5, 0);
    root.add(leg);
  }

  const direction = new Mesh(new ConeGeometry(0.09, 0.3, 4), visor);
  direction.rotation.x = -Math.PI / 2;
  direction.position.set(0, 0.05, -0.34);
  root.add(direction);

  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return root;
}
