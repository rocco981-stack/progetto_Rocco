/* BeCity BIM – modello dati, geometria degli elementi, quantità, export IFC4 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TYPES = {
  wall: { label: 'Muro', ifc: 'IfcWall', icon: 'wall' }, cwall: { label: 'Muro curvo', ifc: 'IfcWall', icon: 'wall' },
  slab: { label: 'Solaio', ifc: 'IfcSlab', icon: 'layers' }, column: { label: 'Pilastro', ifc: 'IfcColumn', icon: 'building' },
  beam: { label: 'Trave', ifc: 'IfcBeam', icon: 'ruler' }, roof: { label: 'Copertura', ifc: 'IfcRoof', icon: 'building' },
  door: { label: 'Porta', ifc: 'IfcDoor', icon: 'door' }, window: { label: 'Finestra', ifc: 'IfcWindow', icon: 'window' },
  stair: { label: 'Scala', ifc: 'IfcStair', icon: 'measure' }, space: { label: 'Spazio', ifc: 'IfcSpace', icon: 'room' },
  mass: { label: 'Massa', ifc: 'IfcBuildingElementProxy', icon: 'box3d' }, brep: { label: 'Solido B-rep', ifc: 'IfcBuildingElementProxy', icon: 'cube' },
  csg: { label: 'Solido CSG', ifc: 'IfcBuildingElementProxy', icon: 'cube' },
  curtain: { label: 'Facciata continua', ifc: 'IfcCurtainWall', icon: 'curtain' }, rail: { label: 'Ringhiera', ifc: 'IfcRailing', icon: 'rail' }, grid: { label: 'Asse strutturale', ifc: 'IfcGrid', icon: 'grid' }, ifcobj: { label: 'Oggetto IFC importato', ifc: 'IfcProduct', icon: 'doc' }
};
export const MATERIALS = {
  'Laterizio': '#d9c3a5', 'Calcestruzzo': '#bfc3c7', 'Calcestruzzo armato': '#a9aeb3', 'Blocchi cls': '#c9cbcd', 'Legno X-lam': '#d8b98a', 'Cartongesso': '#efefec', 'Pietra': '#cbbfa8',
  'Acciaio': '#8e98a3', 'Vetro': '#9fd0ee', 'Legno': '#b88a5a', 'Tegole in cotto': '#b86b48', 'Lamiera': '#8a939c', 'Intonaco': '#f3efe8', 'Massa': '#e9e3d6'
};
export const newBIM = () => ({ version: 1, levels: [{ id: 'L0', name: 'Piano terra', elev: 0, height: 3.0 }, { id: 'L1', name: 'Piano primo', elev: 3.0, height: 3.0 }], activeLevel: 'L0', elements: [], imports: [] });
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

if (!THREE.BufferGeometry.prototype.toNI) THREE.BufferGeometry.prototype.toNI = function () { return this.index ? this.toNonIndexed() : this; };
const T = (x, y, z) => new THREE.Vector3(x, z, -y); // piano (x,y) + quota z → three (Y verso l'alto)
export const toThree = T;
export const fromThree = v => [v.x, -v.z, v.y];
const area = pts => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
export const polyArea = pts => Math.abs(area(pts));
const ccw = pts => area(pts) < 0 ? pts.slice().reverse() : pts;

/** prisma da poligono (coordinate di piano) tra z0 e z1, con fori opzionali */
export function prism(pts, z0, z1, holes = []) {
  const sh = new THREE.Shape(ccw(pts).map(p => new THREE.Vector2(p[0], p[1])));
  holes.forEach(h => sh.holes.push(new THREE.Path(ccw(h).reverse().map(p => new THREE.Vector2(p[0], p[1])))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(1e-4, z1 - z0), bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, z0, 0); return g;
}
/** mesh da triangoli in coordinate di piano */
export function meshGeom(pos, idx) {
  const g = new THREE.BufferGeometry(); const p = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) { p[i] = pos[i]; p[i + 1] = pos[i + 2]; p[i + 2] = -pos[i + 1]; }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const rectAlong = (a, d, n, t0, t1, h) => [[a[0] + d[0] * t0 + n[0] * h, a[1] + d[1] * t0 + n[1] * h], [a[0] + d[0] * t1 + n[0] * h, a[1] + d[1] * t1 + n[1] * h], [a[0] + d[0] * t1 - n[0] * h, a[1] + d[1] * t1 - n[1] * h], [a[0] + d[0] * t0 - n[0] * h, a[1] + d[1] * t0 - n[1] * h]];
export const levelOf = (bim, id) => bim.levels.find(l => l.id === id) || bim.levels[0];
export const hosted = (bim, w) => bim.elements.filter(e => (e.type === 'door' || e.type === 'window') && e.host === w.id);

/** geometrie (parti con materiale) di un elemento */
export function buildParts(bim, e) {
  const L = levelOf(bim, e.level); const z = L.elev; const parts = [];
  const add = (geom, color, opts = {}) => parts.push({ geom, color, ...opts });
  switch (e.type) {
    case 'wall': {
      const a = e.a, b = e.b; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-4) break; const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-d[1], d[0]], h = e.thk / 2, H = e.h ?? L.height;
      const ext = [e.extA ? h : 0, e.extB ? h : 0];
      const ops = hosted(bim, e).map(o => ({ t0: o.t * len - o.width / 2, t1: o.t * len + o.width / 2, z0: o.type === 'door' ? 0 : o.sill, z1: (o.type === 'door' ? 0 : o.sill) + o.height })).sort((x, y) => x.t0 - y.t0);
      const geoms = []; let s = -ext[0];
      ops.forEach(o => { if (o.t0 > s) geoms.push(prism(rectAlong(a, d, n, s, o.t0, h), z, z + H)); if (o.z0 > 0) geoms.push(prism(rectAlong(a, d, n, o.t0, o.t1, h), z, z + o.z0)); if (o.z1 < H) geoms.push(prism(rectAlong(a, d, n, o.t0, o.t1, h), z + o.z1, z + H)); s = Math.max(s, o.t1); });
      if (s < len + ext[1]) geoms.push(prism(rectAlong(a, d, n, s, len + ext[1], h), z, z + H));
      if (geoms.length) add(mergeGeometries(geoms.map(g => g.index ? g.toNI() : g)), MATERIALS[e.material] || '#ddd');
      break;
    }
    case 'cwall': { const pl = e.path || [e.a, e.b]; if (pl.length < 2) break; const h = e.thk / 2; const geoms = [];
      for (let i = 0; i < pl.length - 1; i++) { const a = pl[i], b = pl[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-5) continue; const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-d[1], d[0]]; geoms.push(prism(rectAlong(a, d, n, -0.002, len + 0.002, h), z, z + (e.h ?? L.height)).toNI()); }
      if (geoms.length) add(mergeGeometries(geoms), MATERIALS[e.material] || '#ddd'); break; }
    case 'slab': add(prism(e.pts, z + (e.offset || 0) - e.thk, z + (e.offset || 0), e.holes || []), MATERIALS[e.material] || '#bbb'); break;
    case 'mass': add(prism(e.pts, z + (e.z0 || 0), z + (e.z0 || 0) + e.h), MATERIALS[e.material] || MATERIALS.Massa, { pushable: true }); break;
    case 'space': add(prism(e.pts, z + .01, z + (e.h ?? L.height - .3)), e.color || '#4f8cff', { opacity: .14, space: true }); break;
    case 'column': { const H = e.h ?? L.height; let g; if (e.shape === 'round') { g = new THREE.CylinderGeometry(e.w / 2, e.w / 2, H, 24); g.translate(e.x, z + H / 2, -e.y); } else { const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0); const loc = [[-e.w / 2, -e.d / 2], [e.w / 2, -e.d / 2], [e.w / 2, e.d / 2], [-e.w / 2, e.d / 2]].map(([x, y]) => [e.x + x * c - y * s, e.y + x * s + y * c]); g = prism(loc, z, z + H); } add(g, MATERIALS[e.material] || '#aaa'); break; }
    case 'beam': { const a = e.a, b = e.b, len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-4) break; const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-d[1], d[0]]; const top = z + (e.top ?? L.height); add(prism(rectAlong(a, d, n, 0, len, e.w / 2), top - e.hb, top), MATERIALS[e.material] || '#aaa'); break; }
    case 'roof': { const base = z + (e.base ?? L.height); add(roofGeom(e, base), MATERIALS[e.material] || '#b86b48'); break; }
    case 'stair': { const H = e.rise ?? L.height; const n = Math.max(2, Math.round(H / 0.17)); const rh = H / n, run = e.run || 0.28; const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0); const geoms = [];
      for (let i = 0; i < n; i++) { const x0 = i * run, x1 = (i + 1) * run; const loc = [[x0, 0], [x1, 0], [x1, e.width], [x0, e.width]].map(([x, y]) => [e.x + x * c - y * s, e.y + x * s + y * c]); geoms.push(prism(loc, z + i * rh, z + (i + 1) * rh).toNI()); }
      add(mergeGeometries(geoms), MATERIALS[e.material] || '#c9cbcd'); break; }
    case 'door': case 'window': { const w = bim.elements.find(x => x.id === e.host); if (!w) break; const a = w.a, b = w.b, len = Math.hypot(b[0] - a[0], b[1] - a[1]); const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-d[1], d[0]]; const t0 = e.t * len - e.width / 2, t1 = t0 + e.width; const z0 = z + (e.type === 'door' ? 0 : e.sill);
      const fr = .05; const geoms = [rectAlong(a, d, n, t0, t0 + fr, w.thk * .35), rectAlong(a, d, n, t1 - fr, t1, w.thk * .35)].map(r => prism(r, z0, z0 + e.height).toNI());
      geoms.push(prism(rectAlong(a, d, n, t0, t1, w.thk * .35), z0 + e.height - fr, z0 + e.height).toNI()); if (e.type === 'window') geoms.push(prism(rectAlong(a, d, n, t0, t1, w.thk * .4), z0, z0 + fr).toNI());
      add(mergeGeometries(geoms), e.type === 'door' ? '#7b5a3c' : '#f4f4f2');
      if (e.type === 'window') add(prism(rectAlong(a, d, n, t0 + fr, t1 - fr, .006), z0 + fr, z0 + e.height - fr), '#8ec5ea', { opacity: .4, glass: true });
      else add(prism(rectAlong(a, d, n, t0 + fr, t1 - fr, .02), z0, z0 + e.height - fr), '#a57b52');
      break; }
    case 'curtain': { const a = e.a, b = e.b, len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-4) break; const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-d[1], d[0]]; const H = e.h ?? L.height; const m = e.mul || .06; const geoms = [];
      const nu = Math.max(1, Math.round(len / (e.gu || 1.5))), nv = Math.max(1, Math.round(H / (e.gv || 1.2)));
      for (let i = 0; i <= nu; i++) { const t = len * i / nu; geoms.push(prism(rectAlong(a, d, n, Math.max(0, t - m / 2), Math.min(len, t + m / 2), m), z, z + H).toNI()); }
      for (let j = 0; j <= nv; j++) { const zz = z + H * j / nv; geoms.push(prism(rectAlong(a, d, n, 0, len, m * .8), Math.max(z, zz - m / 2), Math.min(z + H, zz + m / 2)).toNI()); }
      add(mergeGeometries(geoms), '#5b6470'); add(prism(rectAlong(a, d, n, 0, len, .008), z, z + H), '#8ec5ea', { opacity: .35, glass: true }); break; }
    case 'rail': { const a = e.a, b = e.b, len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-4) break; const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-d[1], d[0]]; const H = e.h || 1; const geoms = [prism(rectAlong(a, d, n, 0, len, .03), z + H - .05, z + H).toNI(), prism(rectAlong(a, d, n, 0, len, .015), z + .1, z + .13).toNI()];
      const k = Math.max(1, Math.round(len / (e.step || 1))); for (let i = 0; i <= k; i++) { const t = len * i / k; geoms.push(prism(rectAlong(a, d, n, Math.max(0, t - .02), Math.min(len, t + .02), .02), z, z + H).toNI()); }
      for (let t = .12; t < len - .06; t += .12) geoms.push(prism(rectAlong(a, d, n, t - .006, t + .006, .006), z + .13, z + H - .05).toNI());
      add(mergeGeometries(geoms), '#3a3f46'); break; }
    case 'grid': { const a = e.a, b = e.b, len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-4) break; const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-d[1], d[0]]; const geoms = [];
      for (let t = 0; t < len; t += .9) geoms.push(prism(rectAlong(a, d, n, t, Math.min(len, t + .6), .015), z + .005, z + .012).toNI());
      [a, b].forEach(c => { const ring = []; for (let i = 0; i < 24; i++) ring.push([c[0] + .45 * Math.cos(i * Math.PI / 12), c[1] + .45 * Math.sin(i * Math.PI / 12)]); const hole = ring.map(q => [c[0] + (q[0] - c[0]) * .85, c[1] + (q[1] - c[1]) * .85]); geoms.push(prism(ring, z + .005, z + .015, [hole]).toNI()); });
      add(mergeGeometries(geoms), '#d1242f', { grid: true }); break; }
    case 'brep': case 'csg': if (e.mesh) { const g = meshGeom(e.mesh.pos, e.mesh.idx); g.translate(0, z, 0); add(g, MATERIALS[e.material] || '#b9b0ea'); } break;
  }
  return parts;
}
function roofGeom(e, base) {
  const pts = ccw(e.pts); const tan = Math.tan((e.slope || 0) * Math.PI / 180); const thk = e.thk || .25;
  const dir = e.dir ?? 0; const dv = [Math.cos(dir), Math.sin(dir)];
  const proj = p => p[0] * dv[0] + p[1] * dv[1]; const mn = Math.min(...pts.map(proj)), mx = Math.max(...pts.map(proj));
  let hf; if (e.kind === 'gable') { const mid = (mn + mx) / 2, half = (mx - mn) / 2; hf = p => base + tan * (half - Math.abs(proj(p) - mid)); } else if (e.kind === 'mono') hf = p => base + tan * (proj(p) - mn); else hf = () => base;
  if (e.kind === 'gable') { // spezza il poligono lungo il colmo per avere falde piane
    const mid = (mn + mx) / 2; const big = 1e4; const nv = [-dv[1], dv[0]]; const c = [dv[0] * mid, dv[1] * mid];
    const half = s => [[c[0] + nv[0] * big, c[1] + nv[1] * big], [c[0] - nv[0] * big, c[1] - nv[1] * big], [c[0] - nv[0] * big + dv[0] * big * s, c[1] - nv[1] * big + dv[1] * big * s], [c[0] + nv[0] * big + dv[0] * big * s, c[1] + nv[1] * big + dv[1] * big * s]];
    const G = window.App.geom; const pieces = [...G.clip(pts, half(1), 'intersection'), ...G.clip(pts, half(-1), 'intersection')].map(p => p[0]);
    return mergeGeometries(pieces.map(pc => slopedPrism(pc, hf, thk)));
  }
  return slopedPrism(pts, hf, thk);
}
function slopedPrism(pts, hf, thk) {
  pts = ccw(pts); const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []); const pos = [];
  const v = (p, k) => { const zz = hf(p) + k; pos.push(p[0], zz, -p[1]); };
  tris.forEach(([i, j, k]) => { v(pts[i], thk); v(pts[j], thk); v(pts[k], thk); v(pts[k], 0); v(pts[j], 0); v(pts[i], 0); });
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; v(a, 0); v(b, 0); v(b, thk); v(a, 0); v(b, thk); v(a, thk); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}

/** quantità per abachi */
export function quantities(bim, e) {
  const L = levelOf(bim, e.level); const q = { tipo: TYPES[e.type].label, nome: e.name || '', livello: L.name, materiale: e.material || '' };
  if (e.type === 'wall') { const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), H = e.h ?? L.height; const op = hosted(bim, e).reduce((s, o) => s + o.width * o.height, 0); Object.assign(q, { lunghezza: len, altezza: H, spessore: e.thk, area_lorda: len * H, area_netta: len * H - op, volume: (len * H - op) * e.thk }); }
  else if (e.type === 'cwall') { const pl = e.path; let len = 0; for (let i = 1; i < pl.length; i++) len += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]); const H = e.h ?? L.height; Object.assign(q, { lunghezza: len, altezza: H, spessore: e.thk, area_netta: len * H, volume: len * H * e.thk }); }
  else if (e.type === 'slab' || e.type === 'roof') { const A = polyArea(e.pts) - (e.holes || []).reduce((s, h) => s + polyArea(h), 0); const k = e.type === 'roof' && e.kind !== 'flat' ? 1 / Math.cos((e.slope || 0) * Math.PI / 180) : 1; Object.assign(q, { area: A * k, spessore: e.thk, volume: A * k * e.thk }); }
  else if (e.type === 'mass') Object.assign(q, { area: polyArea(e.pts), altezza: e.h, volume: polyArea(e.pts) * e.h });
  else if (e.type === 'space') { const H = e.h ?? L.height - .3; Object.assign(q, { destinazione: e.use || '', area: polyArea(e.pts), altezza: H, volume: polyArea(e.pts) * H, perimetro: e.pts.reduce((s, p, i) => { const n = e.pts[(i + 1) % e.pts.length]; return s + Math.hypot(n[0] - p[0], n[1] - p[1]); }, 0) }); }
  else if (e.type === 'column') { const H = e.h ?? L.height; const A = e.shape === 'round' ? Math.PI * e.w * e.w / 4 : e.w * e.d; Object.assign(q, { sezione: e.shape === 'round' ? `Ø${e.w}` : `${e.w}×${e.d}`, altezza: H, volume: A * H }); }
  else if (e.type === 'beam') { const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]); Object.assign(q, { sezione: `${e.w}×${e.hb}`, lunghezza: len, volume: len * e.w * e.hb }); }
  else if (e.type === 'door' || e.type === 'window') Object.assign(q, { larghezza: e.width, altezza: e.height, davanzale: e.type === 'window' ? e.sill : 0, area: e.width * e.height });
  else if (e.type === 'curtain') { const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), H = e.h ?? L.height; Object.assign(q, { lunghezza: len, altezza: H, area: len * H, moduli: Math.max(1, Math.round(len / (e.gu || 1.5))) * Math.max(1, Math.round(H / (e.gv || 1.2))) }); }
  else if (e.type === 'rail') Object.assign(q, { lunghezza: Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]), altezza: e.h || 1 });
  else if (e.type === 'grid') Object.assign(q, { asse: e.label, lunghezza: Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) });
  else if (e.type === 'stair') Object.assign(q, { larghezza: e.width, alzata: (e.rise ?? L.height) / Math.max(2, Math.round((e.rise ?? L.height) / .17)), pedata: e.run || .28, gradini: Math.max(2, Math.round((e.rise ?? L.height) / .17)) });
  return q;
}

/** export IFC4 (rappresentazione Tessellation – IfcTriangulatedFaceSet) */
export function exportIFC(bim, project, meshes, user, org) {
  let n = 0; const L = []; const E = s => { L.push(`#${++n}=${s};`); return '#' + n; };
  const S = s => `'${String(s ?? '').replace(/'/g, "''").replace(/[^\x20-\x7e]/g, c => `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}\\X0\\`)}'`;
  const F = v => { const s = (+v).toFixed(5).replace(/0+$/, ''); return s.endsWith('.') ? s : s; };
  const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'; const guid = () => { let s = B64[Math.floor(Math.random() * 4)]; for (let i = 0; i < 21; i++) s += B64[Math.floor(Math.random() * 64)]; return s; };
  const nm = String(user || 'Utente').split(' ');
  const per = E(`IFCPERSON($,${S(nm.slice(1).join(' ') || nm[0])},${S(nm[0])},$,$,$,$,$)`), og = E(`IFCORGANIZATION($,${S(org)},$,$,$)`), po = E(`IFCPERSONANDORGANIZATION(${per},${og},$)`), app = E(`IFCAPPLICATION(${og},'1.0','BeCity BIM','BECITY-BIM')`);
  const oh = E(`IFCOWNERHISTORY(${po},${app},$,.ADDED.,$,$,$,${Math.floor(Date.now() / 1000)})`);
  const units = E(`IFCUNITASSIGNMENT((${E('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)')},${E('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)')},${E('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)')},${E('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)')}))`);
  const o0 = E('IFCCARTESIANPOINT((0.,0.,0.))'), zd = E('IFCDIRECTION((0.,0.,1.))'), xd = E('IFCDIRECTION((1.,0.,0.))'); const ax0 = E(`IFCAXIS2PLACEMENT3D(${o0},${zd},${xd})`);
  const ctx = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${ax0},$)`); const body = E(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const proj = E(`IFCPROJECT('${guid()}',${oh},${S(project.name)},${S('BeCity BIM')},$,$,${S(project.phase || '')},(${ctx}),${units})`);
  const dms = v => { const d = Math.trunc(v), mf = Math.abs(v - d) * 60, m = Math.trunc(mf), sf = (mf - m) * 60, s = Math.trunc(sf), us = Math.round((sf - s) * 1e6); const g = v < 0 ? -1 : 1; return `(${d},${g * m},${g * s},${g * us})`; };
  const plSite = E(`IFCLOCALPLACEMENT($,${ax0})`); const site = E(`IFCSITE('${guid()}',${oh},${S('Sito' + (project.comune ? ' – ' + project.comune : ''))},$,$,${plSite},$,$,.ELEMENT.,${dms(project.origin.lat)},${dms(project.origin.lon)},0.,$,$)`);
  const plB = E(`IFCLOCALPLACEMENT(${plSite},${ax0})`); const bld = E(`IFCBUILDING('${guid()}',${oh},${S(project.name)},$,$,${plB},$,$,.ELEMENT.,$,$,$)`);
  E(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${proj},(${site}))`); E(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${site},(${bld}))`);
  const stoMap = {}; const storeys = bim.levels.map(l => { const pl = E(`IFCLOCALPLACEMENT(${plB},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT((0.,0.,${F(l.elev)}))`)},$,$)`)})`); const s = E(`IFCBUILDINGSTOREY('${guid()}',${oh},${S(l.name)},$,$,${pl},$,$,.ELEMENT.,${F(l.elev)})`); stoMap[l.id] = { s, pl, elev: l.elev, items: [], spaces: [] }; return s; });
  E(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${bld},(${storeys.join(',')}))`);
  const matMap = {}; const matOf = m => matMap[m] || (matMap[m] = E(`IFCMATERIAL(${S(m)},$,$)`)); const matUse = {};
  const pset = (obj, name, props) => { const ps = Object.entries(props).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => E(`IFCPROPERTYSINGLEVALUE(${S(k)},$,${typeof v === 'number' ? `IFCREAL(${F(v)})` : typeof v === 'boolean' ? `IFCBOOLEAN(.${v ? 'T' : 'F'}.)` : `IFCLABEL(${S(v)})`},$)`)); if (!ps.length) return; const s = E(`IFCPROPERTYSET('${guid()}',${oh},${S(name)},$,(${ps.join(',')}))`); E(`IFCRELDEFINESBYPROPERTIES('${guid()}',${oh},$,$,(${obj}),${s})`); };
  bim.elements.forEach(e => {
    if (e.type === 'grid') return;
    const m = meshes(e); if (!m || !m.pos.length) return; const st = stoMap[e.level] || stoMap[bim.levels[0].id];
    const coords = []; for (let i = 0; i < m.pos.length; i += 3) coords.push(`(${F(m.pos[i])},${F(m.pos[i + 1])},${F(m.pos[i + 2] - st.elev)})`);
    const tri = []; for (let i = 0; i < m.idx.length; i += 3) tri.push(`(${m.idx[i] + 1},${m.idx[i + 1] + 1},${m.idx[i + 2] + 1})`);
    const fs = E(`IFCTRIANGULATEDFACESET(${E(`IFCCARTESIANPOINTLIST3D((${coords.join(',')}),$)`)},$,.T.,(${tri.join(',')}),$)`);
    const shape = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${E(`IFCSHAPEREPRESENTATION(${body},'Body','Tessellation',(${fs}))`)}))`);
    const pl = E(`IFCLOCALPLACEMENT(${st.pl},${ax0})`); const name = S(e.name || TYPES[e.type].label); const q = quantities(bim, e);
    let obj;
    switch (e.type) {
      case 'wall': case 'cwall': obj = E(`IFCWALL('${guid()}',${oh},${name},$,$,${pl},${shape},$,.STANDARD.)`); pset(obj, 'Pset_WallCommon', { IsExternal: !!e.external, LoadBearing: !!e.loadBearing, FireRating: e.fire, ThermalTransmittance: e.u }); break;
      case 'slab': obj = E(`IFCSLAB('${guid()}',${oh},${name},$,$,${pl},${shape},$,.FLOOR.)`); pset(obj, 'Pset_SlabCommon', { LoadBearing: true, FireRating: e.fire }); break;
      case 'roof': obj = E(`IFCROOF('${guid()}',${oh},${name},$,$,${pl},${shape},$,.${e.kind === 'gable' ? 'GABLE_ROOF' : e.kind === 'mono' ? 'SHED_ROOF' : 'FLAT_ROOF'}.)`); break;
      case 'column': obj = E(`IFCCOLUMN('${guid()}',${oh},${name},$,$,${pl},${shape},$,.COLUMN.)`); pset(obj, 'Pset_ColumnCommon', { LoadBearing: true }); break;
      case 'beam': obj = E(`IFCBEAM('${guid()}',${oh},${name},$,$,${pl},${shape},$,.BEAM.)`); break;
      case 'door': obj = E(`IFCDOOR('${guid()}',${oh},${name},$,$,${pl},${shape},$,${F(e.height)},${F(e.width)},.DOOR.,.SINGLE_SWING_LEFT.,$)`); break;
      case 'window': obj = E(`IFCWINDOW('${guid()}',${oh},${name},$,$,${pl},${shape},$,${F(e.height)},${F(e.width)},.WINDOW.,.SINGLE_PANEL.,$)`); break;
      case 'curtain': obj = E(`IFCCURTAINWALL('${guid()}',${oh},${name},$,$,${pl},${shape},$,.NOTDEFINED.)`); break;
      case 'rail': obj = E(`IFCRAILING('${guid()}',${oh},${name},$,$,${pl},${shape},$,.GUARDRAIL.)`); break;
      case 'stair': obj = E(`IFCSTAIR('${guid()}',${oh},${name},$,$,${pl},${shape},$,.STRAIGHT_RUN_STAIR.)`); break;
      case 'space': obj = E(`IFCSPACE('${guid()}',${oh},${name},$,${S(e.use || '')},${pl},${shape},${S(e.use || '')},.ELEMENT.,.INTERNAL.,$)`); st.spaces.push(obj); pset(obj, 'Pset_SpaceCommon', { NetFloorArea: q.area, Volume: q.volume, Destinazione: e.use }); return;
      default: obj = E(`IFCBUILDINGELEMENTPROXY('${guid()}',${oh},${name},$,$,${pl},${shape},$,.NOTDEFINED.)`);
    }
    st.items.push(obj); if (e.material) (matUse[e.material] = matUse[e.material] || []).push(obj);
    const qq = {}; Object.entries(q).forEach(([k, v]) => { if (typeof v === 'number') qq[k] = +v.toFixed(4); }); pset(obj, 'BeCity_Quantita', qq);
    if (e.ai) pset(obj, 'BeCity_AI', { Stato: 'Generato da AI – da verificare' });
  });
  Object.entries(matUse).forEach(([m, objs]) => E(`IFCRELASSOCIATESMATERIAL('${guid()}',${oh},$,$,(${objs.join(',')}),${matOf(m)})`));
  Object.values(stoMap).forEach(st => { if (st.items.length) E(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',${oh},$,$,(${st.items.join(',')}),${st.s})`); if (st.spaces.length) E(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${st.s},(${st.spaces.join(',')}))`); });
  const ts = new Date().toISOString().slice(0, 19);
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');\nFILE_NAME(${S(project.name + '.ifc')},'${ts}',(${S(user || '')}),(${S(org)}),'BeCity BIM','BeCity','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${L.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

/** mesh (coordinate di piano, z assoluta) da parti three */
export function partsToPlanMesh(parts) {
  const pos = [], idx = []; let off = 0;
  parts.filter(p => !p.space || true).forEach(p => { const g = p.geom.index ? p.geom : p.geom; const P = g.attributes.position; for (let i = 0; i < P.count; i++) pos.push(P.getX(i), -P.getZ(i), P.getY(i)); if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i++) idx.push(I[i] + off); } else for (let i = 0; i < P.count; i++) idx.push(i + off); off += P.count; });
  return { pos, idx };
}
