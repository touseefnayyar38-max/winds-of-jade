import * as THREE from 'three';
import type { BossProfile, CampaignSite, HairStyle, HumanRig, ZoneDef } from './types';
import { makeZoneLabel } from './textures';
import { terrainHeight } from './worldData';

export interface BuildHumanOptions {
  skin?: number;
  robe?: number;
  accent?: number;
  hair?: number;
  scale?: number;
  hasSword?: boolean;
  hairStyle?: HairStyle;
  cape?: boolean;
  simple?: boolean;
}

export function buildHuman(opts: BuildHumanOptions = {}): THREE.Group {
  const o = {
    skin: 0xe9c6a4,
    robe: 0x1f3452,
    accent: 0x3c6a8c,
    hair: 0x0e1116,
    scale: 1,
    hasSword: false,
    hairStyle: 'topknot' as HairStyle,
    cape: false,
    simple: false,
    ...opts,
  };
  const root = new THREE.Group();
  const rig = {} as HumanRig;

  const matSkin = new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.72, metalness: 0.02 });
  const matRobe = new THREE.MeshStandardMaterial({ color: o.robe, roughness: 0.88, metalness: 0.04 });
  const matRobeDk = new THREE.MeshStandardMaterial({
    color: new THREE.Color(o.robe).multiplyScalar(0.68).getHex(),
    roughness: 0.85,
  });
  const matHair = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 0.72, metalness: 0.05 });
  const matGold = new THREE.MeshStandardMaterial({ color: 0xd9b45b, roughness: 0.3, metalness: 0.78 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.85 });
  const matSteel = new THREE.MeshStandardMaterial({ color: 0xd8ecf8, roughness: 0.14, metalness: 0.96 });
  const matEyeW = new THREE.MeshStandardMaterial({ color: 0xf5f0eb, roughness: 0.25 });
  const matIris = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.22 });
  const matPupil = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.1 });
  const matLips = new THREE.MeshStandardMaterial({ color: 0xc98a80, roughness: 0.5 });
  const matBrow = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 0.7 });
  const matShadow = new THREE.MeshStandardMaterial({ color: 0x3a2820, roughness: 0.85 });

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);
  rig.hips = hips;
  rig.baseHipY = 0.92;

  const spine = new THREE.Group();
  hips.add(spine);
  rig.spine = spine;

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.175, 0.42, 20, 4), matRobe);
  chest.position.y = 0.22;
  chest.scale.z = 0.72;
  spine.add(chest);

  const abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.165, 0.2, 18), matRobe);
  abdomen.position.y = -0.1;
  abdomen.scale.z = 0.76;
  spine.add(abdomen);

  if (!o.simple) {
    const collarL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.02), matRobeDk);
    collarL.position.set(-0.075, 0.16, 0.145);
    collarL.rotation.z = 0.22;
    spine.add(collarL);
    const collarR = collarL.clone();
    collarR.position.x = 0.075;
    collarR.rotation.z = -0.22;
    spine.add(collarR);
  }

  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.085, 16), matGold);
  sash.position.y = -0.19;
  sash.scale.z = 0.78;
  spine.add(sash);

  if (!o.simple) {
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), matRobeDk);
    knot.position.set(0.055, -0.185, 0.14);
    spine.add(knot);
    const sashTail = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 0.3, 1, 4),
      new THREE.MeshStandardMaterial({ color: o.robe, side: THREE.DoubleSide, roughness: 0.88 }),
    );
    sashTail.position.set(0.055, -0.35, 0.13);
    sashTail.rotation.x = 0.1;
    spine.add(sashTail);
    rig.sashTail = sashTail;
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.072, 0.09, 14), matSkin);
  neck.position.y = 0.5;
  spine.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.605;
  spine.add(headGroup);
  rig.head = headGroup;

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.118, 28, 22), matSkin);
  skull.scale.set(0.92, 1.08, 1.02);
  headGroup.add(skull);

  const forehead = new THREE.Mesh(new THREE.SphereGeometry(0.092, 20, 14), matSkin);
  forehead.position.set(0, 0.048, 0.032);
  forehead.scale.set(1.02, 0.82, 0.85);
  headGroup.add(forehead);

  if (!o.simple) {
    const cheekL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), matSkin);
    cheekL.position.set(-0.062, -0.022, 0.085);
    cheekL.scale.set(1.0, 1.15, 0.62);
    headGroup.add(cheekL);
    const cheekR = cheekL.clone();
    cheekR.position.x = 0.062;
    headGroup.add(cheekR);

    const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.088, 0.095, 18, 2), matSkin);
    jaw.position.set(0, -0.078, 0.04);
    jaw.scale.set(1.0, 1.0, 0.92);
    headGroup.add(jaw);

    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 10), matSkin);
    chin.position.set(0, -0.108, 0.062);
    chin.scale.set(1.0, 0.72, 0.8);
    headGroup.add(chin);

    const earInnerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(o.skin).multiplyScalar(0.85).getHex(),
      roughness: 0.75,
    });
    for (const side of [-1, 1]) {
      const eg = new THREE.Group();
      eg.position.set(0.112 * side, -0.005, 0);
      eg.rotation.z = -0.12 * side;
      const outer = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), matSkin);
      outer.scale.set(0.42, 1.45, 0.85);
      eg.add(outer);
      const concha = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), earInnerMat);
      concha.position.set(0, 0, 0.008);
      concha.scale.set(0.4, 1.1, 0.5);
      eg.add(concha);
      headGroup.add(eg);
    }

    const socketGeo = new THREE.SphereGeometry(0.027, 14, 10);
    const socketL = new THREE.Mesh(socketGeo, matShadow);
    socketL.position.set(-0.045, 0.005, 0.096);
    socketL.scale.set(1.0, 0.72, 0.28);
    headGroup.add(socketL);
    const socketR = socketL.clone();
    socketR.position.x = 0.045;
    headGroup.add(socketR);

    const eyeballGeo = new THREE.SphereGeometry(0.024, 16, 12);
    const eyeballL = new THREE.Mesh(eyeballGeo, matEyeW);
    eyeballL.position.set(-0.045, 0.005, 0.105);
    eyeballL.scale.set(1.0, 0.88, 0.6);
    headGroup.add(eyeballL);
    const eyeballR = eyeballL.clone();
    eyeballR.position.x = 0.045;
    headGroup.add(eyeballR);

    const irisGeo = new THREE.CircleGeometry(0.011, 16);
    const irisL = new THREE.Mesh(irisGeo, matIris);
    irisL.position.set(-0.045, 0.005, 0.124);
    headGroup.add(irisL);
    const irisR = irisL.clone();
    irisR.position.x = 0.045;
    headGroup.add(irisR);

    const pupilGeo = new THREE.CircleGeometry(0.005, 14);
    const pupilL = new THREE.Mesh(pupilGeo, matPupil);
    pupilL.position.set(-0.045, 0.005, 0.127);
    headGroup.add(pupilL);
    const pupilR = pupilL.clone();
    pupilR.position.x = 0.045;
    headGroup.add(pupilR);

    const lidGeo = new THREE.SphereGeometry(0.026, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
    const lidL = new THREE.Mesh(lidGeo, matSkin);
    lidL.position.set(-0.045, 0.005, 0.104);
    lidL.scale.set(1.02, 0.72, 0.65);
    lidL.rotation.x = -0.32;
    headGroup.add(lidL);
    const lidR = lidL.clone();
    lidR.position.x = 0.045;
    headGroup.add(lidR);

    const browGeo = new THREE.BoxGeometry(0.04, 0.01, 0.012);
    const browL = new THREE.Mesh(browGeo, matBrow);
    browL.position.set(-0.045, 0.037, 0.119);
    browL.rotation.z = 0.18;
    browL.rotation.x = -0.15;
    headGroup.add(browL);
    const browR = browL.clone();
    browR.position.x = 0.045;
    browR.rotation.z = -0.18;
    headGroup.add(browR);

    const noseBridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.045, 4, 10), matSkin);
    noseBridge.position.set(0, 0.006, 0.117);
    headGroup.add(noseBridge);

    const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), matSkin);
    noseTip.position.set(0, -0.026, 0.127);
    headGroup.add(noseTip);

    const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.85 });
    const nostrilGeo = new THREE.SphereGeometry(0.008, 8, 6);
    const nostrilL = new THREE.Mesh(nostrilGeo, nostrilMat);
    nostrilL.position.set(-0.012, -0.035, 0.126);
    headGroup.add(nostrilL);
    const nostrilR = nostrilL.clone();
    nostrilR.position.x = 0.012;
    headGroup.add(nostrilR);

    const upperLip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 10), matLips);
    upperLip.position.set(0, -0.067, 0.112);
    upperLip.scale.set(1.45, 0.32, 0.38);
    upperLip.rotation.x = 0.08;
    headGroup.add(upperLip);

    const lowerLip = new THREE.Mesh(new THREE.SphereGeometry(0.017, 14, 10), matLips);
    lowerLip.position.set(0, -0.081, 0.111);
    lowerLip.scale.set(1.35, 0.36, 0.38);
    headGroup.add(lowerLip);
  }

  if (o.hairStyle === 'topknot' && !o.simple) {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.124, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
      matHair,
    );
    cap.position.y = 0.012;
    cap.scale.set(0.96, 1.08, 1.02);
    headGroup.add(cap);

    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), matHair);
    bun.position.set(0, 0.138, -0.02);
    bun.scale.set(1.0, 0.9, 1.0);
    headGroup.add(bun);

    const band = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.007, 8, 18), matGold);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 0.11, -0.02);
    headGroup.add(band);

    for (let i = 0; i < 6; i++) {
      const a = -0.8 + (i / 5) * 1.6;
      const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.008, 0.2, 6), matHair);
      strand.position.set(Math.sin(a) * 0.105, -0.05, 0.06);
      strand.rotation.x = 0.28;
      strand.rotation.z = a * 0.4;
      headGroup.add(strand);
    }

    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.015, 0.44, 8), matHair);
    tail.position.set(0, -0.1, -0.13);
    tail.rotation.x = 0.32;
    headGroup.add(tail);
    rig.hairTail = tail;
  } else if (o.hairStyle === 'long' && !o.simple) {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.126, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.65),
      matHair,
    );
    cap.position.y = 0.012;
    cap.scale.set(0.98, 1.1, 1.02);
    headGroup.add(cap);

    for (let i = 0; i < 10; i++) {
      const a = -1.0 + (i / 9) * 2.0;
      const len = 0.5 + ((i * 17) % 10) * 0.025;
      const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.008, len, 6), matHair);
      strand.position.set(Math.sin(a) * 0.11, -0.15 - (i % 3) * 0.03, -0.05 - (i % 2) * 0.02);
      strand.rotation.x = 0.22;
      strand.rotation.z = a * 0.35;
      headGroup.add(strand);
    }
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1;
      const offset = (i % 3) * 0.02;
      const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.006, 0.24, 6), matHair);
      strand.position.set(side * (0.1 + offset), -0.08, 0.03);
      strand.rotation.x = 0.2;
      strand.rotation.z = side * 0.25;
      headGroup.add(strand);
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.018, 0.48, 8), matHair);
    tail.position.set(0, -0.12, -0.14);
    tail.rotation.x = 0.28;
    headGroup.add(tail);
    rig.hairTail = tail;
  } else {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.126, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
      matHair,
    );
    cap.position.y = 0.012;
    cap.scale.set(0.98, 1.06, 1.02);
    headGroup.add(cap);

    if (!o.simple) {
      for (let i = 0; i < 8; i++) {
        const a = -0.9 + (i / 7) * 1.8;
        const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.005, 0.1, 6), matHair);
        strand.position.set(Math.sin(a) * 0.1, 0.04, 0.085);
        strand.rotation.x = -0.3;
        strand.rotation.z = a * 0.5;
        headGroup.add(strand);
      }
      for (const side of [-1, 1]) {
        const sb = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.12, 6), matHair);
        sb.position.set(side * 0.1, -0.02, 0.04);
        sb.rotation.x = 0.1;
        sb.rotation.z = side * 0.15;
        headGroup.add(sb);
      }
    }
  }

  function makeArm(side: number) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.2 * side, 0.44, 0);
    spine.add(shoulder);

    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 10), matRobe);
    delt.scale.set(1.0, 0.85, 0.85);
    shoulder.add(delt);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.26, 12), matRobe);
    upper.position.y = -0.14;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.27;
    shoulder.add(elbow);

    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), matSkin);
    elbow.add(elbowJoint);

    const sleeveEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.1, 10), matRobe);
    sleeveEnd.position.y = -0.05;
    elbow.add(sleeveEnd);

    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.18, 10), matSkin);
    fore.position.y = -0.16;
    elbow.add(fore);

    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), matSkin);
    wrist.position.y = -0.255;
    elbow.add(wrist);

    const handGroup = new THREE.Group();
    handGroup.position.y = -0.28;
    elbow.add(handGroup);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.02), matSkin);
    palm.position.y = -0.02;
    handGroup.add(palm);

    if (!o.simple) {
      for (let i = 0; i < 4; i++) {
        const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.055, 6), matSkin);
        finger.position.set(-0.018 + i * 0.012, -0.083, 0);
        handGroup.add(finger);
      }
      const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.007, 0.045, 6), matSkin);
      thumb.position.set(0.032, -0.045, 0.008);
      thumb.rotation.z = 0.6;
      handGroup.add(thumb);
    }

    return { shoulder, elbow, hand: handGroup };
  }
  rig.armL = makeArm(-1);
  rig.armR = makeArm(1);

  if (o.hasSword) {
    const sword = new THREE.Group();
    sword.position.y = -0.29;

    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), matGold);
    hilt.rotation.x = Math.PI / 2;
    hilt.position.z = -0.06;
    sword.add(hilt);

    const hiltWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), matDark);
    hiltWrap.rotation.x = Math.PI / 2;
    hiltWrap.position.z = -0.06;
    sword.add(hiltWrap);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.035), matGold);
    guard.position.z = 0.02;
    sword.add(guard);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.01, 0.82), matSteel);
    blade.position.z = 0.45;
    sword.add(blade);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 4), matSteel);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.91;
    sword.add(tip);

    sword.rotation.x = -0.35;
    rig.armR.hand.add(sword);
    rig.sword = sword;
  }

  function makeLeg(side: number) {
    const hip = new THREE.Group();
    hip.position.set(0.095 * side, 0, 0);
    hips.add(hip);

    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.32, 12), matDark);
    thigh.position.y = -0.16;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.32;
    hip.add(knee);

    const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), matDark);
    knee.add(kneeJoint);

    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.048, 0.42, 12), matDark);
    shin.position.y = -0.22;
    knee.add(shin);

    const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), matDark);
    ankle.position.y = -0.43;
    knee.add(ankle);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.22), matHair);
    foot.position.set(0, -0.47, 0.05);
    knee.add(foot);

    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), matHair);
    toe.position.set(0, -0.47, 0.14);
    toe.scale.set(1.0, 0.6, 0.8);
    knee.add(toe);

    return { hip, knee, foot };
  }
  rig.legL = makeLeg(-1);
  rig.legR = makeLeg(1);

  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.32, 0.42, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: o.robe, roughness: 0.88, side: THREE.DoubleSide }),
  );
  skirt.position.y = -0.35;
  hips.add(skirt);
  rig.skirt = skirt;

  const skirtTrim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.02, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: o.accent, side: THREE.DoubleSide, roughness: 0.78 }),
  );
  skirtTrim.position.y = -0.56;
  hips.add(skirtTrim);

  if (o.cape && !o.simple) {
    const capeGeo = new THREE.PlaneGeometry(0.65, 1.0, 10, 12);
    const capePos = capeGeo.attributes.position;
    for (let i = 0; i < capePos.count; i++) {
      const x = capePos.getX(i);
      const y = capePos.getY(i);
      const taper = 0.7 + (0.5 - y) * 0.45;
      const curve = -y * 0.12;
      capePos.setX(i, x * taper);
      capePos.setZ(i, curve + Math.sin(x * 5) * 0.025);
    }
    capeGeo.computeVertexNormals();
    const cape = new THREE.Mesh(
      capeGeo,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(o.robe).multiplyScalar(0.82).getHex(),
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
    );
    cape.position.set(0, 0.3, -0.18);
    cape.rotation.x = 0.15;
    spine.add(cape);
    rig.cape = cape;
  }

  root.scale.setScalar(o.scale);
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  root.userData.rig = rig;
  return root;
}

export function decorateEnemy(
  root: THREE.Group,
  rig: HumanRig,
  isElite: boolean,
  prof: BossProfile | null,
) {
  const col = prof ? prof.accent : 0x4a2a2a;
  const sc = prof ? prof.specialColor : 0xff4433;
  const k = isElite ? 1.35 : 1;
  const dark = new THREE.MeshStandardMaterial({
    color: 0x1a1a1f,
    roughness: 0.42,
    metalness: 0.65,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: col,
    roughness: 0.4,
    metalness: 0.5,
    emissive: sc,
    emissiveIntensity: isElite ? 0.25 : 0.05,
    side: THREE.DoubleSide,
  });
  const glow = new THREE.MeshBasicMaterial({ color: sc });

  for (const side of [-1, 1]) {
    const sh = side < 0 ? rig.armL.shoulder : rig.armR.shoulder;
    if (!sh) continue;
    const pd = new THREE.Mesh(
      new THREE.SphereGeometry(0.095 * k, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      dark,
    );
    pd.position.set(0.02 * side, 0.03, 0);
    pd.scale.set(1.25, 0.8, 1.1);
    sh.add(pd);
    if (isElite) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 6), trim);
      sp.position.set(0.08 * side, 0.1, 0);
      sp.rotation.z = -side * 0.5;
      sh.add(sp);
    }
  }

  if (rig.head) {
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.04), dark);
    mask.position.set(0, -0.045, 0.105);
    rig.head.add(mask);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), glow);
      eye.position.set(0.04 * side, 0.018, 0.118);
      rig.head.add(eye);
    }
    if (!isElite) {
      const hat = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.13, 16),
        new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.92 }),
      );
      hat.position.set(0, 0.15, 0);
      rig.head.add(hat);
    } else {
      for (let i = -2; i <= 2; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.14 + (2 - Math.abs(i)) * 0.04, 5), trim);
        sp.position.set(i * 0.045, 0.14, -0.02);
        sp.rotation.z = -i * 0.2;
        rig.head.add(sp);
      }
    }
  }

  if (rig.spine) {
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 6, 18), isElite ? trim : dark);
    sash.rotation.x = Math.PI / 2;
    sash.position.y = 0.02;
    rig.spine.add(sash);
    if (isElite) {
      const g = new THREE.PlaneGeometry(0.34, 0.95);
      g.translate(0, -0.47, 0);
      const banner = new THREE.Mesh(g, trim);
      banner.position.set(0, 0.46, -0.17);
      banner.rotation.x = 0.08;
      rig.spine.add(banner);
    }
  }

  if (isElite) {
    const pivot = new THREE.Group();
    pivot.position.y = 1.0;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.012, 6, 48),
      new THREE.MeshBasicMaterial({ color: sc, transparent: true, opacity: 0.55 }),
    );
    ring.rotation.x = Math.PI / 2;
    pivot.add(ring);
    for (let i = 0; i < 4; i++) {
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), glow);
      const a = (i * Math.PI) / 2;
      o.position.set(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8);
      pivot.add(o);
    }
    root.add(pivot);
    root.userData.aura = pivot;
  }
}

export function createBossSanctum(scene: THREE.Scene, zone: ZoneDef, profile: BossProfile) {
  const centerY = terrainHeight(zone.cx, zone.cz);
  const sanctum = new THREE.Group();
  sanctum.position.set(zone.cx, centerY, zone.cz);
  scene.add(sanctum);

  const stone = new THREE.MeshStandardMaterial({ color: 0x77766d, roughness: 0.88 });
  const seal = new THREE.MeshStandardMaterial({
    color: profile.specialColor,
    emissive: profile.specialColor,
    emissiveIntensity: 0.3,
    roughness: 0.65,
    metalness: 0.15,
    transparent: true,
    opacity: 0.55,
  });
  const floorMark = new THREE.Mesh(new THREE.CircleGeometry(8.5, 48), seal);
  floorMark.rotation.x = -Math.PI / 2;
  floorMark.position.y = 0.08;
  sanctum.add(floorMark);

  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(11, 0.28, 10, 64), stone);
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = 0.18;
  sanctum.add(outerRing);

  const sealRing = new THREE.Mesh(
    new THREE.TorusGeometry(6.7, 0.12, 8, 48),
    new THREE.MeshBasicMaterial({ color: profile.specialColor, transparent: true, opacity: 0.82 }),
  );
  sealRing.rotation.x = Math.PI / 2;
  sealRing.position.y = 0.13;
  sanctum.add(sealRing);

  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const x = Math.cos(angle) * 13;
    const z = Math.sin(angle) * 13;
    const base = terrainHeight(zone.cx + x, zone.cz + z) - centerY;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.92, 4.5, 10), stone);
    pillar.position.set(x, base + 2.25, z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    sanctum.add(pillar);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.42, 1.65), stone);
    cap.position.set(x, base + 4.58, z);
    cap.castShadow = true;
    sanctum.add(cap);
  }

  for (const side of [-1, 1]) {
    const x = side * 3.6;
    const z = 12.2;
    const base = terrainHeight(zone.cx + x, zone.cz + z) - centerY;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.82, 4.4, 0.9), stone);
    post.position.set(x, base + 2.2, z);
    post.castShadow = true;
    sanctum.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.8, 1.1), stone);
  lintel.position.set(0, terrainHeight(zone.cx, zone.cz + 12.2) - centerY + 4.6, 12.2);
  lintel.castShadow = true;
  sanctum.add(lintel);

  const gate = new THREE.Mesh(
    new THREE.BoxGeometry(6.3, 3.5, 0.34),
    new THREE.MeshStandardMaterial({
      color: profile.specialColor,
      emissive: profile.specialColor,
      emissiveIntensity: 0.72,
      transparent: true,
      opacity: 0.48,
      roughness: 0.25,
      metalness: 0.35,
    }),
  );
  gate.position.set(0, terrainHeight(zone.cx, zone.cz + 12.2) - centerY + 2.0, 12.2);
  sanctum.add(gate);

  const title = makeZoneLabel(profile.dungeon);
  title.scale.set(34, 8, 1);
  title.position.set(zone.cx, centerY + 8.5, zone.cz);
  scene.add(title);
  return { root: sanctum, title, gate };
}

export function buildResonanceShrine(scene: THREE.Scene, site: CampaignSite): THREE.Group {
  const group = new THREE.Group();
  const y = terrainHeight(site.shrineX, site.shrineZ);
  group.position.set(site.shrineX, y, site.shrineZ);
  const color = site.boss.specialColor;
  const stone = new THREE.MeshStandardMaterial({ color: 0x5c645f, roughness: 0.72, metalness: 0.18 });
  const glow = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.7,
    roughness: 0.22,
    metalness: 0.28,
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.42, 10), stone);
  base.position.y = 0.21;
  group.add(base);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.58, 1), glow);
  crystal.position.y = 1.24;
  crystal.rotation.y = Math.PI / 4;
  group.add(crystal);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.08, 0.045, 8, 36),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.49;
  group.add(ring);
  group.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) object.castShadow = true;
  });
  scene.add(group);
  return group;
}

export function buildValleyLandmarks(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5c3626, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x243b42, roughness: 0.55, metalness: 0.12 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x82847e, roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b45b, roughness: 0.28, metalness: 0.8 });
  const lanternGlow = new THREE.MeshStandardMaterial({
    color: 0xffdf9a,
    emissive: 0xffae42,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });

  // Composite Wuxia Pavilion in Jade Valley (east side of plaza)
  const px = 22;
  const pz = 2;
  const py = terrainHeight(px, pz);
  const pav = new THREE.Group();
  pav.position.set(px, py, pz);

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.1, 0.7, 8), stone);
  plinth.position.y = 0.35;
  pav.add(plinth);
  const stepRing = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.3, 0.25, 8), stone);
  stepRing.position.y = 0.78;
  pav.add(stepRing);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 3.6, 10), wood);
    col.position.set(Math.cos(a) * 3.1, 2.6, Math.sin(a) * 3.1);
    pav.add(col);
  }

  const roof1 = new THREE.Mesh(new THREE.ConeGeometry(5.1, 1.7, 8), roofMat);
  roof1.position.y = 5.1;
  pav.add(roof1);
  const roof2 = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.35, 8), roofMat);
  roof2.position.y = 6.35;
  pav.add(roof2);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), gold);
  finial.position.y = 7.22;
  pav.add(finial);
  const hangingLantern = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), lanternGlow);
  hangingLantern.position.y = 3.85;
  pav.add(hangingLantern);

  pav.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  group.add(pav);

  // Stone Lanterns framing the Jade Valley courtyard
  const lanternCoords: [number, number][] = [
    [9, 8],
    [-9, 8],
    [9, -10],
    [-9, -10],
  ];
  for (const [lx, lz] of lanternCoords) {
    const ly = terrainHeight(lx, lz);
    const lantern = new THREE.Group();
    lantern.position.set(lx, ly, lz);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.4, 6), stone);
    base.position.y = 0.2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.35, 8), stone);
    post.position.y = 1.05;
    const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.42), lanternGlow);
    chamber.position.y = 1.92;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.38, 6), stone);
    cap.position.y = 2.3;
    lantern.add(base, post, chamber, cap);
    lantern.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    group.add(lantern);
  }

  scene.add(group);
  return group;
}

export function disposeObject3D(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of mats) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value && (value as THREE.Texture).isTexture) {
            textures.add(value as THREE.Texture);
          }
        }
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}
