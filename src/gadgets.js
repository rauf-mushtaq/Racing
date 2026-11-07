// The hardware a car hides for the police chase: two machine guns that slide out of the front, and an armour plate that rises behind
// the cabin. police.js moves them (userData.guns slides forward as the guns fire, userData.shield rises when the armour goes up), so
// any car with these two groups in its userData can fight: the grand tourer, and the hero car when the police are after you.
import * as THREE from 'three';

// body: the car's body group; o: { zf (nose), zr (tail), x (gun spacing), y (gun height), plateZ, plateY, plateW, plateH }
export function addGadgets(body, o) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.32, metalness: 0.92, envMapIntensity: 1.1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe2e7, roughness: 0.1, metalness: 1, envMapIntensity: 1.2 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.42, metalness: 0.88, envMapIntensity: 1.0 });
  const guns = new THREE.Group(); body.add(guns);
  for (const s of [-1, 1]) {
    const x = s * (o.x ?? 0.5), y = o.y ?? 0.46;
    // The barrel starts well inside the nose, so only the muzzle shows until the guns slide out.
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.027, 0.62, 12).rotateX(Math.PI / 2), steel); barrel.position.set(x, y, o.zf - 0.36); guns.add(barrel);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.14, 12).rotateX(Math.PI / 2), steel); sleeve.position.set(x, y, o.zf - 0.2); guns.add(sleeve);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.05, 12).rotateX(Math.PI / 2), chrome); muzzle.position.set(x, y, o.zf - 0.045); guns.add(muzzle);
    const bore = new THREE.Mesh(new THREE.CircleGeometry(0.016, 10), new THREE.MeshBasicMaterial({ color: 0x000000 })); bore.position.set(x, y, o.zf - 0.019); guns.add(bore);
    for (const m of [barrel, sleeve, muzzle]) m.castShadow = false;
  }
  const shield = new THREE.Group(); shield.position.set(0, o.plateY ?? 0.5, o.plateZ ?? (o.zr + 0.6)); body.add(shield);
  const w = o.plateW ?? 1.18, h = o.plateH ?? 0.4;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), plateMat); plate.position.y = h / 2; shield.add(plate);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.03, 0.05), steel); rim.position.y = h; shield.add(rim);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.04), steel); bar.position.set(0, h / 2, 0.01); shield.add(bar);
  guns.userData.rest = 0; return { guns, shield };
}
