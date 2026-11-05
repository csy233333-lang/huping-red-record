import * as THREE from 'three';
import { SLOGANS, NPCS, type NpcData, type SloganSite } from './data';
import { brickTexture, mudTexture, sloganTexture, groundTexture, stonePathTexture, roofTexture, barkTexture } from './textures';

export interface Collider { x: number; z: number; hx: number; hz: number }
export interface SloganNode { site: SloganSite; group: THREE.Group; whitewash: THREE.MeshBasicMaterial; marker: THREE.Mesh; pos: THREE.Vector3 }
export interface NpcNode { data: NpcData; group: THREE.Group; head: THREE.Mesh; marker: THREE.Mesh; pos: THREE.Vector3; seed: number }

export interface WorldRefs {
  colliders: Collider[];
  slogans: SloganNode[];
  npcs: NpcNode[];
  occluders: THREE.Object3D[]; // 遮挡镜头的建筑/树
  player: THREE.Group;
  playerLegL: THREE.Mesh;
  playerLegR: THREE.Mesh;
  playerArmL: THREE.Mesh;
  playerArmR: THREE.Mesh;
}

const mat = (color: number, rough = 0.95) => new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });

/** 低模三角屋顶 */
function gableRoof(w: number, h: number, d: number, texture?: THREE.Texture) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, h); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  const m = texture
    ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, flatShading: true })
    : mat(0x4c4f52);
  return new THREE.Mesh(geo, m);
}

/** 一栋民居（可选携带标语墙） */
function house(
  w: number, h: number, d: number,
  opts: { wall: 'brick' | 'mud'; roofTex: THREE.Texture; wallTex: THREE.Texture }
) {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ map: opts.wallTex, roughness: 0.95, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const roof = gableRoof(w * 1.15, h * 0.55, d * 1.2, opts.roofTex);
  roof.position.y = h;
  roof.castShadow = true;
  g.add(roof);
  // 门
  const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, h * 0.55, 0.1), mat(0x3c332a));
  door.position.set(0, h * 0.28, d / 2 + 0.05);
  g.add(door);
  // 窗
  const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, h * 0.2, 0.08), mat(0x2e2a24));
  win.position.set(w * 0.28, h * 0.6, d / 2 + 0.04);
  g.add(win);
  return g;
}

/** 标语墙：独立墙面 + 标语贴图 + 泛白遮罩 */
function sloganWall(site: SloganSite): SloganNode {
  const g = new THREE.Group();
  const isMud = site.id === 'S4';
  const wallTex = isMud ? mudTexture() : brickTexture();
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(7, 3.4, 0.5),
    new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95, flatShading: true })
  );
  wall.position.y = 1.7;
  wall.castShadow = wall.receiveShadow = true;
  g.add(wall);

  // 标语面
  const sTex = sloganTexture(site.title, isMud ? 'mud' : 'brick');
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(6.2, 2.3),
    new THREE.MeshStandardMaterial({ map: sTex, roughness: 0.9, transparent: false })
  );
  plane.position.set(0, 1.85, 0.26);
  g.add(plane);

  // 泛白遮罩（远处盖住标语，靠近淡出）
  const ww = new THREE.MeshBasicMaterial({ color: 0xdcd6c6, transparent: true, opacity: 0.92 });
  const whitewash = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 2.3), ww);
  whitewash.position.set(0, 1.85, 0.29);
  g.add(whitewash);

  // 顶部雨檐
  const eave = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.18, 1.1), mat(0x4c4f52));
  eave.position.y = 3.45;
  g.add(eave);

  // 未采集标记（悬浮感叹号：小红球+柱）
  const marker = new THREE.Group();
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xb8452f }));
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6), new THREE.MeshBasicMaterial({ color: 0xb8452f }));
  stick.position.y = -0.33;
  marker.add(dot, stick);
  marker.position.set(0, 4.6, 0);
  g.add(marker);

  g.position.set(site.position[0], 0, site.position[1]);
  g.rotation.y = site.rotationY;
  return { site, group: g, whitewash: ww, marker: marker as unknown as THREE.Mesh, pos: new THREE.Vector3(site.position[0], 1.5, site.position[1]) };
}

/** 低模人形 */
function humanoid(colors: { body: number; legs: number; skin: number; hat?: number }, hunched = false) {
  const g = new THREE.Group();
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.24), mat(colors.legs));
  legL.position.set(-0.14, 0.375, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const torsoH = hunched ? 0.72 : 0.85;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, torsoH, 0.32), mat(colors.body));
  torso.position.y = 0.75 + torsoH / 2;
  if (hunched) { torso.rotation.x = 0.35; torso.position.z = 0.1; }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), mat(colors.skin));
  head.position.y = 0.75 + torsoH + 0.2;
  if (hunched) { head.position.z = 0.32; head.rotation.x = 0.3; }
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.16), mat(colors.body));
  armL.position.set(-0.37, 0.75 + torsoH / 2, 0);
  const armR = armL.clone();
  armR.position.x = 0.37;
  g.add(legL, legR, torso, head, armL, armR);
  if (colors.hat) {
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.1, 8), mat(colors.hat));
    hat.position.copy(head.position).y += 0.24;
    g.add(hat);
  }
  g.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; } });
  return { group: g, head, legL, legR, armL, armR };
}

/** 老树 */
function tree(scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * scale, 0.4 * scale, 2.6 * scale, 6),
    new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1, flatShading: true })
  );
  trunk.position.y = 1.3 * scale;
  trunk.rotation.z = 0.08;
  g.add(trunk);
  const leafMat = mat(0x5a6842, 1);
  for (let i = 0; i < 4; i++) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry((1.1 + Math.random() * 0.6) * scale, 0), leafMat);
    blob.position.set((Math.random() - 0.5) * 1.8 * scale, (2.6 + Math.random() * 1.4) * scale, (Math.random() - 0.5) * 1.8 * scale);
    g.add(blob);
  }
  g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  return g;
}

/** 登仙桥：石拱桥 */
function bridge() {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ map: stonePathTexture(), roughness: 0.95, flatShading: true });
  // 拱面：分段台阶
  const steps = 9, span = 10;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const h = Math.sin(t * Math.PI) * 1.1;
    const s = new THREE.Mesh(new THREE.BoxGeometry(span / steps + 0.05, 0.3, 3.2), stoneMat);
    s.position.set(-span / 2 + (i + 0.5) * (span / steps), 0.4 + h, 0);
    g.add(s);
    // 栏板
    for (const side of [-1.5, 1.5]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(span / steps + 0.02, 0.5, 0.18), stoneMat);
      rail.position.set(s.position.x, 0.85 + h, side);
      g.add(rail);
    }
  }
  // 桥墩
  for (const x of [-4.2, 0, 4.2]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 3.4), mat(0x5d5850));
    pier.position.set(x, -0.1, 0);
    g.add(pier);
  }
  g.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = o.receiveShadow = true; } });
  return g;
}

export function buildWorld(scene: THREE.Scene): WorldRefs {
  const colliders: Collider[] = [];
  const occluders: THREE.Object3D[] = [];

  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 140),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 石板路：十字主路
  const pathMat = new THREE.MeshStandardMaterial({ map: stonePathTexture(), roughness: 1 });
  const mkPath = (w: number, l: number, x: number, z: number, rot = 0) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, l), pathMat);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = rot;
    p.position.set(x, 0.02, z);
    p.receiveShadow = true;
    scene.add(p);
  };
  mkPath(3, 60, 0, 0);
  mkPath(3, 56, 0, -2, Math.PI / 2);
  mkPath(2.2, 16, 4, 14);

  // 民居群（青砖 + 土墙混合）
  const roofTex = roofTexture();
  const brickT = brickTexture();
  const mudT = mudTexture();
  const houses: { pos: [number, number]; rot: number; w: number; h: number; d: number; mud?: boolean }[] = [
    { pos: [-14, -14], rot: 0, w: 8, h: 4, d: 6 },          // 王氏老宅（S1 旁）
    { pos: [16, -22], rot: Math.PI, w: 9, h: 4.5, d: 7 },   // 宗祠（S2 旁）
    { pos: [-24, 6], rot: Math.PI / 2, w: 7, h: 3.6, d: 5.5, mud: true },
    { pos: [22, 4], rot: -Math.PI / 2, w: 7, h: 4, d: 6 },
    { pos: [-8, 22], rot: Math.PI * 0.9, w: 6.5, h: 3.5, d: 5, mud: true },
    { pos: [14, 14], rot: Math.PI / 4, w: 6, h: 3.8, d: 5 },
    { pos: [-2, -26], rot: 0, w: 7, h: 4, d: 6 },
    { pos: [26, -8], rot: Math.PI / 2, w: 6, h: 3.5, d: 5, mud: true },
    { pos: [-26, -12], rot: 0, w: 6, h: 3.4, d: 5 },
  ];
  for (const hd of houses) {
    const hh = house(hd.w, hd.h, hd.d, { wall: hd.mud ? 'mud' : 'brick', roofTex, wallTex: hd.mud ? mudT : brickT });
    hh.position.set(hd.pos[0], 0, hd.pos[1]);
    hh.rotation.y = hd.rot;
    scene.add(hh);
    occluders.push(hh);
    const r = Math.max(hd.w, hd.d) / 2 + 0.4;
    colliders.push({ x: hd.pos[0], z: hd.pos[1], hx: r, hz: r });
  }

  // 标语墙
  const slogans: SloganNode[] = SLOGANS.map((s) => {
    const node = sloganWall(s);
    scene.add(node.group);
    occluders.push(node.group.children[0]); // 墙体参与镜头遮挡
    colliders.push({ x: s.position[0], z: s.position[1], hx: 3.5, hz: 0.9 });
    return node;
  });

  // 登仙桥 + 水面
  const br = bridge();
  br.position.set(4, 0.3, 28);
  br.rotation.y = Math.PI / 2;
  scene.add(br);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 7),
    new THREE.MeshStandardMaterial({ color: 0x5e7266, roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.85 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(4, -0.05, 28);
  scene.add(water);

  // 树木
  const treeSpots: [number, number, number][] = [
    [-6, -2, 1.2], [20, 12, 1.0], [-20, -20, 1.4], [10, -6, 0.9],
    [-10, 14, 1.1], [28, 20, 1.2], [-28, 22, 1.0], [8, 24, 0.8], [-4, 30, 1.1],
  ];
  for (const [x, z, s] of treeSpots) {
    const t = tree(s);
    t.position.set(x, 0, z);
    scene.add(t);
    occluders.push(t);
    colliders.push({ x, z, hx: 0.6 * s, hz: 0.6 * s });
  }

  // 石碾、杂物点缀
  const mill = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.5, 10), mat(0x6e6a60));
  mill.position.set(7, 0.25, -18);
  mill.castShadow = true;
  scene.add(mill);
  colliders.push({ x: 7, z: -18, hx: 1.1, hz: 1.1 });

  // NPC
  const npcs: NpcNode[] = NPCS.map((n) => {
    const { group, head } = humanoid(n.color, !!n.hunched);
    group.position.set(n.position[0], 0, n.position[1]);
    group.rotation.y = Math.random() * Math.PI * 2;
    // 未访谈标记（蓝灰色小旗感 → 用圆点）
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), new THREE.MeshBasicMaterial({ color: 0xd8c26a }));
    marker.position.y = 2.3;
    group.add(marker);
    scene.add(group);
    return { data: n, group, head, marker, pos: new THREE.Vector3(n.position[0], 1.2, n.position[1]), seed: Math.random() * 10 };
  });

  // 玩家：档案征集者（便装 + 斜挎相机包）
  const p = humanoid({ body: 0x53504a, legs: 0x3a3f45, skin: 0xd9b98f });
  const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.14), mat(0x6e5136));
  satchel.position.set(0.34, 1.05, 0.1);
  const cameraBox = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.1), mat(0x22201d));
  cameraBox.position.set(0, 1.35, 0.22);
  p.group.add(satchel, cameraBox);
  p.group.position.set(0, 0, -2);
  scene.add(p.group);

  // 边界远山剪影
  const hillMat = new THREE.MeshBasicMaterial({ color: 0x707a6a, fog: false });
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(22 + Math.random() * 14, 14 + Math.random() * 9, 5), hillMat);
    hill.position.set(Math.cos(ang) * 78, -1, Math.sin(ang) * 78);
    scene.add(hill);
  }

  return {
    colliders, slogans, npcs, occluders,
    player: p.group, playerLegL: p.legL, playerLegR: p.legR, playerArmL: p.armL, playerArmR: p.armR,
  };
}
