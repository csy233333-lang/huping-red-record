import * as THREE from 'three';
import { SLOGANS, NPCS } from './data';
import { buildWorld, type WorldRefs } from './world';
import { sloganTexture } from './textures';

export interface ArchiveRecord {
  id: string;        // 档案编号
  kind: 'physical' | 'oral';
  title: string;
  source: string;    // 采集地点 / 受访者
  content: string;   // 标语正文 / 口述摘要
  image?: string;    // 实物影像 dataURL
  tags: string[];
  note: string;
  time: string;
  refId: string;     // 关联 SLOGANS/NPCS id
}

export type GameEvent =
  | { type: 'near-slogan'; siteId: string | null }
  | { type: 'near-npc'; npcId: string | null }
  | { type: 'collected'; record: ArchiveRecord }
  | { type: 'progress'; done: number; total: number };

const DAY = {
  sky: 0xb8c4bd, fog: 0xc3c9bd, sun: 0xfff2dd, sunI: 1.6, amb: 0.75, hemi: 0.7, fogFar: 95,
};
const DUSK = {
  sky: 0x3a3440, fog: 0x4a3f42, sun: 0xff9a58, sunI: 1.05, amb: 0.3, hemi: 0.3, fogFar: 60,
};

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private refs: WorldRefs;
  private lastTime = performance.now();
  private keys = new Set<string>();
  private listener: (e: GameEvent) => void;
  private canvas: HTMLCanvasElement;
  private elapsed = 0;

  // 相机状态
  private camYaw = Math.PI * 0.15;
  private camPitch = 0.42;
  private camDist = 10;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };

  // 摇杆
  private joyVec = { x: 0, y: 0 };

  // 光照
  private sun: THREE.DirectionalLight;
  private amb: THREE.AmbientLight;
  private hemi: THREE.HemisphereLight;

  private collected = new Set<string>();
  private nearSlogan: string | null = null;
  private nearNpc: string | null = null;
  private flashEl: HTMLDivElement | null = null;
  private walkPhase = 0;
  private raf = 0;
  private disposed = false;
  private ray = new THREE.Raycaster();

  constructor(canvas: HTMLCanvasElement, listener: (e: GameEvent) => void) {
    this.canvas = canvas;
    this.listener = listener;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);

    // 光照
    this.sun = new THREE.DirectionalLight(DAY.sun, DAY.sunI);
    this.sun.position.set(30, 45, 18);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -55; this.sun.shadow.camera.right = 55;
    this.sun.shadow.camera.top = 55; this.sun.shadow.camera.bottom = -55;
    this.sun.shadow.camera.far = 140;
    this.sun.shadow.bias = -0.0005;
    this.amb = new THREE.AmbientLight(0xffffff, DAY.amb);
    this.hemi = new THREE.HemisphereLight(0xcfd8d0, 0x6a5c4a, DAY.hemi);
    this.scene.add(this.sun, this.amb, this.hemi);

    this.refs = buildWorld(this.scene);
    this.applyTime('day');
    this.bindInput();
    this.resize();
    this.loop();
  }

  // ---------- 光照 / 昼夜 ----------
  setTimeMode(m: 'day' | 'dusk') {
    this.applyTime(m);
  }
  private applyTime(m: 'day' | 'dusk') {
    const c = m === 'day' ? DAY : DUSK;
    this.scene.background = new THREE.Color(c.sky);
    this.scene.fog = new THREE.Fog(c.fog, 18, c.fogFar);
    this.sun.color.set(c.sun);
    this.sun.intensity = c.sunI;
    this.sun.position.set(m === 'day' ? 30 : -38, m === 'day' ? 45 : 14, m === 'day' ? 18 : 26);
    this.amb.intensity = c.amb;
    this.hemi.intensity = c.hemi;
  }

  // ---------- 输入 ----------
  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui]')) return;
    this.dragging = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.camYaw -= dx * 0.005;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.004, 0.08, 1.25);
    this.lastPointer = { x: e.clientX, y: e.clientY };
  };
  private onPointerUp = () => { this.dragging = false; };
  private onWheel = (e: WheelEvent) => {
    this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.012, 4.5, 24);
  };
  private onResize = () => this.resize();

  private bindInput() {
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('pointermove', this.onPointerMove);
    addEventListener('pointerup', this.onPointerUp);
    addEventListener('resize', this.onResize);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
    this.canvas.style.touchAction = 'none';
  }

  setJoystick(x: number, y: number) { this.joyVec = { x, y }; }

  private resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- 碰撞 ----------
  private collide(x: number, z: number): [number, number] {
    const r = 0.45;
    for (const c of this.refs.colliders) {
      const dx = x - c.x, dz = z - c.z;
      if (Math.abs(dx) < c.hx + r && Math.abs(dz) < c.hz + r) {
        const px = c.hx + r - Math.abs(dx);
        const pz = c.hz + r - Math.abs(dz);
        if (px < pz) x = c.x + Math.sign(dx || 1) * (c.hx + r);
        else z = c.z + Math.sign(dz || 1) * (c.hz + r);
      }
    }
    const B = 38;
    return [THREE.MathUtils.clamp(x, -B, B), THREE.MathUtils.clamp(z, -B, B)];
  }

  // ---------- 采集动作 ----------
  /** 拍摄标语墙 → 返回档案记录 */
  collectSlogan(siteId: string): ArchiveRecord | null {
    const node = this.refs.slogans.find((s) => s.site.id === siteId);
    if (!node || this.collected.has(siteId)) return null;
    this.collected.add(siteId);
    node.marker.visible = false;
    node.whitewash.opacity = 0;
    this.flash();
    const s = node.site;
    const tex = sloganTexture(s.title, s.id === 'S4' ? 'mud' : 'brick');
    const img = (tex.image as HTMLCanvasElement).toDataURL('image/png');
    const rec: ArchiveRecord = {
      id: `LA-HP-${String(this.collected.size).padStart(3, '0')}`,
      kind: 'physical',
      title: `红军标语「${s.title}」`,
      source: s.location,
      content: s.title,
      image: img,
      tags: ['实物档案', '红军标语'],
      note: '',
      time: new Date().toLocaleString('zh-CN'),
      refId: s.id,
    };
    this.listener({ type: 'collected', record: rec });
    this.emitProgress();
    return rec;
  }

  collectOral(npcId: string): ArchiveRecord | null {
    const node = this.refs.npcs.find((n) => n.data.id === npcId);
    if (!node || this.collected.has(npcId)) return null;
    this.collected.add(npcId);
    node.marker.visible = false;
    const n = node.data;
    const rec: ArchiveRecord = {
      id: `LA-KS-${String(this.collected.size).padStart(3, '0')}`,
      kind: 'oral',
      title: n.recordTitle,
      source: `${n.name}（${n.role}）`,
      content: n.recordSummary,
      tags: ['口述档案', '访谈录音记录'],
      note: '',
      time: new Date().toLocaleString('zh-CN'),
      refId: n.id,
    };
    this.listener({ type: 'collected', record: rec });
    this.emitProgress();
    return rec;
  }

  isCollected(id: string) { return this.collected.has(id); }

  private emitProgress() {
    this.listener({ type: 'progress', done: this.collected.size, total: SLOGANS.length + NPCS.length });
  }

  private flash() {
    if (!this.flashEl) {
      this.flashEl = document.createElement('div');
      this.flashEl.style.cssText =
        'position:fixed;inset:0;background:#fff8ec;opacity:0;pointer-events:none;z-index:60;transition:opacity .45s ease';
      document.body.appendChild(this.flashEl);
    }
    const el = this.flashEl;
    el.style.transition = 'none';
    el.style.opacity = '0.9';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity .45s ease';
      el.style.opacity = '0';
    });
  }

  // ---------- 主循环 ----------
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.elapsed += dt;
    const t = this.elapsed;
    const p = this.refs.player;

    // 移动输入
    let mx = 0, mz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    mx += this.joyVec.x;
    mz += this.joyVec.y;
    const len = Math.hypot(mx, mz);
    const moving = len > 0.01;
    if (moving) {
      mx /= Math.max(len, 1); mz /= Math.max(len, 1);
      // 相机相对方向
      const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
      const wx = mx * cos - mz * sin;
      const wz = mx * sin + mz * cos;
      const speed = 4.2;
      const [nx, nz] = this.collide(p.position.x + wx * speed * dt, p.position.z + wz * speed * dt);
      p.position.x = nx; p.position.z = nz;
      // 朝向
      const targetRot = Math.atan2(wx, wz);
      let dr = targetRot - p.rotation.y;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      p.rotation.y += dr * Math.min(1, dt * 10);
      // 步态
      this.walkPhase += dt * 9;
      const sw = Math.sin(this.walkPhase) * 0.45;
      this.refs.playerLegL.rotation.x = sw;
      this.refs.playerLegR.rotation.x = -sw;
      this.refs.playerArmL.rotation.x = -sw * 0.7;
      this.refs.playerArmR.rotation.x = sw * 0.7;
    } else {
      for (const limb of [this.refs.playerLegL, this.refs.playerLegR, this.refs.playerArmL, this.refs.playerArmR]) {
        limb.rotation.x *= 0.85;
      }
    }

    // 相机跟随（带遮挡收缩，避免穿模）
    const py = p.position.y;
    const head = new THREE.Vector3(p.position.x, py + 1.4, p.position.z);
    const dir = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      Math.sin(this.camPitch),
      Math.cos(this.camYaw) * Math.cos(this.camPitch)
    );
    let dist = this.camDist;
    this.ray.set(head, dir);
    const hits = this.ray.intersectObjects(this.refs.occluders, true);
    if (hits.length && hits[0].distance < dist + 0.4) {
      dist = Math.max(hits[0].distance - 0.4, 1.6);
    }
    this.camera.position.copy(head).addScaledVector(dir, dist);
    this.camera.lookAt(head);

    // 标语显现（靠近淡出泛白遮罩）
    for (const s of this.refs.slogans) {
      if (!s.marker.visible) continue; // 已采集
      const d = p.position.distanceTo(s.pos);
      const appear = THREE.MathUtils.clamp(1 - (d - 3.5) / 5, 0, 1);
      s.whitewash.opacity = 0.92 - appear * 0.92;
      s.marker.position.y = 4.6 + Math.sin(t * 2.4) * 0.15;
    }
    // NPC 待机 + 未采集标记浮动
    for (const n of this.refs.npcs) {
      n.group.position.y = Math.sin(t * 1.4 + n.seed) * 0.015;
      if (n.marker.visible) n.marker.position.y = 2.3 + Math.sin(t * 2.2 + n.seed) * 0.12;
      // 触发对话时头部摆动（靠近时点头）
      const near = p.position.distanceTo(n.pos) < 3.4;
      n.head.rotation.z = near ? Math.sin(t * 3) * 0.1 : 0;
    }

    // 距离检测 → UI 提示
    let ns: string | null = null, nn: string | null = null;
    for (const s of this.refs.slogans) {
      if (s.marker.visible && p.position.distanceTo(s.pos) < 4.2) ns = s.site.id;
    }
    for (const n of this.refs.npcs) {
      if (n.marker.visible && p.position.distanceTo(n.pos) < 3.8) nn = n.data.id;
    }
    if (ns !== this.nearSlogan) { this.nearSlogan = ns; this.listener({ type: 'near-slogan', siteId: ns }); }
    if (nn !== this.nearNpc) { this.nearNpc = nn; this.listener({ type: 'near-npc', npcId: nn }); }

    this.renderer.render(this.scene, this.camera);
  };

  /** 测试辅助：移动玩家到指定坐标 */
  teleport(x: number, z: number) {
    this.refs.player.position.set(x, 0, z);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('pointermove', this.onPointerMove);
    removeEventListener('pointerup', this.onPointerUp);
    removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.flashEl?.remove();
  }
}
