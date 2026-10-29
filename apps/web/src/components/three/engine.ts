// Tavern Gameverse renderer — plain Three.js, no React. Loaded lazily by ./stage; never import it from a page.
import { gameColors } from '@tavern/shared';
import * as THREE from 'three';
import type { SceneProps } from './stage';

type World = {
  root: THREE.Object3D;
  /** Composition width in world units, used to shrink it on narrow canvases. */
  width: number;
  tick(t: number, dt: number): void;
  update?(p: SceneProps): void;
};

const coarse = () => matchMedia('(pointer: coarse)').matches;
const damp = THREE.MathUtils.damp;

/* ---------- Shared building blocks ---------- */

/** Soft diamond sprite (Tavern's motif) for every particle field. */
function diamondTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(16, 2);
  g.lineTo(30, 16);
  g.lineTo(16, 30);
  g.lineTo(2, 16);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Slowly rising motes, wrapped inside a box. One draw call. */
function particleField(count: number, box: [number, number, number], color: string, sprite: THREE.Texture, size = 0.09) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * box[0];
    pos[i * 3 + 1] = (Math.random() - 0.5) * box[1];
    pos[i * 3 + 2] = (Math.random() - 0.5) * box[2];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size, map: sprite, color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  const tick = (dt: number) => {
    const a = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      let y = a.getY(i) + dt * 0.12;
      if (y > box[1] / 2) y = -box[1] / 2;
      a.setY(i, y);
    }
    a.needsUpdate = true;
  };
  return { points, mat, tick };
}

/** One simple, recognisable silhouette per game — primitives only, cached per engine. */
function gameGeometry(slug: string | undefined, cache: Map<string, THREE.BufferGeometry>) {
  const k = slug ?? 'all';
  let g = cache.get(k);
  if (!g) {
    g =
      slug === 'mlbb' ? new THREE.OctahedronGeometry(1, 0)
      : slug === 'valorant' ? new THREE.ConeGeometry(0.8, 1.7, 4)
      : slug === 'dota2' ? new THREE.DodecahedronGeometry(1, 0)
      : slug === 'wild-rift' ? new THREE.IcosahedronGeometry(1, 0)
      : slug === 'pubg' ? new THREE.BoxGeometry(1.3, 1.3, 1.3)
      : slug === 'codm' ? new THREE.CylinderGeometry(0.95, 0.95, 0.6, 6)
      : slug === 'free-fire' ? new THREE.TorusKnotGeometry(0.6, 0.2, 96, 12)
      : new THREE.OctahedronGeometry(1, 1);
    cache.set(k, g);
  }
  return g;
}

function gameMaterial(slug?: string) {
  const [a, b] = gameColors(slug);
  return new THREE.MeshStandardMaterial({ color: a, emissive: b, emissiveIntensity: 0.35, metalness: 0.35, roughness: 0.3, flatShading: true });
}

/** Tavern shield, extruded from the same outline as the 2D emblem. */
function emblemMesh() {
  // Left half of the emblem in its 32×32 SVG coords; the right half is its mirror.
  const half = [[2, 6], [15.2, 6], [15.2, 11.7], [11.8, 11.7], [11.8, 20.5], [15.2, 22.5], [15.2, 25.7], [7.2, 21.3], [7.2, 12.7], [4.3, 12.7]];
  const g = new THREE.Group();
  for (const [mirror, color, emissive] of [[1, '#9b4dff', '#4c1d95'], [-1, '#e879f9', '#86198f']] as const) {
    const s = new THREE.Shape(half.map(([x, y]) => new THREE.Vector2(((x - 16) * mirror) / 12, (16 - y) / 12)));
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.28, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.03, bevelSegments: 2 });
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.45, metalness: 0.6, roughness: 0.25, side: THREE.DoubleSide })));
  }
  return g;
}

function portal(color: string) {
  const g = new THREE.Group();
  const outerMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9 });
  const outer = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.045, 12, 120), outerMat);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.02, 8, 100), new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#22d3ee', emissiveIntensity: 0.7, transparent: true, opacity: 0.7 }));
  inner.rotation.set(0.4, 0.3, 0);
  const discMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08 });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 64), discMat);
  disc.position.z = -0.4;
  g.add(outer, inner, disc);
  return { g, outer, inner, outerMat, discMat };
}

/* ---------- Worlds ---------- */

function emblemWorld(sprite: THREE.Texture, cache: Map<string, THREE.BufferGeometry>, mobile: boolean): World {
  const root = new THREE.Group();
  const emblem = emblemMesh();
  root.add(emblem);
  const sats = (
    [
      ['mlbb', [-1.7, 0.9, -0.6], 0.28],
      ['wild-rift', [1.35, -0.9, -0.3], 0.25],
      ['valorant', [-1.3, -1.1, 0.2], 0.22],
    ] as const
  ).map(([slug, [x, y, z], sc], i) => {
    const m = new THREE.Mesh(gameGeometry(slug, cache), gameMaterial(slug));
    m.position.set(x, y, z);
    m.scale.setScalar(sc);
    root.add(m);
    return { m, y, phase: i * 2.1 };
  });
  const motes = particleField(mobile ? 12 : 36, [6, 4, 2], '#b9a0ff', sprite);
  root.add(motes.points);
  return {
    root,
    width: 4.2,
    tick(t, dt) {
      emblem.rotation.y = Math.sin(t * 0.5) * 0.35;
      emblem.position.y = Math.sin(t * 1.1) * 0.08;
      for (const s of sats) {
        s.m.rotation.x += dt * 0.25;
        s.m.rotation.y += dt * 0.4;
        s.m.position.y = s.y + Math.sin(t * 1.3 + s.phase) * 0.1;
      }
      motes.tick(dt);
    },
  };
}

function gameWorld(p: Extract<SceneProps, { scene: 'gameworld' }>, sprite: THREE.Texture, cache: Map<string, THREE.BufferGeometry>, mobile: boolean): World {
  const root = new THREE.Group();
  root.scale.setScalar(0.78);
  const [a] = gameColors(p.game);
  const ring = portal(a);
  root.add(ring.g);
  let obj = new THREE.Mesh(gameGeometry(p.game, cache), gameMaterial(p.game));
  obj.position.z = 0.2;
  obj.scale.setScalar(0.001);
  root.add(obj);
  const motes = particleField(mobile ? 10 : 26, [6, 4, 2], a, sprite);
  root.add(motes.points);
  return {
    root,
    width: 3.4,
    tick(t, dt) {
      ring.outer.rotation.z += dt * 0.25;
      ring.inner.rotation.z -= dt * 0.4;
      obj.rotation.y += dt * 0.6;
      obj.rotation.x += dt * 0.24;
      obj.position.y = Math.sin(t * 1.4) * 0.08;
      // Each newly selected game eases in from nothing.
      obj.scale.setScalar(dt ? damp(obj.scale.x, 0.95, 6, dt) : 0.95);
      motes.tick(dt);
    },
    update(next) {
      if (next.scene !== 'gameworld') return;
      const [c] = gameColors(next.game);
      ring.outerMat.color.set(c);
      ring.outerMat.emissive.set(c);
      ring.discMat.color.set(c);
      motes.mat.color.set(c);
      (obj.material as THREE.Material).dispose();
      root.remove(obj);
      obj = new THREE.Mesh(gameGeometry(next.game, cache), gameMaterial(next.game));
      obj.position.z = 0.2;
      obj.scale.setScalar(0.001);
      root.add(obj);
    },
  };
}

type Motion = 'rise' | 'fall' | 'drift' | 'wander' | 'warp' | 'stream' | 'float' | 'rain';
/** Per-background motion. The artwork itself is SVG/CSS (components/cosmetics); this adds depth and life. */
const AMBIENT: Record<string, { motion: Motion; colors: string[]; count: number; size: number; speed: number; opacity: number }> = {
  hearth: { motion: 'rise', colors: ['#fb923c', '#fbbf24', '#f97316', '#a78bfa'], count: 70, size: 0.07, speed: 0.28, opacity: 0.8 },
  'cyber-grid': { motion: 'stream', colors: ['#22d3ee', '#38bdf8'], count: 60, size: 0.05, speed: 0.4, opacity: 0.7 },
  dream: { motion: 'float', colors: ['#f9a8d4', '#c4b5fd', '#a78bfa'], count: 16, size: 0.9, speed: 0.06, opacity: 0.22 },
  nebula: { motion: 'warp', colors: ['#ffffff', '#a5f3fc', '#f9a8d4'], count: 140, size: 0.05, speed: 0.6, opacity: 0.9 },
  grove: { motion: 'wander', colors: ['#d9f99d', '#fde68a', '#bef264'], count: 40, size: 0.1, speed: 0.35, opacity: 0.75 },
  'sakura-dusk': { motion: 'drift', colors: ['#f9a8d4', '#fbcfe8', '#fda4af'], count: 50, size: 0.11, speed: 0.32, opacity: 0.85 },
  'neon-city': { motion: 'rain', colors: ['#67e8f9', '#a5b4fc'], count: 130, size: 0.28, speed: 3.4, opacity: 0.35 },
  arcade: { motion: 'rise', colors: ['#f472b6', '#22d3ee'], count: 40, size: 0.06, speed: 0.22, opacity: 0.8 },
  arena: { motion: 'rise', colors: ['#f5c76a', '#a78bfa', '#ffffff'], count: 60, size: 0.06, speed: 0.4, opacity: 0.8 },
  'winter-lights': { motion: 'fall', colors: ['#ffffff', '#e0f2fe', '#dbeafe'], count: 130, size: 0.07, speed: 0.35, opacity: 0.85 },
};

/**
 * Background life for voice rooms. `level` is the loudest real speaker's audio level, so the scene
 * only speeds up and brightens while someone is actually talking.
 */
function ambientWorld(p: Extract<SceneProps, { scene: 'ambient' }>, sprite: THREE.Texture, mobile: boolean): World {
  const cfg = AMBIENT[p.theme] ?? AMBIENT.hearth!;
  const root = new THREE.Group();
  const n = Math.round(cfg.count * (mobile ? 0.45 : 1));
  const box = [12, 8, 6] as const;
  const rain = cfg.motion === 'rain';
  const pos = new Float32Array(n * 3 * (rain ? 2 : 1));
  const col = new Float32Array(pos.length);
  const seed = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * box[0], y: (Math.random() - 0.5) * box[1], z: (Math.random() - 0.5) * box[2], ph: Math.random() * Math.PI * 2, v: 0.6 + Math.random() * 0.8 }));
  const c = new THREE.Color();
  for (let i = 0; i < pos.length / 3; i++) {
    c.set(cfg.colors[(rain ? i >> 1 : i) % cfg.colors.length]!);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const common = { vertexColors: true, transparent: true, opacity: cfg.opacity, depthWrite: false, blending: THREE.AdditiveBlending };
  const mat = rain ? new THREE.LineBasicMaterial(common) : new THREE.PointsMaterial({ ...common, size: cfg.size, map: sprite });
  root.add(rain ? new THREE.LineSegments(geo, mat) : new THREE.Points(geo, mat));
  const wrap = (v: number, h: number) => (v > h ? v - 2 * h : v < -h ? v + 2 * h : v);
  let level = p.level;
  let boost = 0;
  const write = (t: number) => {
    const a = geo.attributes.position as THREE.BufferAttribute;
    seed.forEach((s, i) => {
      let { x, y } = s;
      if (cfg.motion === 'wander') {
        x += Math.sin(t * 0.7 * s.v + s.ph) * 0.35;
        y += Math.cos(t * 0.5 * s.v + s.ph) * 0.25;
      } else if (cfg.motion === 'float') {
        x += Math.sin(t * 0.2 + s.ph) * 0.6;
        y += Math.cos(t * 0.15 + s.ph) * 0.4;
      } else if (cfg.motion === 'rise' || cfg.motion === 'fall') x += Math.sin(t * 0.8 + s.ph) * 0.12;
      if (rain) {
        a.setXYZ(i * 2, x, y, s.z);
        a.setXYZ(i * 2 + 1, x + cfg.size * 0.15, y + cfg.size, s.z);
      } else a.setXYZ(i, x, y, s.z);
    });
    a.needsUpdate = true;
  };
  write(0);
  return {
    root,
    width: 0, // fills the canvas instead of shrinking to fit
    tick(t, dt) {
      boost = dt ? damp(boost, level, 3, dt) : level;
      const step = dt * cfg.speed * (1 + boost * 1.4);
      for (const s of seed) {
        const d = step * s.v;
        if (cfg.motion === 'rise' || cfg.motion === 'stream') s.y = wrap(s.y + d, box[1] / 2);
        else if (cfg.motion === 'fall') s.y = wrap(s.y - d, box[1] / 2);
        else if (cfg.motion === 'rain') {
          s.y = wrap(s.y - d, box[1] / 2);
          s.x = wrap(s.x - d * 0.15, box[0] / 2);
        } else if (cfg.motion === 'drift') {
          s.x = wrap(s.x + d, box[0] / 2);
          s.y = wrap(s.y - d * 0.6, box[1] / 2);
        } else if (cfg.motion === 'warp') {
          s.z += d * 2;
          if (s.z > 4) Object.assign(s, { z: -6, x: (Math.random() - 0.5) * box[0], y: (Math.random() - 0.5) * box[1] });
        }
      }
      write(t);
      mat.opacity = Math.min(1, cfg.opacity * (cfg.motion === 'wander' ? 0.75 + 0.25 * Math.sin(t * 2.2) : 1) + boost * 0.25);
    },
    update(next) {
      if (next.scene === 'ambient') level = next.level;
    },
  };
}

/**
 * Glows with real LiveKit activity: `speakers` comes from ActiveSpeakersChanged and `level` from the
 * participants' measured audio levels, so the orb only pulses when someone is actually talking.
 */
function voiceWorld(p: Extract<SceneProps, { scene: 'voice' }>): World {
  const root = new THREE.Group();
  root.scale.setScalar(0.8);
  const mat = new THREE.MeshStandardMaterial({ color: '#8b5cf6', emissive: '#8b5cf6', emissiveIntensity: 0.3, roughness: 0.2, metalness: 0.3, flatShading: true });
  // A faceted gem rather than a smooth sphere: reads as an object, not a placeholder.
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), mat);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.2 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.015, 8, 96), ringMat);
  ring.rotation.x = Math.PI / 2.4;
  root.add(orb, ring);
  const idle = new THREE.Color('#8b5cf6');
  const live = new THREE.Color('#22d3ee');
  let state = p;
  return {
    root,
    width: 3,
    tick(t, dt) {
      const level = state.connected ? Math.min(state.speakers, 4) / 4 : 0;
      const loud = state.connected ? Math.min(1, state.level ?? 0) : 0;
      const target = 1 + (level ? 0.06 + loud * 0.3 : 0.02 * Math.sin(t * 1.5));
      orb.scale.setScalar(dt ? damp(orb.scale.x, target, 8, dt) : target);
      orb.rotation.y += dt * 0.3;
      ring.rotation.z += dt * 0.15;
      mat.color.lerp(level ? live : idle, dt ? 1 - Math.exp(-dt * 4) : 1);
      mat.emissive.copy(mat.color);
      mat.emissiveIntensity = state.connected ? 0.5 + level : 0.2;
      ringMat.opacity = state.connected ? 0.6 : 0.2;
    },
    update(next) {
      if (next.scene === 'voice') state = next;
    },
  };
}

/** Short reveal for high-value gifts; the stage only mounts this after the server confirms the gift. */
function giftWorld(p: Extract<SceneProps, { scene: 'gift' }>, sprite: THREE.Texture, mobile: boolean): World {
  const root = new THREE.Group();
  const color = p.rarity === 'legendary' ? '#f5c76a' : '#a78bfa';
  let geo: THREE.BufferGeometry;
  if (p.rarity === 'legendary') {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.45 : 1.05;
      const ang = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i) s.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      else s.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    geo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.08, bevelSegments: 2 });
    geo.center();
  } else {
    geo = new THREE.OctahedronGeometry(1, 0); // crystal
  }
  const gem = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.15, flatShading: true }));
  gem.scale.setScalar(0.001);
  root.add(gem);
  // Particle burst: motes fly outward once and fade.
  const n = mobile ? 18 : 48;
  const pos = new Float32Array(n * 3);
  const vel = Array.from({ length: n }, () => new THREE.Vector3().randomDirection().multiplyScalar(0.8 + Math.random() * 1.6));
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const bmat = new THREE.PointsMaterial({ size: 0.14, map: sprite, color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  root.add(new THREE.Points(bgeo, bmat));
  let start = -1;
  return {
    root,
    width: 3,
    tick(t, dt) {
      if (start < 0) start = t;
      const e = t - start;
      gem.scale.setScalar(e < 0.5 ? Math.max(0.001, 1.15 * Math.sin((e / 0.5) * (Math.PI / 2))) : dt ? damp(gem.scale.x, 1, 5, dt) : 1);
      gem.rotation.y += dt * (e < 0.6 ? 6 : 1.2);
      gem.position.y = Math.min(e, 1.5) * 0.15;
      const a = bgeo.attributes.position as THREE.BufferAttribute;
      const k = Math.min(e, 1.4);
      vel.forEach((v, i) => a.setXYZ(i, v.x * k, v.y * k, v.z * k));
      a.needsUpdate = true;
      bmat.opacity = Math.max(0, 1 - e / 1.6);
    },
  };
}

function disposeTree(o: THREE.Object3D, keep: Set<THREE.BufferGeometry>) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.geometry && !keep.has(m.geometry)) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    mats.forEach((x) => x.dispose());
  });
}

/* ---------- Engine ---------- */

export function createEngine(canvas: HTMLCanvasElement, initial: SceneProps, onLost: () => void) {
  const mobile = coarse();
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !mobile, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.z = 6;
  const ambient = new THREE.AmbientLight('#ffffff', 0.45);
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(3, 4, 5);
  const rim = new THREE.PointLight('#22d3ee', 12);
  rim.position.set(-3, -2, 3);
  scene.add(ambient, key, rim);

  const sprite = diamondTexture();
  const cache = new Map<string, THREE.BufferGeometry>();
  const keep = new Set<THREE.BufferGeometry>();
  // Parallax rig sits between the scene and the world so pointer tilt never fights world animation.
  const rig = new THREE.Group();
  scene.add(rig);
  let props = initial;
  let world: World | null = null;
  const build = (p: SceneProps) => {
    if (world) {
      rig.remove(world.root);
      cache.forEach((g) => keep.add(g));
      disposeTree(world.root, keep);
    }
    const w: World =
      p.scene === 'emblem' ? emblemWorld(sprite, cache, mobile)
      : p.scene === 'gameworld' ? gameWorld(p, sprite, cache, mobile)
      : p.scene === 'voice' ? voiceWorld(p)
      : p.scene === 'ambient' ? ambientWorld(p, sprite, mobile)
      : giftWorld(p, sprite, mobile);
    world = w;
    rig.add(w.root);
    fitWorld();
  };
  const fitWorld = () => {
    if (!world) return;
    // Visible width at z=0; shrink compositions that would overflow portrait canvases.
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    rig.scale.setScalar(Math.min(1, (h * camera.aspect) / world.width));
  };

  // Hand-rolled clock: THREE.Clock is deprecated in recent releases.
  let last = performance.now();
  let elapsed = 0;
  const delta = () => {
    const now = performance.now();
    const d = (now - last) / 1000;
    last = now;
    return d;
  };
  const pointer = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -((e.clientY / innerHeight) * 2 - 1);
  };
  if (!mobile) window.addEventListener('pointermove', onPointer, { passive: true });

  const frame = (animate: boolean) => {
    const dt = animate ? Math.min(delta(), 0.1) : 0;
    elapsed += dt;
    const t = elapsed;
    if (animate && !mobile && (props.scene !== 'ambient' || props.parallax)) {
      const k = 1 - Math.exp(-dt * 3);
      rig.rotation.y += (pointer.x * 0.22 - rig.rotation.y) * k;
      rig.rotation.x += (-pointer.y * 0.11 - rig.rotation.x) * k;
    }
    world!.tick(t, dt);
    renderer.render(scene, camera);
  };
  const loop = () => frame(true);
  let animating = false;

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitWorld();
    if (!animating) frame(false);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const onContextLost = (e: Event) => {
    e.preventDefault();
    onLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  build(props);
  resize();

  return {
    /** Push new props; same scene updates in place, a different scene (or new gift) rebuilds. */
    update(next: SceneProps) {
      const rebuild = next.scene !== props.scene || (next.scene === 'gift' && props.scene === 'gift' && next.nonce !== props.nonce);
      props = next;
      if (rebuild) build(next);
      else world!.update?.(next);
      if (!animating) frame(false);
    },
    /** Continuous only while visible, on-screen and motion is allowed; otherwise one still frame. */
    setAnimating(on: boolean) {
      if (on === animating) return;
      animating = on;
      if (on) last = performance.now(); // don't jump by the time spent paused
      renderer.setAnimationLoop(on ? loop : null);
      if (!on) frame(false);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      if (world) disposeTree(world.root, new Set());
      cache.forEach((g) => g.dispose());
      sprite.dispose();
      renderer.dispose();
    },
  };
}
export type Engine = ReturnType<typeof createEngine>;
