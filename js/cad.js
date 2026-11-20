/* BeCity – Pianta parametrica 2D: motore di disegno, riga di comando, snap, layer, blocchi, DXF */
'use strict';
(function () {
  const G = App.geom;
  const CAD = App.cad = {};
  let host, cv, ctx, W = 0, H = 0, dpr = 1;
  let view = { x: 0, y: 0, s: 40 };
  let D = null; // drawing
  let sel = new Set(), hover = null, cursor = [0, 0], cursorScr = [0, 0], snap = null;
  let undo = [], redo = [], baseline = null;
  let active = null; // comando attivo
  let preview = [];
  let dragSel = null, panning = null;
  let highlights = []; // evidenziazioni da conformità
  let remote = {}; // cursori remoti
  let mode3d = false;
  const settings = { grid: true, snap: true, ortho: false, polar: false, osnap: true, dyn: true, gridStep: 1 };
  const CANCEL = Symbol('cancel');
  CAD.CANCEL = CANCEL;

  /* ---------- blocchi di libreria (arredi) ---------- */
  const rectE = (x, y, w, h) => ({ type: 'pline', pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true });
  CAD.LIB = {
    'Letto matrimoniale': { w: 1.6, h: 2.0, ents: [rectE(0, 0, 1.6, 2), rectE(.1, 1.55, .65, .35), rectE(.85, 1.55, .65, .35), { type: 'line', x1: 0, y1: 1.4, x2: 1.6, y2: 1.4 }] },
    'Letto singolo': { w: .9, h: 2.0, ents: [rectE(0, 0, .9, 2), rectE(.15, 1.55, .6, .35), { type: 'line', x1: 0, y1: 1.4, x2: .9, y2: 1.4 }] },
    'Divano 3 posti': { w: 2.1, h: .9, ents: [rectE(0, 0, 2.1, .9), rectE(0, 0, .2, .9), rectE(1.9, 0, .2, .9), rectE(.2, .65, 1.7, .25), { type: 'line', x1: .77, y1: 0, x2: .77, y2: .65 }, { type: 'line', x1: 1.33, y1: 0, x2: 1.33, y2: .65 }] },
    'Tavolo 6 posti': { w: 1.8, h: 1.6, ents: [rectE(0, .35, 1.8, .9), ...[.2, .8, 1.4].flatMap(x => [rectE(x, 0, .4, .3), rectE(x, 1.3, .4, .3)])] },
    'WC': { w: .4, h: .65, ents: [rectE(0, .45, .4, .2), { type: 'circle', cx: .2, cy: .22, r: .2 }] },
    'Lavabo': { w: .6, h: .45, ents: [rectE(0, 0, .6, .45), { type: 'circle', cx: .3, cy: .2, r: .14 }] },
    'Doccia 80x80': { w: .8, h: .8, ents: [rectE(0, 0, .8, .8), { type: 'line', x1: 0, y1: 0, x2: .8, y2: .8 }, { type: 'line', x1: .8, y1: 0, x2: 0, y2: .8 }, { type: 'circle', cx: .4, cy: .4, r: .04 }] },
    'Vasca': { w: 1.7, h: .7, ents: [rectE(0, 0, 1.7, .7), { type: 'pline', pts: [[.1, .1], [1.6, .1], [1.6, .6], [.1, .6]], closed: true }, { type: 'circle', cx: 1.45, cy: .35, r: .04 }] },
    'Cucina lineare 2,4 m': { w: 2.4, h: .6, ents: [rectE(0, 0, 2.4, .6), rectE(.15, .1, .5, .4), { type: 'circle', cx: 1.3, cy: .2, r: .09 }, { type: 'circle', cx: 1.6, cy: .2, r: .09 }, { type: 'circle', cx: 1.3, cy: .45, r: .07 }, { type: 'circle', cx: 1.6, cy: .45, r: .07 }] },
    'Armadio 1,2 m': { w: 1.2, h: .6, ents: [rectE(0, 0, 1.2, .6), { type: 'line', x1: .6, y1: 0, x2: .6, y2: .6 }, { type: 'line', x1: 0, y1: .3, x2: 1.2, y2: .3 }] },
    'Albero': { w: 3, h: 3, ents: [{ type: 'circle', cx: 1.5, cy: 1.5, r: 1.5 }, { type: 'circle', cx: 1.5, cy: 1.5, r: .15 }] },
    'Auto': { w: 1.8, h: 4.5, ents: [rectE(0, 0, 1.8, 4.5), rectE(.15, 1.2, 1.5, 1.9)] }
  };
  CAD.ROOMTYPES = ['Soggiorno', 'Cucina', 'Soggiorno-cucina', 'Camera singola', 'Camera doppia', 'Bagno', 'Disimpegno', 'Corridoio', 'Ripostiglio', 'Studio', 'Altro'];

  /* ---------- geometria entità ---------- */
  const wallPts = w => { const a = [w.x1, w.y1], b = [w.x2, w.y2]; const n = G.perp(G.norm(G.sub(b, a))), t = w.thk / 2; return [G.add(a, G.mul(n, t)), G.add(b, G.mul(n, t)), G.sub(b, G.mul(n, t)), G.sub(a, G.mul(n, t))]; };
  CAD.wallPts = wallPts;
  const openings = w => D.entities.filter(e => (e.type === 'door' || e.type === 'window') && e.wall === w.id);
  CAD.openingsOf = openings;
  const openingGeom = o => { const w = D.entities.find(e => e.id === o.wall); if (!w) return null; const a = [w.x1, w.y1], b = [w.x2, w.y2], L = G.dist(a, b) || 1, d = G.norm(G.sub(b, a)), n = G.perp(d); const c = G.lerp(a, b, o.t); const h = o.width / 2; return { w, a, b, L, d, n, c, p1: G.sub(c, G.mul(d, h)), p2: G.add(c, G.mul(d, h)), thk: w.thk }; };
  CAD.openingGeom = openingGeom;
  const blockEnts = ins => { const b = (D.blocks && D.blocks[ins.name]) || CAD.LIB[ins.name]; if (!b) return []; const s = ins.scale || 1, r = ins.rot || 0, c = Math.cos(r), sn = Math.sin(r); const T = p => [ins.x + (p[0] * c - p[1] * sn) * s, ins.y + (p[0] * sn + p[1] * c) * s]; return b.ents.map(e => xformEnt(e, T, s, r)); };
  const ellPts = (e, n = 72) => { const out = []; const a0 = e.a1 ?? 0, a1 = e.a2 ?? Math.PI * 2; const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-9; const m = full ? n : n + 1; const c = Math.cos(e.rot || 0), sn = Math.sin(e.rot || 0); for (let i = 0; i < m; i++) { const t = a0 + (a1 - a0) * i / n; const x = e.rx * Math.cos(t), y = e.ry * Math.sin(t); out.push([e.cx + x * c - y * sn, e.cy + x * sn + y * c]); } return out; };
  const splPts = (pts, closed, k = 12) => { if (pts.length < 3) return pts.slice(); const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]]; const out = []; for (let i = 1; i < P.length - 2; i++) { const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]]; for (let j = 0; j < k; j++) { const t = j / k, t2 = t * t, t3 = t2 * t; out.push([0, 1].map(d => .5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3))); } } if (!closed) out.push(pts[pts.length - 1]); return out; };
  CAD.ellPts = ellPts; CAD.splPts = splPts;
  const mtLines = e => String(e.text || '').split(/\n|\\P/);
  function xformEnt(e, T, s = 1, r = 0, mirror = false) {
    const o = Object.assign({}, e);
    if ('x1' in e) { [o.x1, o.y1] = T([e.x1, e.y1]); [o.x2, o.y2] = T([e.x2, e.y2]); }
    if (e.pts) o.pts = e.pts.map(T);
    if ('cx' in e) { [o.cx, o.cy] = T([e.cx, e.cy]); if ('r' in e) o.r = e.r * s; if ('rx' in e) { o.rx = e.rx * s; o.ry = e.ry * s; o.rot = (e.rot || 0) + r; } }
    if ((e.type === 'mtext' || e.type === 'point') && 'x' in e) { [o.x, o.y] = T([e.x, e.y]); if (e.type === 'mtext') { o.h = e.h * s; o.rot = (e.rot || 0) + r; } }
    if (e.holes) o.holes = e.holes.map(h => h.map(T));
    if (e.type === 'arc') { if (mirror) { o.a1 = -e.a2 + r; o.a2 = -e.a1 + r; } else { o.a1 = e.a1 + r; o.a2 = e.a2 + r; } }
    if (e.type === 'text' || e.type === 'insert') { [o.x, o.y] = T([e.x, e.y]); o.rot = (e.rot || 0) + r; if (e.type === 'text') o.h = e.h * s; else o.scale = (e.scale || 1) * s; }
    if (e.type === 'dim') { o.off = e.off * (mirror ? -1 : 1); if (e.lin) { const A = T(e.lin === 'h' ? [e.x1, e.at] : [e.at, e.y1]); o.at = e.lin === 'h' ? A[1] : A[0]; } }
    return o;
  }
  CAD.xformEnt = xformEnt;
  /** segmenti per hit-test/snap/trim */
  function segsOf(e) {
    switch (e.type) {
      case 'line': return [[[e.x1, e.y1], [e.x2, e.y2]]];
      case 'pline': case 'room': case 'solid': { const s = []; const n = e.pts.length; for (let i = 0; i < n - (e.closed || e.type !== 'pline' ? 0 : 1); i++) s.push([e.pts[i], e.pts[(i + 1) % n]]); return s; }
      case 'wall': { const p = wallPts(e); return [[[e.x1, e.y1], [e.x2, e.y2]], [p[0], p[1]], [p[3], p[2]]]; }
      case 'dim': return [[[e.x1, e.y1], [e.x2, e.y2]]];
      case 'circle': { const pts = G.circlePts([e.cx, e.cy], e.r, 48); return pts.map((p, i) => [p, pts[(i + 1) % pts.length]]); }
      case 'arc': { const pts = G.circlePts([e.cx, e.cy], e.r, 32, e.a1, e.a2 < e.a1 ? e.a2 + Math.PI * 2 : e.a2); return pts.slice(1).map((p, i) => [pts[i], p]); }
      case 'insert': return blockEnts(e).flatMap(segsOf);
      case 'door': case 'window': { const g = openingGeom(e); return g ? [[g.p1, g.p2]] : []; }
      case 'mesh': { const h = G.hull(e.verts.map(v => [v[0], v[1]])); return h.map((p, i) => [p, h[(i + 1) % h.length]]); }
      case 'ellipse': { const pts = ellPts(e, 64); const full = e.a1 == null; return pts.slice(full ? 0 : 1).map((q, i) => full ? [q, pts[(i + 1) % pts.length]] : [pts[i], q]); }
      case 'spline': { const pts = splPts(e.pts, e.closed, 8); const n = pts.length; const o = []; for (let i = 0; i < n - (e.closed ? 0 : 1); i++) o.push([pts[i], pts[(i + 1) % n]]); return o; }
      case 'hatch': { const o = []; [e.pts, ...(e.holes || [])].forEach(r => r.forEach((q, i) => o.push([q, r[(i + 1) % r.length]]))); return o; }
      case 'leader': return e.pts.slice(1).map((q, i) => [e.pts[i], q]);
      case 'point': return [[[e.x - .05, e.y], [e.x + .05, e.y]], [[e.x, e.y - .05], [e.x, e.y + .05]]];
      case 'dimr': { const q = [e.cx + e.r * Math.cos(e.ang), e.cy + e.r * Math.sin(e.ang)]; return [[[e.cx, e.cy], q]]; }
      default: return [];
    }
  }
  CAD.segsOf = segsOf;
  function keyPts(e) {
    const o = [];
    switch (e.type) {
      case 'line': case 'dim': o.push({ p: [e.x1, e.y1], k: 'end', ref: 'p1' }, { p: [e.x2, e.y2], k: 'end', ref: 'p2' }, { p: [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2], k: 'mid' }); break;
      case 'wall': { o.push({ p: [e.x1, e.y1], k: 'end', ref: 'p1' }, { p: [e.x2, e.y2], k: 'end', ref: 'p2' }, { p: [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2], k: 'mid' }); wallPts(e).forEach(p => o.push({ p, k: 'end' })); break; }
      case 'pline': case 'room': case 'solid': e.pts.forEach((p, i) => { o.push({ p, k: 'end', ref: 'v' + i }); const q = e.pts[i + 1] || ((e.closed || e.type !== 'pline') ? e.pts[0] : null); if (q) o.push({ p: G.lerp(p, q, .5), k: 'mid' }); }); if (e.type !== 'pline' || e.closed) o.push({ p: G.centroid(e.pts), k: 'cen' }); break;
      case 'circle': o.push({ p: [e.cx, e.cy], k: 'cen' }); [0, 1, 2, 3].forEach(i => o.push({ p: [e.cx + e.r * Math.cos(i * Math.PI / 2), e.cy + e.r * Math.sin(i * Math.PI / 2)], k: 'quad' })); break;
      case 'arc': o.push({ p: [e.cx, e.cy], k: 'cen' }, { p: [e.cx + e.r * Math.cos(e.a1), e.cy + e.r * Math.sin(e.a1)], k: 'end' }, { p: [e.cx + e.r * Math.cos(e.a2), e.cy + e.r * Math.sin(e.a2)], k: 'end' }); break;
      case 'text': case 'insert': o.push({ p: [e.x, e.y], k: 'ins' }); if (e.type === 'insert') blockEnts(e).forEach(b => o.push(...keyPts(b))); break;
      case 'ellipse': o.push({ p: [e.cx, e.cy], k: 'cen' }); ellPts(e, 4).forEach(q => o.push({ p: q, k: 'quad' })); break;
      case 'spline': case 'leader': e.pts.forEach((q, i) => o.push({ p: q, k: 'end', ref: 'v' + i })); break;
      case 'hatch': e.pts.forEach(q => o.push({ p: q, k: 'end' })); break;
      case 'point': o.push({ p: [e.x, e.y], k: 'end' }); break;
      case 'mtext': o.push({ p: [e.x, e.y], k: 'ins' }); break;
      case 'dimr': o.push({ p: [e.cx, e.cy], k: 'cen' }); break;
      case 'door': case 'window': { const g = openingGeom(e); if (g) o.push({ p: g.p1, k: 'end' }, { p: g.p2, k: 'end' }, { p: g.c, k: 'mid' }); break; }
    }
    return o;
  }
  CAD.keyPts = keyPts;
  function bboxOf(e) { const pts = []; segsOf(e).forEach(s => pts.push(s[0], s[1])); if (e.type === 'text') { pts.push([e.x, e.y], [e.x + e.text.length * e.h * .6, e.y + e.h]); } if (e.type === 'mtext') { const L = mtLines(e); pts.push([e.x, e.y], [e.x + Math.max(...L.map(l => l.length)) * e.h * .6, e.y - L.length * e.h * 1.45]); } if (e.type === 'wall') pts.push(...wallPts(e)); return pts.length ? G.bbox(pts) : null; }
  CAD.bboxOf = bboxOf;
  function hitDist(e, p) {
    if (e.type === 'hatch') { if (G.pip(p, e.pts)) return 2.5 / view.s; }
    if (e.type === 'text' || e.type === 'mtext') { const b = bboxOf(e); return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] ? 0 : Infinity; }
    if (e.type === 'wall') { if (G.pip(p, wallPts(e))) return 0; }
    if (e.type === 'room' || e.type === 'solid') { let d = Math.min(...segsOf(e).map(s => G.segDist(p, s[0], s[1]))); if (d > 3 / view.s && G.pip(p, e.pts)) d = 2.5 / view.s; return d; }
    const segs = segsOf(e); if (!segs.length) return Infinity;
    let d = Infinity; for (const s of segs) d = Math.min(d, G.segDist(p, s[0], s[1])); return d;
  }
  CAD.area = e => e.pts ? Math.abs(G.area(e.pts)) : e.type === 'circle' ? Math.PI * e.r * e.r : 0;

  /* ---------- trasformazioni schermo ---------- */
  const toScr = p => [(p[0] - view.x) * view.s + W / 2, H / 2 - (p[1] - view.y) * view.s];
  const toW = q => [(q[0] - W / 2) / view.s + view.x, (H / 2 - q[1]) / view.s + view.y];
  CAD.toScr = toScr; CAD.toW = toW;
  const layerOf = n => D.layers.find(l => l.name === n) || D.layers[0];
  const visible = e => { const l = layerOf(e.layer); return l.visible && !l.frozen; };
  const editable = e => { const l = layerOf(e.layer); return l.visible && !l.frozen && !l.locked; };

  /* ---------- rendering ---------- */
  function resize() { const r = host.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; draw(); }
  function strokeEnt(c, e, col, lw, dash) {
    c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []);
    switch (e.type) {
      case 'line': { const a = toScr([e.x1, e.y1]), b = toScr([e.x2, e.y2]); c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); break; }
      case 'pline': case 'solid': { c.beginPath(); e.pts.forEach((p, i) => { const q = toScr(p); i ? c.lineTo(...q) : c.moveTo(...q); }); if (e.closed || e.type === 'solid') c.closePath(); c.stroke(); if (e.type === 'solid') { c.save(); c.globalAlpha = .08; c.fillStyle = col; c.fill(); c.restore(); } break; }
      case 'circle': { const q = toScr([e.cx, e.cy]); c.beginPath(); c.arc(q[0], q[1], e.r * view.s, 0, Math.PI * 2); c.stroke(); break; }
      case 'arc': { const q = toScr([e.cx, e.cy]); c.beginPath(); c.arc(q[0], q[1], e.r * view.s, -e.a1, -e.a2, true); c.stroke(); break; }
      case 'text': { const q = toScr([e.x, e.y]); c.save(); c.translate(q[0], q[1]); c.rotate(-(e.rot || 0)); c.fillStyle = col; c.font = `${Math.max(1, e.h * view.s)}px ${e.font || 'Helvetica, Arial, sans-serif'}`; c.textBaseline = 'alphabetic'; c.fillText(e.text, 0, 0); c.restore(); break; }
      case 'dim': drawDim(c, e, col, lw); break;
      case 'insert': blockEnts(e).forEach(b => strokeEnt(c, b, col, lw, dash)); break;
      case 'room': { c.beginPath(); e.pts.forEach((p, i) => { const q = toScr(p); i ? c.lineTo(...q) : c.moveTo(...q); }); c.closePath(); c.save(); c.globalAlpha = .07; c.fillStyle = col; c.fill(); c.restore(); c.setLineDash([4, 4]); c.globalAlpha = .5; c.stroke(); c.globalAlpha = 1; c.setLineDash([]);
        const ce = toScr(e.label ? e.label : G.centroid(e.pts)); const fs = Math.max(9, Math.min(15, view.s * .32)); c.fillStyle = CAD.dark ? '#e8ecf2' : '#14213d'; c.textAlign = 'center'; c.font = `600 ${fs}px Helvetica, Arial`; c.fillText(e.name || 'Stanza', ce[0], ce[1]); c.font = `${fs * .85}px Helvetica, Arial`; c.fillStyle = CAD.dark ? '#9aa6b8' : '#5d6879'; c.fillText(App.fnum(CAD.area(e)) + ' m²' + (e.h ? `  h ${App.fnum(e.h)}` : ''), ce[0], ce[1] + fs * 1.15); c.textAlign = 'start'; break; }
      case 'door': case 'window': drawOpening(c, e, col, lw); break;
      case 'ellipse': case 'spline': { const pts = e.type === 'ellipse' ? ellPts(e) : splPts(e.pts, e.closed); c.beginPath(); pts.forEach((q, i) => { const s2 = toScr(q); i ? c.lineTo(...s2) : c.moveTo(...s2); }); if (e.type === 'ellipse' ? e.a1 == null : e.closed) c.closePath(); c.stroke(); if (e.type === 'spline' && sel.has(e.id)) e.pts.forEach(q => { const s2 = toScr(q); c.strokeRect(s2[0] - 3, s2[1] - 3, 6, 6); }); break; }
      case 'point': { const q = toScr([e.x, e.y]); c.beginPath(); c.moveTo(q[0] - 4, q[1]); c.lineTo(q[0] + 4, q[1]); c.moveTo(q[0], q[1] - 4); c.lineTo(q[0], q[1] + 4); c.stroke(); c.beginPath(); c.arc(q[0], q[1], 2.5, 0, 7); c.stroke(); break; }
      case 'mtext': { const q = toScr([e.x, e.y]); c.save(); c.translate(q[0], q[1]); c.rotate(-(e.rot || 0)); c.fillStyle = col; const fs = Math.max(1, e.h * view.s); c.font = `${fs}px ${e.font || 'Helvetica, Arial, sans-serif'}`; c.textBaseline = 'top'; mtLines(e).forEach((l, i) => c.fillText(l, 0, i * fs * 1.45)); c.restore(); c.textBaseline = 'alphabetic'; break; }
      case 'leader': { c.beginPath(); e.pts.forEach((q, i) => { const s2 = toScr(q); i ? c.lineTo(...s2) : c.moveTo(...s2); }); c.stroke(); const a = toScr(e.pts[0]), b = toScr(e.pts[1] || e.pts[0]); const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); c.beginPath(); c.moveTo(...a); c.lineTo(a[0] + 11 * Math.cos(ang + .3), a[1] + 11 * Math.sin(ang + .3)); c.lineTo(a[0] + 11 * Math.cos(ang - .3), a[1] + 11 * Math.sin(ang - .3)); c.closePath(); c.fillStyle = col; c.fill(); if (e.text) { const last = toScr(e.pts[e.pts.length - 1]); c.font = `${Math.max(9, (e.h || .25) * view.s)}px Helvetica, Arial`; c.fillText(e.text, last[0] + 4, last[1] - 3); } break; }
      case 'dimr': { const q = [e.cx + e.r * Math.cos(e.ang), e.cy + e.r * Math.sin(e.ang)]; const a = toScr([e.cx, e.cy]), b = toScr(q); c.lineWidth = lw * .8; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); c.beginPath(); c.moveTo(...b); c.lineTo(b[0] - 10 * Math.cos(ang - .3), b[1] - 10 * Math.sin(ang - .3)); c.lineTo(b[0] - 10 * Math.cos(ang + .3), b[1] - 10 * Math.sin(ang + .3)); c.closePath(); c.fillStyle = col; c.fill(); c.font = `${Math.max(9, Math.min(14, view.s * .28))}px Helvetica, Arial`; c.fillText((e.dia ? 'Ø' : 'R') + App.fnum(e.dia ? e.r * 2 : e.r), (a[0] + b[0]) / 2 + 4, (a[1] + b[1]) / 2 - 4); break; }
      case 'hatch': { const path = () => { c.beginPath(); [e.pts, ...(e.holes || [])].forEach(r => { r.forEach((q, i) => { const s2 = toScr(q); i ? c.lineTo(...s2) : c.moveTo(...s2); }); c.closePath(); }); };
        c.save(); path(); c.clip('evenodd');
        if (e.pattern === 'solid') { c.globalAlpha = .45; c.fillStyle = col; c.fillRect(0, 0, W, H); }
        else { const bb = G.bbox(e.pts.map(toScr)); const sp = Math.max(3, (e.scale || .1) * view.s); c.lineWidth = .8; c.strokeStyle = col; const ang = (e.angle || 0) * Math.PI / 180;
          const fam = e.pattern === 'ansi37' ? [Math.PI / 4, -Math.PI / 4] : e.pattern === 'net' ? [0, Math.PI / 2] : e.pattern === 'dots' ? [] : e.pattern === 'brick' ? [0] : [Math.PI / 4];
          const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, R = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) / 2 + sp;
          fam.forEach(a0 => { const a = -(a0 + ang), d = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]]; c.beginPath(); for (let k = -R; k <= R; k += sp) { c.moveTo(cx + n[0] * k - d[0] * R, cy + n[1] * k - d[1] * R); c.lineTo(cx + n[0] * k + d[0] * R, cy + n[1] * k + d[1] * R); } c.stroke(); });
          if (e.pattern === 'brick') { c.beginPath(); let row = 0; for (let y = bb[1] - sp; y < bb[3] + sp; y += sp, row++) for (let x = bb[0] - 2 * sp + (row % 2) * sp; x < bb[2] + sp; x += 2 * sp) { c.moveTo(x, y); c.lineTo(x, y + sp); } c.stroke(); }
          if (e.pattern === 'dots') { c.fillStyle = col; for (let x = bb[0]; x < bb[2]; x += sp) for (let y = bb[1]; y < bb[3]; y += sp) c.fillRect(x, y, 1.6, 1.6); } }
        c.restore(); c.globalAlpha = 1; if (sel.has(e.id)) { path(); c.setLineDash([4, 3]); c.stroke(); c.setLineDash([]); } break; }
    }
  }
  function drawDim(c, e, col, lw) {
    if (e.lin) { const hz = e.lin === 'h'; const a = [e.x1, e.y1], b = [e.x2, e.y2]; const A = hz ? [a[0], e.at] : [e.at, a[1]], B = hz ? [b[0], e.at] : [e.at, b[1]]; const s2 = [toScr(a), toScr(b), toScr(A), toScr(B)]; c.strokeStyle = col; c.lineWidth = lw * .8; c.beginPath(); c.moveTo(...s2[0]); c.lineTo(...s2[2]); c.moveTo(...s2[1]); c.lineTo(...s2[3]); c.moveTo(...s2[2]); c.lineTo(...s2[3]); c.stroke(); [s2[2], s2[3]].forEach(q => { c.beginPath(); c.moveTo(q[0] - 4, q[1] + 4); c.lineTo(q[0] + 4, q[1] - 4); c.lineWidth = lw * 1.6; c.stroke(); }); const m = [(s2[2][0] + s2[3][0]) / 2, (s2[2][1] + s2[3][1]) / 2]; c.save(); c.translate(...m); if (!hz) c.rotate(-Math.PI / 2); c.fillStyle = col; c.textAlign = 'center'; c.font = `${Math.max(9, Math.min(14, view.s * .28))}px Helvetica, Arial`; c.fillText(e.text || App.fnum(hz ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1])), 0, -3); c.restore(); c.textAlign = 'start'; return; }
    const a = [e.x1, e.y1], b = [e.x2, e.y2]; const d = G.norm(G.sub(b, a)), n = G.perp(d); const A = G.add(a, G.mul(n, e.off)), B = G.add(b, G.mul(n, e.off));
    const s = [toScr(a), toScr(b), toScr(A), toScr(B)]; c.strokeStyle = col; c.lineWidth = lw * .8;
    c.beginPath(); c.moveTo(...s[0]); c.lineTo(...toScr(G.add(A, G.mul(n, Math.sign(e.off) * .15)))); c.moveTo(...s[1]); c.lineTo(...toScr(G.add(B, G.mul(n, Math.sign(e.off) * .15)))); c.moveTo(...s[2]); c.lineTo(...s[3]); c.stroke();
    const tk = 4; [s[2], s[3]].forEach(q => { c.beginPath(); c.moveTo(q[0] - tk, q[1] + tk); c.lineTo(q[0] + tk, q[1] - tk); c.lineWidth = lw * 1.6; c.stroke(); });
    const m = toScr(G.add(G.lerp(A, B, .5), G.mul(n, .12))); let ang = Math.atan2(-(s[3][1] - s[2][1]), s[3][0] - s[2][0]); if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
    c.save(); c.translate(...m); c.rotate(-ang); c.fillStyle = col; c.textAlign = 'center'; c.font = `${Math.max(9, Math.min(14, view.s * .28))}px Helvetica, Arial`; c.fillText(e.text || App.fnum(G.dist(a, b)), 0, -2); c.restore(); c.textAlign = 'start';
  }
  function drawOpening(c, e, col, lw) {
    const g = openingGeom(e); if (!g) return; const h = g.thk / 2;
    const q = (p, k) => toScr(G.add(p, G.mul(g.n, k)));
    c.strokeStyle = col; c.lineWidth = lw;
    c.beginPath(); c.moveTo(...q(g.p1, h)); c.lineTo(...q(g.p1, -h)); c.moveTo(...q(g.p2, h)); c.lineTo(...q(g.p2, -h)); c.stroke();
    if (e.type === 'window') { c.beginPath(); c.moveTo(...q(g.p1, h * .35)); c.lineTo(...q(g.p2, h * .35)); c.moveTo(...q(g.p1, -h * .35)); c.lineTo(...q(g.p2, -h * .35)); c.moveTo(...q(g.p1, h)); c.lineTo(...q(g.p2, h)); c.moveTo(...q(g.p1, -h)); c.lineTo(...q(g.p2, -h)); c.stroke(); }
    else { const side = e.side || 1, hingeAtStart = !e.flip; const hinge = hingeAtStart ? g.p1 : g.p2, other = hingeAtStart ? g.p2 : g.p1; const hp = G.add(hinge, G.mul(g.n, side * h)); const leaf = G.add(hp, G.mul(g.n, side * e.width));
      c.beginPath(); c.moveTo(...toScr(hp)); c.lineTo(...toScr(leaf)); c.stroke();
      const op = G.add(other, G.mul(g.n, side * h)); const C = toScr(hp), r = e.width * view.s; const a1 = Math.atan2(-(toScr(leaf)[1] - C[1]), toScr(leaf)[0] - C[0]), a2 = Math.atan2(-(toScr(op)[1] - C[1]), toScr(op)[0] - C[0]);
      c.setLineDash([3, 3]); c.beginPath(); let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; c.arc(C[0], C[1], r, -a1, -(a1 + d), d > 0); c.stroke(); c.setLineDash([]); }
  }
  function drawWalls(c, walls, colFn) {
    // contorni spessi, poi riempimento sopra: le giunzioni risultano pulite
    const polys = walls.map(w => {
      const a = [w.x1, w.y1], b = [w.x2, w.y2]; const d = G.norm(G.sub(b, a)); const ext = [0, 0];
      [0, 1].forEach(k => { const p = k ? b : a; if (walls.some(o => o !== w && G.segDist(p, [o.x1, o.y1], [o.x2, o.y2]) < o.thk / 2 + 1e-6)) ext[k] = w.thk / 2; });
      const A = G.sub(a, G.mul(d, ext[0])), B = G.add(b, G.mul(d, ext[1])); const L = G.dist(A, B);
      // pezzi tra le aperture
      const ops = openings(w).map(o => { const t0 = o.t * G.dist(a, b) + ext[0]; return [t0 - o.width / 2, t0 + o.width / 2]; }).sort((x, y) => x[0] - y[0]);
      const pieces = []; let s = 0; ops.forEach(([o0, o1]) => { if (o0 > s) pieces.push([s, o0]); s = Math.max(s, o1); }); if (s < L) pieces.push([s, L]);
      const n = G.perp(d), h = w.thk / 2;
      return { w, pieces: pieces.map(([t0, t1]) => [G.add(G.add(A, G.mul(d, t0)), G.mul(n, h)), G.add(G.add(A, G.mul(d, t1)), G.mul(n, h)), G.sub(G.add(A, G.mul(d, t1)), G.mul(n, h)), G.sub(G.add(A, G.mul(d, t0)), G.mul(n, h))]) };
    });
    const path = pts => { c.beginPath(); pts.forEach((p, i) => { const q = toScr(p); i ? c.lineTo(...q) : c.moveTo(...q); }); c.closePath(); };
    polys.forEach(P => { const col = colFn(P.w); c.strokeStyle = col.stroke; c.lineWidth = col.lw * 2; c.setLineDash([]); P.pieces.forEach(pc => { path(pc); c.stroke(); }); });
    polys.forEach(P => { const col = colFn(P.w); c.fillStyle = col.fill; P.pieces.forEach(pc => { path(pc); c.fill(); }); });
    // tratteggio (retino) muri
    if (view.s > 25) polys.forEach(P => { const col = colFn(P.w); c.save(); c.strokeStyle = col.hatch; c.lineWidth = .6; P.pieces.forEach(pc => { path(pc); c.save(); c.clip(); const bb = G.bbox(pc.map(toScr)); for (let x = bb[0] - (bb[3] - bb[1]); x < bb[2]; x += 6) { c.beginPath(); c.moveTo(x, bb[3]); c.lineTo(x + (bb[3] - bb[1]), bb[1]); c.stroke(); } c.restore(); }); c.restore(); });
  }
  const lum = h => { const x = String(h || '#000').replace('#', ''); if (x.length < 6) return 0; return (.299 * parseInt(x.slice(0, 2), 16) + .587 * parseInt(x.slice(2, 4), 16) + .114 * parseInt(x.slice(4, 6), 16)) / 255; };
  const dc = col => CAD.dark && lum(col) < .3 ? '#e8ecf2' : col; // colore 7 (bianco/nero) come nei CAD su sfondo scuro
  CAD.dark = true;
  function draw() {
    if (!ctx || mode3d) return;
    const c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    c.fillStyle = CAD.dark ? '#212830' : '#fbfcfe'; c.fillRect(0, 0, W, H);
    // griglia
    if (settings.grid) { let step = settings.gridStep; while (step * view.s < 12) step *= 5; while (step * view.s > 120) step /= 5; const big = step * 5;
      const tl = toW([0, 0]), br = toW([W, H]);
      for (const [st, col] of (CAD.dark ? [[step, '#283039'], [big, '#323b47']] : [[step, '#eef1f6'], [big, '#e0e5ee']])) { c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); for (let x = Math.floor(tl[0] / st) * st; x <= br[0]; x += st) { const q = toScr([x, 0]); c.moveTo(Math.round(q[0]) + .5, 0); c.lineTo(Math.round(q[0]) + .5, H); } for (let y = Math.floor(br[1] / st) * st; y <= tl[1]; y += st) { const q = toScr([0, y]); c.moveTo(0, Math.round(q[1]) + .5); c.lineTo(W, Math.round(q[1]) + .5); } c.stroke(); } }
    const o = toScr([0, 0]); c.strokeStyle = 'rgba(223,81,121,.35)'; c.beginPath(); c.moveTo(o[0], o[1]); c.lineTo(o[0] + 40, o[1]); c.stroke(); c.strokeStyle = 'rgba(31,158,133,.45)'; c.beginPath(); c.moveTo(o[0], o[1]); c.lineTo(o[0], o[1] - 40); c.stroke();
    const ents = D.entities.filter(visible);
    const lw = l => Math.max(1, (l.lw || 1));
    const dashOf = l => l.ltype === 'dashed' ? [8, 5] : l.ltype === 'dotted' ? [2, 4] : l.ltype === 'dashdot' ? [10, 4, 2, 4] : [];
    // stanze sotto
    ents.filter(e => e.type === 'room').forEach(e => strokeEnt(c, e, dc(e.color || layerOf(e.layer).color), 1));
    drawWalls(c, ents.filter(e => e.type === 'wall'), w => { const s = sel.has(w.id), h = hover === w.id; return { stroke: s ? '#4da3ff' : w.ai ? '#f59e0b' : dc(w.color || layerOf(w.layer).color), fill: s ? (CAD.dark ? '#24486f' : '#dbe6ff') : w.ai ? (CAD.dark ? '#5a4220' : '#fff3e0') : (CAD.dark ? '#4a5363' : '#c9d0db'), hatch: s ? '#9db6f0' : (CAD.dark ? '#6b7686' : '#9aa5b5'), lw: h ? 1.6 : 1.1 }; });
    ents.forEach(e => { if (e.type === 'room' || e.type === 'wall') return; const l = layerOf(e.layer); const s = sel.has(e.id); strokeEnt(c, e, s ? '#4da3ff' : e.ai ? '#f59e0b' : dc(e.color || l.color), s ? 2 : (hover === e.id ? lw(l) + 1 : lw(l)), dashOf(l)); });
    // marcatura AI
    ents.filter(e => e.ai).forEach(e => { const b = bboxOf(e); if (!b) return; const p = toScr([b[2], b[3]]); if (e.type === 'room' || e.type === 'wall' && view.s < 30) return; });
    const aiN = ents.filter(e => e.ai).length;
    // selezione e maniglie
    D.entities.filter(e => sel.has(e.id)).forEach(e => { if (e.type === 'room') strokeEnt(c, e, '#3d6fe0', 2); keyPts(e).filter(k => k.k === 'end' || k.k === 'cen' || k.k === 'ins').slice(0, 40).forEach(k => { const q = toScr(k.p); c.fillStyle = '#3d6fe0'; c.fillRect(q[0] - 3, q[1] - 3, 6, 6); }); });
    // evidenziazioni conformità
    highlights.forEach(hl => { const e = D.entities.find(x => x.id === hl.id); if (!e) return; const b = bboxOf(e); if (!b) return; const p0 = toScr([b[0], b[3]]), p1 = toScr([b[2], b[1]]); c.strokeStyle = hl.color; c.lineWidth = 3; c.setLineDash([6, 4]); c.strokeRect(p0[0] - 6, p0[1] - 6, p1[0] - p0[0] + 12, p1[1] - p0[1] + 12); c.setLineDash([]); c.fillStyle = hl.color; c.font = '600 11px Helvetica'; c.fillText(hl.label || '', p0[0] - 6, p0[1] - 10); });
    // commenti
    // (commenti rimossi)
    // anteprima comando
    preview.forEach(e => strokeEnt(c, e, '#3d6fe0', 1.3, [5, 4]));
    if (active && active.base && cursor) { const a = toScr(active.base), b = toScr(cursor); c.strokeStyle = 'rgba(61,111,224,.35)'; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.setLineDash([]);
      if (settings.dyn) { const d = G.dist(active.base, cursor), ang = Math.atan2(cursor[1] - active.base[1], cursor[0] - active.base[0]) * 180 / Math.PI; const txt = `${App.fnum(d)}  <${App.fnum((ang + 360) % 360, 1)}°`; c.font = '11px ' + getComputedStyle(document.body).fontFamily; const w = c.measureText(txt).width; c.fillStyle = 'rgba(26,32,48,.85)'; c.fillRect(cursorScr[0] + 14, cursorScr[1] + 14, w + 12, 18); c.fillStyle = '#fff'; c.fillText(txt, cursorScr[0] + 20, cursorScr[1] + 27); } }
    // finestra di selezione
    if (dragSel) { const [a, b] = [dragSel.a, dragSel.b]; const cross = b[0] < a[0]; c.fillStyle = cross ? 'rgba(31,158,133,.08)' : 'rgba(61,111,224,.08)'; c.strokeStyle = cross ? '#1f9e85' : '#3d6fe0'; c.setLineDash(cross ? [5, 4] : []); c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.setLineDash([]); }
    // marcatore snap
    if (snap) { const q = toScr(snap.p); c.strokeStyle = '#ee7a3f'; c.lineWidth = 2; c.beginPath();
      if (snap.k === 'end') c.rect(q[0] - 6, q[1] - 6, 12, 12); else if (snap.k === 'mid') { c.moveTo(q[0], q[1] - 7); c.lineTo(q[0] + 7, q[1] + 5); c.lineTo(q[0] - 7, q[1] + 5); c.closePath(); } else if (snap.k === 'cen') c.arc(q[0], q[1], 6, 0, 7); else if (snap.k === 'int') { c.moveTo(q[0] - 6, q[1] - 6); c.lineTo(q[0] + 6, q[1] + 6); c.moveTo(q[0] + 6, q[1] - 6); c.lineTo(q[0] - 6, q[1] + 6); } else if (snap.k === 'quad') { c.moveTo(q[0], q[1] - 7); c.lineTo(q[0] + 7, q[1]); c.lineTo(q[0], q[1] + 7); c.lineTo(q[0] - 7, q[1]); c.closePath(); } else if (snap.k === 'perp') { c.moveTo(q[0] - 6, q[1] + 6); c.lineTo(q[0] + 6, q[1] + 6); c.moveTo(q[0] - 6, q[1] + 6); c.lineTo(q[0] - 6, q[1] - 6); } else { c.moveTo(q[0] - 6, q[1] - 6); c.lineTo(q[0] + 6, q[1] + 6); c.lineTo(q[0] - 6, q[1] + 6); c.lineTo(q[0] + 6, q[1] - 6); }
      c.stroke(); c.fillStyle = '#ee7a3f'; c.font = '10px Helvetica'; c.fillText({ end: 'Estremo', mid: 'Medio', cen: 'Centro', int: 'Intersezione', quad: 'Quadrante', perp: 'Perpendicolare', near: 'Vicino', ins: 'Inserimento', grid: 'Griglia' }[snap.k] || '', q[0] + 10, q[1] - 10); }
    // cursori remoti
    Object.values(remote).forEach(r => { if (Date.now() - r.at > 8000) return; const q = toScr(r.p); c.fillStyle = r.color; c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(q[0] + 10, q[1] + 12); c.lineTo(q[0] + 3, q[1] + 11); c.lineTo(q[0], q[1] + 16); c.closePath(); c.fill(); c.font = '11px Helvetica'; const w = c.measureText(r.name).width; c.fillRect(q[0] + 10, q[1] + 14, w + 10, 16); c.fillStyle = '#fff'; c.fillText(r.name, q[0] + 15, q[1] + 26); });
    // mirino
    if (cursorScr && !panning) { c.strokeStyle = CAD.dark ? 'rgba(232,236,242,.85)' : 'rgba(20,33,61,.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(cursorScr[0] - 14, cursorScr[1] + .5); c.lineTo(cursorScr[0] + 14, cursorScr[1] + .5); c.moveTo(cursorScr[0] + .5, cursorScr[1] - 14); c.lineTo(cursorScr[0] + .5, cursorScr[1] + 14); c.stroke(); if (!active) c.strokeRect(cursorScr[0] - 4, cursorScr[1] - 4, 8, 8); }
    // banner AI
    const ai = $('#aiBanner'); if (ai) { ai.classList.toggle('hidden', !aiN); ai.querySelector('b').textContent = aiN; }
  }
  CAD.draw = () => draw();

  /* ---------- snap ---------- */
  function computeSnap(p, base) {
    const tol = 12 / view.s; let best = null;
    if (settings.osnap) {
      const cand = [];
      const near = D.entities.filter(e => visible(e)).filter(e => { const b = bboxOf(e); return b && p[0] > b[0] - tol * 3 && p[0] < b[2] + tol * 3 && p[1] > b[1] - tol * 3 && p[1] < b[3] + tol * 3; });
      near.forEach(e => keyPts(e).forEach(k => cand.push(k)));
      // intersezioni
      const segs = near.flatMap(e => e.type === 'insert' || e.type === 'circle' || e.type === 'arc' ? [] : segsOf(e)).filter(s => G.segDist(p, s[0], s[1]) < tol * 2);
      for (let i = 0; i < segs.length && i < 60; i++) for (let j = i + 1; j < segs.length && j < 60; j++) { const r = G.segInt(segs[i][0], segs[i][1], segs[j][0], segs[j][1]); if (r) cand.push({ p: r.p, k: 'int' }); }
      if (base) segs.forEach(s => { const t = G.projT(base, s[0], s[1]); if (t > 0 && t < 1) cand.push({ p: G.lerp(s[0], s[1], t), k: 'perp' }); });
      cand.forEach(k => { const d = G.dist(p, k.p); if (d < tol && (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) < 1e-9 && k.k === 'end'))) best = { ...k, d }; });
    }
    return best;
  }
  function constrain(p, base) {
    if (!base) return p;
    if (settings.ortho) { const dx = p[0] - base[0], dy = p[1] - base[1]; return Math.abs(dx) > Math.abs(dy) ? [p[0], base[1]] : [base[0], p[1]]; }
    if (settings.polar) { const d = G.dist(p, base), a = Math.atan2(p[1] - base[1], p[0] - base[0]); const st = Math.PI / 12; const ra = Math.round(a / st) * st; if (Math.abs(ra - a) < .05) return [base[0] + d * Math.cos(ra), base[1] + d * Math.sin(ra)]; }
    return p;
  }
  function pointer(scr) {
    let p = toW(scr); const base = active && active.base;
    snap = computeSnap(p, base);
    if (snap) p = snap.p; else { p = constrain(p, base); if (settings.snap) { const st = settings.gridStep / 10; p = [Math.round(p[0] / st) * st, Math.round(p[1] / st) * st]; } }
    return p;
  }

  /* ---------- input asincrono comandi ---------- */
  let waiter = null; // {kind:'point'|'number'|'text'|'select'|'entity', resolve, reject, base}
  function ask(kind, prompt, opt = {}) {
    setPrompt(prompt + (opt.def !== undefined ? ` <${opt.def}>` : '') + (opt.options ? ` [${opt.options.join('/')}]` : ''));
    if (active) active.base = opt.base || null;
    return new Promise((resolve, reject) => { waiter = { kind, resolve, reject, ...opt }; draw(); });
  }
  const getPoint = (pr, base, opt = {}) => ask('point', pr, { base, ...opt });
  const getNumber = (pr, def, base) => ask('number', pr, { def, base });
  const getText = (pr, def) => ask('text', pr, { def });
  const getEntity = (pr, filter) => ask('entity', pr, { filter });
  async function getSelection(pr = 'Seleziona oggetti e premi Invio') { if (sel.size) return [...sel]; await ask('select', pr); return [...sel]; }
  function feed(v) { if (!waiter) return false; const w = waiter; waiter = null; w.resolve(v); return true; }
  function cancelWait() { if (waiter) { const w = waiter; waiter = null; w.reject(CANCEL); } }
  function setPrompt(t) { const e = $('#cmdPrompt'); if (e) e.textContent = t; }
  function log(t, cls) { const h = $('#cmdHist'); if (!h) return; const d = document.createElement('div'); d.textContent = t; if (cls) d.className = cls; h.appendChild(d); h.scrollTop = 1e9; while (h.children.length > 200) h.firstChild.remove(); }
  CAD.log = log;
  function parseCoord(s, base) {
    s = s.trim().replace(/\s+/g, ''); if (!s) return null;
    const num = v => Number(v.replace(',', '.'));
    let m;
    if ((m = s.match(/^@(-?[\d.]+)<(-?[\d.]+)$/))) { const b = base || [0, 0]; const d = num(m[1]), a = num(m[2]) * Math.PI / 180; return [b[0] + d * Math.cos(a), b[1] + d * Math.sin(a)]; }
    if ((m = s.match(/^(-?[\d.]+)<(-?[\d.]+)$/))) { const d = num(m[1]), a = num(m[2]) * Math.PI / 180; return [d * Math.cos(a), d * Math.sin(a)]; }
    if ((m = s.match(/^@(-?[\d.]+)[;,](-?[\d.]+)$/))) { const b = base || [0, 0]; return [b[0] + num(m[1]), b[1] + num(m[2])]; }
    if ((m = s.match(/^(-?[\d.]+)[;,](-?[\d.]+)$/))) return [num(m[1]), num(m[2])];
    if ((m = s.match(/^-?[\d.]+$/)) && base) { const d = num(s); const dir = G.norm(G.sub(constrain(cursor, base), base)); return G.add(base, G.mul(dir[0] || dir[1] ? dir : [1, 0], d)); }
    return null;
  }

  /* ---------- modifiche, undo, collaborazione ---------- */
  const snapshot = () => JSON.stringify(D.entities);
  function begin() { if (!baseline) baseline = snapshot(); }
  function diff(before) {
    const bm = new Map(before.map(e => [e.id, e])), am = new Map(D.entities.map(e => [e.id, e]));
    const changes = [];
    am.forEach((e, id) => { const b = bm.get(id); if (!b) changes.push({ id, before: null, after: App.clone(e) }); else if (JSON.stringify(b) !== JSON.stringify(e)) changes.push({ id, before: b, after: App.clone(e) }); });
    bm.forEach((e, id) => { if (!am.has(id)) changes.push({ id, before: e, after: null }); });
    return changes;
  }
  function commit(label) {
    const bs = baseline; baseline = null; if (!bs) return;
    if (snapshot() === bs) return;
    undo.push({ label, data: bs }); if (undo.length > 300) undo.shift(); redo = [];
    const changes = diff(JSON.parse(bs));
    App.collab && App.collab.record(App.project(), label, changes);
    App.touch(); updatePanels(); draw();
  }
  CAD.begin = begin; CAD.commit = commit;
  function applyState(data, label) { const before = JSON.parse(snapshot()); D.entities = JSON.parse(data); sel.clear(); const ch = diff(before); App.collab && App.collab.record(App.project(), label, ch); App.touch(); updatePanels(); draw(); }
  function doUndo() { const u = undo.pop(); if (!u) { log('Niente da annullare'); return; } const cur = snapshot(); applyState(u.data, 'Annulla: ' + u.label); redo.push({ label: u.label, data: cur }); log('Annullato: ' + u.label); }
  function doRedo() { const r = redo.pop(); if (!r) { log('Niente da ripetere'); return; } const cur = snapshot(); applyState(r.data, 'Ripeti: ' + r.label); undo.push({ label: r.label, data: cur }); log('Ripetuto: ' + r.label); }
  CAD.undo = () => doUndo();
  const add = e => { e.id = e.id || App.uid(); e.layer = e.layer || D.current; if (App.user) e.author = App.user.id; D.entities.push(e); return e; };
  CAD.add = e => { begin(); add(e); };
  const byId = id => D.entities.find(e => e.id === id);
  const delIds = ids => { const set = new Set(ids); D.entities.filter(e => (e.type === 'door' || e.type === 'window') && set.has(e.wall)).forEach(e => set.add(e.id)); D.entities = D.entities.filter(e => !set.has(e.id)); set.forEach(i => sel.delete(i)); };
  function resolveDims() { D.entities.forEach(e => { if (e.type !== 'dim' || !e.assoc) return; ['p1', 'p2'].forEach((k, i) => { const a = e.assoc[k]; if (!a) return; const t = byId(a.id); if (!t) { delete e.assoc[k]; return; } const kp = keyPts(t).find(q => q.ref === a.ref); if (kp) { e['x' + (i + 1)] = kp.p[0]; e['y' + (i + 1)] = kp.p[1]; } }); }); }
  function transformSel(ids, T, s = 1, r = 0, mirror = false, copy = false) {
    const set = new Set(ids); const map = {};
    const out = [];
    ids.forEach(id => { const e = byId(id); if (!e || !editable(e)) return; if ((e.type === 'door' || e.type === 'window') && set.has(e.wall)) return;
      if (e.type === 'door' || e.type === 'window') { if (copy) return; if (mirror) e.flip = !e.flip; return; }
      const n = xformEnt(e, T, s, r, mirror); if (e.type === 'wall') n.thk = e.thk; if (e.type === 'room' && e.label) n.label = T(e.label);
      if (copy) { n.id = App.uid(); map[e.id] = n.id; delete n.ai; add(n); out.push(n.id); } else { Object.assign(e, n); out.push(e.id); } });
    // aperture dei muri trasformati
    ids.forEach(id => { const w = byId(id); if (!w || w.type !== 'wall') return; D.entities.filter(o => (o.type === 'door' || o.type === 'window') && o.wall === id).forEach(o => { if (copy) { const n = Object.assign({}, o, { id: App.uid(), wall: map[id] }); add(n); out.push(n.id); } else if (mirror) o.side = -(o.side || 1); }); });
    resolveDims(); return out;
  }

  /* ---------- comandi ---------- */
  const C = {};
  const cmdDef = (name, aliases, desc, fn, group = 'Disegno') => { C[name] = { name, aliases, desc, fn, group }; };
  cmdDef('LINEA', ['L', 'LINE'], 'Disegna segmenti di linea', async () => { let a = await getPoint('Primo punto'); for (;;) { active.preview = c => [{ type: 'line', x1: a[0], y1: a[1], x2: c[0], y2: c[1] }]; const b = await getPoint('Punto successivo (Invio per terminare)', a, { allowEnd: true }); if (!b) break; begin(); add({ type: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); commit('Linea'); a = b; } });
  cmdDef('POLILINEA', ['PL', 'PLINE'], 'Polilinea (C per chiudere)', async () => { const pts = [await getPoint('Punto iniziale')]; for (;;) { active.preview = c => [{ type: 'pline', pts: [...pts, c] }]; const b = await getPoint('Punto successivo [C=Chiudi, Invio=fine]', pts[pts.length - 1], { allowEnd: true, keywords: ['C'] }); if (!b || b === 'C') { if (pts.length > 1) { begin(); add({ type: 'pline', pts, closed: b === 'C' }); commit('Polilinea'); } break; } pts.push(b); } });
  cmdDef('RETTANGOLO', ['REC', 'RECT', 'RECTANG'], 'Rettangolo da due angoli (o @L,H)', async () => { const a = await getPoint('Primo angolo'); active.preview = c => [{ type: 'pline', pts: [a, [c[0], a[1]], c, [a[0], c[1]]], closed: true }]; const b = await getPoint('Angolo opposto (es. @5,4)', a); begin(); add({ type: 'pline', pts: [a, [b[0], a[1]], b, [a[0], b[1]]], closed: true }); commit('Rettangolo'); });
  cmdDef('CERCHIO', ['C', 'CIRCLE'], 'Cerchio centro-raggio', async () => { const c = await getPoint('Centro'); active.preview = p => [{ type: 'circle', cx: c[0], cy: c[1], r: G.dist(c, p) }]; const r = await getNumber('Raggio (valore o punto)', undefined, c); begin(); add({ type: 'circle', cx: c[0], cy: c[1], r }); commit('Cerchio'); });
  cmdDef('ARCO', ['A', 'ARC'], 'Arco per tre punti', async () => { const a = await getPoint('Punto iniziale'); const b = await getPoint('Secondo punto', a); active.preview = p => { const ar = arc3(a, b, p); return ar ? [ar] : []; }; const c = await getPoint('Punto finale', b); const ar = arc3(a, b, c); if (!ar) { log('Punti allineati: arco non definito', 'err'); return; } begin(); add(ar); commit('Arco'); });
  function arc3(a, b, c) { const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-12) return null; const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d, uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d; const r = G.dist([ux, uy], a); let a1 = Math.atan2(a[1] - uy, a[0] - ux), a3 = Math.atan2(c[1] - uy, c[0] - ux); const ccw = G.cross(G.sub(b, a), G.sub(c, b)) > 0; if (!ccw) [a1, a3] = [a3, a1]; return { type: 'arc', cx: ux, cy: uy, r, a1, a2: a3 }; }
  cmdDef('TESTO', ['T', 'TEXT', 'DT'], 'Testo su riga singola', async () => { const p = await getPoint('Punto di inserimento'); const h = await getNumber('Altezza testo', 0.3); const t = await getText('Testo'); if (!t) return; begin(); add({ type: 'text', x: p[0], y: p[1], h, text: t, rot: 0, layer: D.current === '0' && layerOf('TESTI') ? 'TESTI' : D.current }); commit('Testo'); }, 'Annotazioni');
  cmdDef('QUOTA', ['QU', 'DIM', 'DIMALIGNED'], 'Quota allineata associativa', async () => { const a = await getPoint('Origine prima linea di estensione'); const s1 = snap && snap.ref && nearestOwner(a, snap.ref); const b = await getPoint('Origine seconda linea di estensione', a); const s2 = snap && snap.ref && nearestOwner(b, snap.ref); active.preview = c => { const n = G.perp(G.norm(G.sub(b, a))); return [{ type: 'dim', x1: a[0], y1: a[1], x2: b[0], y2: b[1], off: G.dot(G.sub(c, a), n) }]; }; const c = await getPoint('Posizione linea di quota', b); const n = G.perp(G.norm(G.sub(b, a))); begin(); add({ type: 'dim', x1: a[0], y1: a[1], x2: b[0], y2: b[1], off: G.dot(G.sub(c, a), n), layer: layerOf('QUOTE') ? 'QUOTE' : D.current, assoc: { p1: s1, p2: s2 } }); commit('Quota'); }, 'Annotazioni');
  function nearestOwner(p, ref) { for (const e of D.entities) { const k = keyPts(e).find(q => q.ref === ref && G.dist(q.p, p) < 1e-6); if (k) return { id: e.id, ref }; } return null; }
  cmdDef('MURO', ['MU', 'WALL'], 'Muro parametrico (spessore, altezza)', async () => { const thk = await getNumber('Spessore muro (m)', CAD.lastThk || 0.3); CAD.lastThk = thk; const h = await getNumber('Altezza (m)', CAD.lastH || 3.0); CAD.lastH = h; let a = await getPoint('Punto iniziale asse'); for (;;) { active.preview = c => [{ type: 'pline', pts: wallPts({ x1: a[0], y1: a[1], x2: c[0], y2: c[1], thk }), closed: true }]; const b = await getPoint('Punto successivo (Invio per terminare)', a, { allowEnd: true }); if (!b) break; begin(); add({ type: 'wall', x1: a[0], y1: a[1], x2: b[0], y2: b[1], thk, h, layer: 'MURI', material: 'Laterizio' }); commit('Muro'); a = b; } }, 'Architettura');
  async function placeOpening(kind) {
    const width = await getNumber(kind === 'door' ? 'Larghezza porta (m)' : 'Larghezza finestra (m)', kind === 'door' ? 0.9 : 1.2);
    for (;;) { active.preview = c => { const w = nearestWall(c); if (!w) return []; const t = G.projT(c, [w.x1, w.y1], [w.x2, w.y2]); const p = G.lerp([w.x1, w.y1], [w.x2, w.y2], t); const d = G.norm([w.x2 - w.x1, w.y2 - w.y1]); return [{ type: 'line', x1: p[0] - d[0] * width / 2, y1: p[1] - d[1] * width / 2, x2: p[0] + d[0] * width / 2, y2: p[1] + d[1] * width / 2 }]; };
      const p = await getPoint('Punto sul muro (Invio per terminare)', null, { allowEnd: true, raw: true }); if (!p) break;
      const w = nearestWall(p); if (!w) { log('Nessun muro vicino', 'err'); continue; }
      const L = G.dist([w.x1, w.y1], [w.x2, w.y2]); let t = G.projT(p, [w.x1, w.y1], [w.x2, w.y2]); t = Math.max(width / 2 / L, Math.min(1 - width / 2 / L, t));
      const n = G.perp(G.norm([w.x2 - w.x1, w.y2 - w.y1])); const side = G.dot(G.sub(p, G.lerp([w.x1, w.y1], [w.x2, w.y2], t)), n) >= 0 ? 1 : -1;
      begin(); add({ type: kind, wall: w.id, t, width, side, flip: false, layer: 'APERTURE', h: kind === 'door' ? 2.1 : 1.4, sill: kind === 'door' ? 0 : 0.9 }); commit(kind === 'door' ? 'Porta' : 'Finestra'); }
  }
  function nearestWall(p) { let best = null, bd = Infinity; D.entities.forEach(e => { if (e.type !== 'wall' || !visible(e)) return; const d = G.segDist(p, [e.x1, e.y1], [e.x2, e.y2]); if (d < bd) { bd = d; best = e; } }); return bd < Math.max(1, 30 / view.s) ? best : null; }
  cmdDef('PORTA', ['PO', 'DOOR'], 'Inserisce porta nel muro', () => placeOpening('door'), 'Architettura');
  cmdDef('FINESTRA', ['FI', 'WINDOW'], 'Inserisce finestra nel muro', () => placeOpening('window'), 'Architettura');
  cmdDef('STANZA', ['ST', 'ROOM'], 'Stanza per punti o R=rettangolo', async () => { const first = await getPoint('Primo vertice [R=rettangolo]', null, { keywords: ['R'] }); let pts;
      if (first === 'R') { const a = await getPoint('Primo angolo'); active.preview = c => [{ type: 'pline', pts: [a, [c[0], a[1]], c, [a[0], c[1]]], closed: true }]; const b = await getPoint('Angolo opposto', a); pts = [a, [b[0], a[1]], b, [a[0], b[1]]]; }
      else { pts = [first]; for (;;) { active.preview = c => [{ type: 'pline', pts: [...pts, c], closed: true }]; const b = await getPoint('Vertice successivo (Invio per chiudere)', pts[pts.length - 1], { allowEnd: true }); if (!b) break; pts.push(b); } }
      if (pts.length < 3) return; const name = await getText('Nome stanza', 'Stanza'); begin(); add({ type: 'room', pts, name, rtype: CAD.ROOMTYPES.find(t => name.toLowerCase().startsWith(t.toLowerCase().split(' ')[0])) || 'Altro', h: 2.7, layer: 'STANZE', floor: 'Gres' }); commit('Stanza'); }, 'Architettura');
  cmdDef('INSERISCI', ['I', 'INSERT', 'BLOCCO'], 'Inserisce un blocco di libreria', async () => { const names = [...Object.keys(CAD.LIB), ...Object.keys(D.blocks || {})]; const n = await getText('Nome blocco [' + names.slice(0, 6).join(', ') + '…]', CAD.lastBlock || names[0]); const name = names.find(x => x.toLowerCase() === n.toLowerCase()) || names.find(x => x.toLowerCase().includes(n.toLowerCase())); if (!name) { log('Blocco non trovato', 'err'); return; } CAD.lastBlock = name; await insertBlock(name); }, 'Architettura');
  async function insertBlock(name) { active.preview = c => blockEnts({ type: 'insert', name, x: c[0], y: c[1], rot: 0, scale: 1 }); const p = await getPoint('Punto di inserimento'); active.preview = c => blockEnts({ type: 'insert', name, x: p[0], y: p[1], rot: Math.atan2(c[1] - p[1], c[0] - p[0]), scale: 1 }); const r = await getNumber('Rotazione (gradi o punto)', 0, p); begin(); add({ type: 'insert', name, x: p[0], y: p[1], rot: typeof r === 'number' ? r * Math.PI / 180 : 0, scale: 1, layer: 'ARREDI', attrs: { codice: '', fornitore: '' } }); commit('Inserisci ' + name); }
  CAD.insertBlock = name => run('INSERISCI', () => insertBlock(name));
  cmdDef('CREABLOCCO', ['B', 'BLOCK'], 'Crea blocco dalla selezione', async () => { const ids = await getSelection(); if (!ids.length) return; const name = await getText('Nome blocco'); if (!name) return; const p = await getPoint('Punto base'); const ents = ids.map(byId).filter(Boolean).filter(e => !['door', 'window', 'wall', 'room'].includes(e.type)).map(e => { const n = xformEnt(e, q => [q[0] - p[0], q[1] - p[1]]); delete n.id; delete n.layer; return n; }); D.blocks = D.blocks || {}; D.blocks[name] = { ents }; begin(); delIds(ids.filter(id => byId(id) && !['door', 'window', 'wall', 'room'].includes(byId(id).type))); add({ type: 'insert', name, x: p[0], y: p[1], rot: 0, scale: 1 }); commit('Crea blocco ' + name); updatePanels(); }, 'Architettura');
  cmdDef('SPOSTA', ['M', 'MOVE'], 'Sposta oggetti', async () => { const ids = await getSelection(); if (!ids.length) return; const a = await getPoint('Punto base'); active.preview = c => ids.map(byId).filter(Boolean).filter(e => e.type !== 'door' && e.type !== 'window').map(e => xformEnt(e, q => [q[0] + c[0] - a[0], q[1] + c[1] - a[1]])); const b = await getPoint('Secondo punto', a); begin(); transformSel(ids, q => [q[0] + b[0] - a[0], q[1] + b[1] - a[1]]); commit('Sposta'); }, 'Modifica');
  cmdDef('COPIA', ['CO', 'CP', 'COPY'], 'Copia oggetti (multipla)', async () => { const ids = await getSelection(); if (!ids.length) return; const a = await getPoint('Punto base'); for (;;) { active.preview = c => ids.map(byId).filter(Boolean).filter(e => e.type !== 'door' && e.type !== 'window').map(e => xformEnt(e, q => [q[0] + c[0] - a[0], q[1] + c[1] - a[1]])); const b = await getPoint('Secondo punto (Invio per terminare)', a, { allowEnd: true }); if (!b) break; begin(); transformSel(ids, q => [q[0] + b[0] - a[0], q[1] + b[1] - a[1]], 1, 0, false, true); commit('Copia'); } }, 'Modifica');
  cmdDef('RUOTA', ['RO', 'ROTATE'], 'Ruota oggetti', async () => { const ids = await getSelection(); if (!ids.length) return; const c = await getPoint('Punto base'); active.preview = p => { const a = Math.atan2(p[1] - c[1], p[0] - c[0]); return ids.map(byId).filter(Boolean).filter(e => e.type !== 'door' && e.type !== 'window').map(e => xformEnt(e, q => G.rot(q, c, a), 1, a)); }; const r = await getNumber('Angolo (gradi o punto)', 90, c); const a = r * Math.PI / 180; begin(); transformSel(ids, q => G.rot(q, c, a), 1, a); commit('Ruota'); }, 'Modifica');
  cmdDef('SPECCHIO', ['MI', 'MIRROR'], 'Specchia oggetti', async () => { const ids = await getSelection(); if (!ids.length) return; const a = await getPoint('Primo punto asse'); active.preview = p => G.dist(a, p) < 1e-9 ? [] : ids.map(byId).filter(Boolean).filter(e => e.type !== 'door' && e.type !== 'window').map(e => xformEnt(e, q => G.mirror(q, a, p), 1, 0, true)); const b = await getPoint('Secondo punto asse', a); const keep = await getText('Mantenere originali? [S/N]', 'N'); const ang = 2 * Math.atan2(b[1] - a[1], b[0] - a[0]); begin(); transformSel(ids, q => G.mirror(q, a, b), 1, ang, true, /^s/i.test(keep)); commit('Specchia'); }, 'Modifica');
  cmdDef('SCALA', ['SC', 'SCALE'], 'Scala oggetti', async () => { const ids = await getSelection(); if (!ids.length) return; const c = await getPoint('Punto base'); const s = await getNumber('Fattore di scala', 2); begin(); transformSel(ids, q => [c[0] + (q[0] - c[0]) * s, c[1] + (q[1] - c[1]) * s], s); ids.forEach(id => { const e = byId(id); if (e && e.type === 'wall') e.thk *= s; }); commit('Scala'); }, 'Modifica');
  cmdDef('OFFSET', ['O', 'OF'], 'Copia parallela', async () => { const d = await getNumber('Distanza di offset', CAD.lastOff || 1); CAD.lastOff = d; for (;;) { const e = await getEntity('Oggetto da copiare in parallelo (Invio per terminare)', x => ['line', 'pline', 'circle', 'arc', 'wall', 'room'].includes(x.type)); if (!e) break; const p = await getPoint('Lato di offset'); begin(); const n = offsetEnt(e, d, p); if (n) add(n); commit('Offset'); } }, 'Modifica');
  function offsetEnt(e, d, side) {
    if (e.type === 'line' || e.type === 'wall') { const a = [e.x1, e.y1], b = [e.x2, e.y2]; const n = G.perp(G.norm(G.sub(b, a))); const s = G.dot(G.sub(side, a), n) >= 0 ? 1 : -1; const o = { ...e, id: undefined, x1: a[0] + n[0] * d * s, y1: a[1] + n[1] * d * s, x2: b[0] + n[0] * d * s, y2: b[1] + n[1] * d * s }; delete o.id; return o; }
    if (e.type === 'circle' || e.type === 'arc') { const s = G.dist(side, [e.cx, e.cy]) > e.r ? 1 : -1; const o = { ...e, r: Math.max(1e-3, e.r + d * s) }; delete o.id; return o; }
    if (e.pts) { const closed = e.closed || e.type !== 'pline'; const t1 = G.offsetPolyline(e.pts, d, closed), t2 = G.offsetPolyline(e.pts, -d, closed); const dist = pts => Math.min(...pts.map((p, i) => i < pts.length - 1 || closed ? G.segDist(side, p, pts[(i + 1) % pts.length]) : Infinity)); const o = { ...e, pts: dist(t1) < dist(t2) ? t1 : t2 }; delete o.id; if (o.type === 'room') { o.type = 'pline'; o.closed = true; } return o; }
    return null;
  }
  cmdDef('TAGLIA', ['TR', 'TRIM'], 'Taglia linee ai bordi di intersezione', async () => { for (;;) { const e = await getEntity('Parte di linea da tagliare (Invio per terminare)', x => x.type === 'line'); if (!e) break; const p = waiter_last; const a = [e.x1, e.y1], b = [e.x2, e.y2]; const ts = []; D.entities.forEach(o => { if (o === e || !visible(o)) return; segsOf(o).forEach(s => { const r = G.segInt(a, b, s[0], s[1]); if (r && r.t > 1e-6 && r.t < 1 - 1e-6) ts.push(r.t); }); }); if (!ts.length) { log('Nessun bordo di taglio'); continue; } const tp = G.projT(p, a, b); const lo = Math.max(0, ...ts.filter(t => t < tp)), hi = Math.min(1, ...ts.filter(t => t > tp)); begin(); const parts = []; if (lo > 1e-6) parts.push([0, lo]); if (hi < 1 - 1e-6) parts.push([hi, 1]); delIds([e.id]); parts.forEach(([t0, t1]) => { const p0 = G.lerp(a, b, t0), p1 = G.lerp(a, b, t1); add({ ...e, id: undefined, x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1] }); }); commit('Taglia'); } }, 'Modifica');
  let waiter_last = null;
  cmdDef('ESTENDI', ['EX', 'EXTEND'], 'Estende linee fino al bordo più vicino', async () => { for (;;) { const e = await getEntity('Estremità di linea da estendere (Invio per terminare)', x => x.type === 'line'); if (!e) break; const p = waiter_last; let a = [e.x1, e.y1], b = [e.x2, e.y2]; const endB = G.dist(p, b) < G.dist(p, a); if (!endB) [a, b] = [b, a]; let best = null; D.entities.forEach(o => { if (o === e || !visible(o)) return; segsOf(o).forEach(s => { const r = G.lineInt(a, b, s[0], s[1]); if (r && r.t > 1 + 1e-6 && r.u >= -1e-9 && r.u <= 1 + 1e-9 && (!best || r.t < best.t)) best = r; }); }); if (!best) { log('Nessun bordo raggiungibile'); continue; } begin(); if (endB) { e.x2 = best.p[0]; e.y2 = best.p[1]; } else { e.x1 = best.p[0]; e.y1 = best.p[1]; } commit('Estendi'); } }, 'Modifica');
  cmdDef('RACCORDO', ['F', 'FILLET'], 'Raccorda due linee (raggio)', async () => { const r = await getNumber('Raggio di raccordo', CAD.lastFillet ?? 0); CAD.lastFillet = r; const e1 = await getEntity('Prima linea', x => x.type === 'line'); const p1 = waiter_last; const e2 = await getEntity('Seconda linea', x => x.type === 'line' && x !== e1); const p2 = waiter_last; if (!e1 || !e2) return; const I = G.lineInt([e1.x1, e1.y1], [e1.x2, e1.y2], [e2.x1, e2.y1], [e2.x2, e2.y2]); if (!I) { log('Linee parallele', 'err'); return; } const X = I.p;
      const far = (e, p) => { const a = [e.x1, e.y1], b = [e.x2, e.y2]; const tp = G.projT(p, a, b), ti = G.projT(X, a, b); return tp < ti ? a : b; }; const f1 = far(e1, p1), f2 = far(e2, p2);
      begin(); if (r <= 0) { Object.assign(e1, { x1: f1[0], y1: f1[1], x2: X[0], y2: X[1] }); Object.assign(e2, { x1: f2[0], y1: f2[1], x2: X[0], y2: X[1] }); }
      else { const u1 = G.norm(G.sub(f1, X)), u2 = G.norm(G.sub(f2, X)); const ang = Math.acos(Math.max(-1, Math.min(1, G.dot(u1, u2)))); const tl = r / Math.tan(ang / 2); const t1 = G.add(X, G.mul(u1, tl)), t2 = G.add(X, G.mul(u2, tl)); const bis = G.norm(G.add(u1, u2)); const cen = G.add(X, G.mul(bis, r / Math.sin(ang / 2)));
        Object.assign(e1, { x1: f1[0], y1: f1[1], x2: t1[0], y2: t1[1] }); Object.assign(e2, { x1: f2[0], y1: f2[1], x2: t2[0], y2: t2[1] }); let a1 = Math.atan2(t1[1] - cen[1], t1[0] - cen[0]), a2 = Math.atan2(t2[1] - cen[1], t2[0] - cen[0]); let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; if (d < 0) [a1, a2] = [a2, a1]; add({ type: 'arc', cx: cen[0], cy: cen[1], r, a1, a2, layer: e1.layer }); }
      commit('Raccordo'); }, 'Modifica');
  cmdDef('CANCELLA', ['E', 'ERASE', 'DEL'], 'Cancella oggetti', async () => { const ids = await getSelection(); const ok = ids.filter(id => byId(id) && editable(byId(id))); if (!ok.length) return; begin(); delIds(ok); commit('Cancella'); log(ok.length + ' oggetti cancellati'); }, 'Modifica');
  cmdDef('ESPLODI', ['X', 'EXPLODE'], 'Esplode polilinee, blocchi, muri in linee', async () => { const ids = await getSelection(); begin(); ids.forEach(id => { const e = byId(id); if (!e || !editable(e)) return; let parts = []; if (e.type === 'insert') parts = blockEnts(e); else if (e.type === 'pline' || e.type === 'room' || e.type === 'wall') parts = segsOf(e).slice(e.type === 'wall' ? 1 : 0).map(s => ({ type: 'line', x1: s[0][0], y1: s[0][1], x2: s[1][0], y2: s[1][1] })); else return; delIds([id]); parts.forEach(p => add({ ...p, id: undefined, layer: e.layer })); }); commit('Esplodi'); }, 'Modifica');
  cmdDef('ANNULLA', ['U', 'UNDO'], 'Annulla ultima operazione', async () => doUndo(), 'Utilità');
  cmdDef('RIPETI', ['REDO', 'RY'], 'Ripeti operazione annullata', async () => doRedo(), 'Utilità');
  cmdDef('ZOOM', ['Z'], 'Zoom [E=estensioni, F=finestra, valore]', async () => { const o = await getText('Opzione [E=Estensioni/F=Finestra/fattore]', 'E'); if (/^e/i.test(o)) zoomExtents(); else if (/^f/i.test(o)) { const a = await getPoint('Primo angolo'); const b = await getPoint('Secondo angolo'); fitBox([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]); } else { const f = parseFloat(o.replace(',', '.')); if (f > 0) { view.s *= f; draw(); } } }, 'Vista');
  cmdDef('DISTANZA', ['DIS', 'DIST', 'DI'], 'Misura distanza e angolo', async () => { const a = await getPoint('Primo punto'); const b = await getPoint('Secondo punto', a); const d = G.dist(a, b); log(`Distanza = ${App.fnum(d, 3)} m · ΔX = ${App.fnum(b[0] - a[0], 3)} · ΔY = ${App.fnum(b[1] - a[1], 3)} · Angolo = ${App.fnum((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI + 360) % 360, 2)}°`, 'res'); }, 'Utilità');
  cmdDef('AREA', ['AA'], 'Area e perimetro (O=oggetto)', async () => { const f = await getPoint('Primo vertice [O=Oggetto]', null, { keywords: ['O'] }); let pts; if (f === 'O') { const e = await getEntity('Oggetto chiuso', x => x.pts || x.type === 'circle'); if (!e) return; if (e.type === 'circle') { log(`Area = ${App.fnum(Math.PI * e.r * e.r, 3)} m² · Circonferenza = ${App.fnum(2 * Math.PI * e.r, 3)} m`, 'res'); return; } pts = e.pts; } else { pts = [f]; for (;;) { active.preview = c => [{ type: 'pline', pts: [...pts, c], closed: true }]; const b = await getPoint('Vertice successivo (Invio per calcolare)', pts[pts.length - 1], { allowEnd: true }); if (!b) break; pts.push(b); } } log(`Area = ${App.fnum(Math.abs(G.area(pts)), 3)} m² · Perimetro = ${App.fnum(G.perimeter(pts), 3)} m`, 'res'); }, 'Utilità');
  cmdDef('LISTA', ['LI', 'LIST'], 'Elenca proprietà della selezione', async () => { const ids = await getSelection(); ids.map(byId).filter(Boolean).forEach(e => log(`${e.type.toUpperCase()} [${e.layer}] ` + JSON.stringify(e, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v).slice(0, 300), 'res')); }, 'Utilità');
  cmdDef('LAYER', ['LA'], 'Gestione layer (pannello)', async () => { showTab('layers'); }, 'Utilità');
  cmdDef('SELEZIONATUTTO', ['SA', 'SELECTALL'], 'Seleziona tutto', async () => { D.entities.filter(editable).forEach(e => sel.add(e.id)); updatePanels(); draw(); }, 'Utilità');
  cmdDef('GRIGLIA', ['GRID', 'F7'], 'Attiva/disattiva griglia', async () => toggle('grid'), 'Impostazioni');
  cmdDef('SNAP', ['SN', 'F9'], 'Attiva/disattiva snap a griglia', async () => toggle('snap'), 'Impostazioni');
  cmdDef('OSNAP', ['OS', 'F3'], 'Attiva/disattiva snap ad oggetto', async () => toggle('osnap'), 'Impostazioni');
  cmdDef('ORTO', ['ORTHO', 'F8'], 'Attiva/disattiva modalità ortogonale', async () => toggle('ortho'), 'Impostazioni');
  cmdDef('POLARE', ['POLAR', 'F10'], 'Tracking polare 15°', async () => toggle('polar'), 'Impostazioni');
  cmdDef('ESTRUDI', ['EST', 'EXTRUDE'], 'Estrude profilo chiuso in solido 3D', async () => { const e = await getEntity('Profilo chiuso (polilinea, cerchio, stanza)', x => (x.pts && (x.closed || x.type === 'room')) || x.type === 'circle'); if (!e) return; const h = await getNumber('Altezza di estrusione', 3); const z0 = await getNumber('Quota base', 0); const pts = e.type === 'circle' ? G.circlePts([e.cx, e.cy], e.r, 32) : e.pts.slice(); begin(); add({ type: 'solid', pts, z0, h, layer: 'SOLIDI', op: 'add' }); commit('Estrudi'); }, '3D');
  cmdDef('PARALLELEPIPEDO', ['BOX', 'PAR'], 'Solido a parallelepipedo', async () => { const a = await getPoint('Primo angolo base'); active.preview = c => [{ type: 'pline', pts: [a, [c[0], a[1]], c, [a[0], c[1]]], closed: true }]; const b = await getPoint('Angolo opposto', a); const h = await getNumber('Altezza', 3); begin(); add({ type: 'solid', pts: [a, [b[0], a[1]], b, [a[0], b[1]]], z0: 0, h, layer: 'SOLIDI' }); commit('Parallelepipedo'); }, '3D');
  cmdDef('CILINDRO', ['CIL', 'CYLINDER'], 'Solido cilindrico', async () => { const c = await getPoint('Centro base'); active.preview = p => [{ type: 'circle', cx: c[0], cy: c[1], r: G.dist(c, p) }]; const r = await getNumber('Raggio', 1, c); const h = await getNumber('Altezza', 3); begin(); add({ type: 'solid', pts: G.circlePts(c, r, 32), z0: 0, h, layer: 'SOLIDI', round: true }); commit('Cilindro'); }, '3D');
  async function boolOp(op) { const a = await getEntity('Primo solido', x => x.type === 'solid'); if (!a) return; const b = await getEntity(op === 'difference' ? 'Solido da sottrarre' : 'Secondo solido', x => x.type === 'solid' && x !== a); if (!b) return;
    if (op !== 'difference' && (Math.abs(a.z0 - b.z0) > 1e-6 || Math.abs(a.h - b.h) > 1e-6)) { log('Booleane prismatiche: i solidi devono avere stessa quota base e altezza', 'err'); return; }
    const res = G.clip(a.pts, b.pts, op); begin(); delIds(op === 'difference' ? [a.id, b.id] : [a.id, b.id]);
    if (op === 'difference' && (b.z0 > a.z0 + 1e-6 || b.z0 + b.h < a.z0 + a.h - 1e-6)) { // sottrazione parziale in altezza → solidi impilati
      const z1 = Math.max(a.z0, b.z0), z2 = Math.min(a.z0 + a.h, b.z0 + b.h); if (z1 > a.z0) add({ type: 'solid', pts: a.pts, z0: a.z0, h: z1 - a.z0, layer: a.layer }); if (z2 < a.z0 + a.h) add({ type: 'solid', pts: a.pts, z0: z2, h: a.z0 + a.h - z2, layer: a.layer }); res.forEach(p => add({ type: 'solid', pts: p[0], holes: p.slice(1), z0: z1, h: z2 - z1, layer: a.layer })); }
    else res.forEach(p => add({ type: 'solid', pts: p[0], holes: p.slice(1), z0: a.z0, h: a.h, layer: a.layer }));
    commit({ union: 'Unione', difference: 'Sottrazione', intersection: 'Intersezione' }[op]); log(`${res.length} solido/i risultante/i`, 'res'); }
  cmdDef('UNIONE', ['UNI', 'UNION'], 'Unione booleana di solidi', () => boolOp('union'), '3D');
  cmdDef('SOTTRAI', ['SOT', 'SUBTRACT'], 'Sottrazione booleana di solidi', () => boolOp('difference'), '3D');
  cmdDef('INTERSECA', ['INT', 'INTERSECT'], 'Intersezione booleana di solidi', () => boolOp('intersection'), '3D');
  cmdDef('3D', ['VISTA3D', '3DORBIT', 'ORBITA'], 'Vista 3D / orbita', async () => CAD.toggle3d(true), 'Vista');
  cmdDef('2D', ['PIANTA'], 'Torna alla vista in pianta', async () => CAD.toggle3d(false), 'Vista');
  cmdDef('VALIDA', ['VAL', 'VALIDATE'], 'Valida contenuti generati da AI', async () => { const ai = D.entities.filter(e => e.ai); if (!ai.length) { log('Nessun contenuto AI da validare'); return; } const ids = sel.size ? [...sel].filter(id => byId(id) && byId(id).ai) : ai.map(e => e.id); begin(); ids.forEach(id => { const e = byId(id); delete e.ai; e.validatedBy = App.user && App.user.id; }); commit('Validazione contenuti AI'); App.audit('ai-validate', `${ids.length} elementi AI validati`); log(`${ids.length} elementi validati dal tecnico`, 'res'); }, 'Utilità');
  cmdDef('ALIAS', [], 'Definisce alias comando (es. ALIAS MM SPOSTA)', async () => { const a = await getText('Nuovo alias'); const c = await getText('Comando di destinazione'); const k = resolveCmd(c); if (!k || !a) { log('Comando non valido', 'err'); return; } App.state.settings.aliases[a.toUpperCase()] = k; App.save(); log(`Alias ${a.toUpperCase()} → ${k}`, 'res'); }, 'Utilità');
  cmdDef('ELLISSE', ['EL', 'ELLIPSE'], 'Ellisse per centro e semiassi', async () => { const c = await getPoint('Centro ellisse'); active.preview = q => [{ type: 'ellipse', cx: c[0], cy: c[1], rx: Math.max(.01, G.dist(c, q)), ry: Math.max(.01, G.dist(c, q) * .5), rot: Math.atan2(q[1] - c[1], q[0] - c[0]) }]; const a = await getPoint('Estremo primo asse', c); const rx = G.dist(c, a), rot = Math.atan2(a[1] - c[1], a[0] - c[0]); active.preview = q => [{ type: 'ellipse', cx: c[0], cy: c[1], rx, ry: Math.max(.01, Math.abs(G.dot(G.sub(q, c), [-Math.sin(rot), Math.cos(rot)]))), rot }]; const ry = await getNumber('Lunghezza secondo semiasse (valore o punto)', undefined, c); begin(); add({ type: 'ellipse', cx: c[0], cy: c[1], rx, ry: Math.abs(ry), rot }); commit('Ellisse'); });
  cmdDef('POLIGONO', ['POL', 'POLYGON'], 'Poligono regolare inscritto', async () => { const n = Math.max(3, Math.round(await getNumber('Numero di lati', 6))); const c = await getPoint('Centro del poligono'); active.preview = q => { const r = G.dist(c, q), a0 = Math.atan2(q[1] - c[1], q[0] - c[0]); return [{ type: 'pline', closed: true, pts: [...Array(n)].map((_, i) => [c[0] + r * Math.cos(a0 + i * 2 * Math.PI / n), c[1] + r * Math.sin(a0 + i * 2 * Math.PI / n)]) }]; }; const q = await getPoint('Vertice (raggio inscritto)', c); const r = G.dist(c, q), a0 = Math.atan2(q[1] - c[1], q[0] - c[0]); begin(); add({ type: 'pline', closed: true, pts: [...Array(n)].map((_, i) => [c[0] + r * Math.cos(a0 + i * 2 * Math.PI / n), c[1] + r * Math.sin(a0 + i * 2 * Math.PI / n)]) }); commit('Poligono'); });
  cmdDef('SPLINE', ['SPL'], 'Spline per punti di passaggio (C = chiusa)', async () => { const pts = [await getPoint('Primo punto')]; for (;;) { active.preview = q => [{ type: 'spline', pts: [...pts, q] }]; const b = await getPoint('Punto successivo [C=Chiudi, Invio=fine]', pts[pts.length - 1], { allowEnd: true, keywords: ['C'] }); if (!b || b === 'C') { if (pts.length > 1) { begin(); add({ type: 'spline', pts, closed: b === 'C' }); commit('Spline'); } break; } pts.push(b); } });
  cmdDef('TESTOM', ['MT', 'MTEXT'], 'Testo multiriga (usa \\n per andare a capo)', async () => { const p = await getPoint('Punto di inserimento (angolo superiore sinistro)'); const h = await getNumber('Altezza testo', .3); const t = await getText('Testo (\\n = nuova riga)'); if (!t) return; begin(); add({ type: 'mtext', x: p[0], y: p[1], h, text: t.replace(/\\n/g, '\n'), rot: 0, layer: layerOf('TESTI') ? 'TESTI' : D.current }); commit('Testo multiriga'); }, 'Annotazioni');
  cmdDef('PUNTO', ['PT', 'POINT'], 'Punto', async () => { for (;;) { const p = await getPoint('Posizione del punto (Invio per terminare)', null, { allowEnd: true }); if (!p) break; begin(); add({ type: 'point', x: p[0], y: p[1] }); commit('Punto'); } });
  cmdDef('RETINO', ['H', 'HATCH', 'TRATTEGGIO'], 'Retino in un contorno chiuso o per punti', async () => { const pat = (await getText('Motivo [ANSI31/ANSI37/NET/SOLID/DOTS/BRICK]', CAD.lastPat || 'ANSI31')).toLowerCase(); CAD.lastPat = pat.toUpperCase(); const sc = await getNumber('Interasse del motivo (m)', CAD.lastHs || .1); CAD.lastHs = sc;
      const f = await getPoint('Clic dentro un contorno chiuso [P = per punti]', null, { keywords: ['P'], raw: true }); let pts = null;
      if (f === 'P') { pts = [await getPoint('Primo vertice')]; for (;;) { active.preview = q => [{ type: 'pline', pts: [...pts, q], closed: true }]; const b = await getPoint('Vertice successivo (Invio per chiudere)', pts[pts.length - 1], { allowEnd: true }); if (!b) break; pts.push(b); } }
      else { const cands = D.entities.filter(e => visible(e) && ((e.pts && (e.closed || e.type === 'room' || e.type === 'solid')) || e.type === 'circle' || e.type === 'ellipse')).map(e => ({ e, poly: e.type === 'circle' ? G.circlePts([e.cx, e.cy], e.r, 64) : e.type === 'ellipse' ? ellPts(e) : e.pts })).filter(x => G.pip(f, x.poly)).sort((a, b) => Math.abs(G.area(a.poly)) - Math.abs(G.area(b.poly))); if (!cands.length) { log('Nessun contorno chiuso trovato attorno al punto', 'err'); return; } pts = cands[0].poly.slice(); const holes = D.entities.filter(e => e.pts && e.closed && e !== cands[0].e && G.pip(e.pts[0], pts) && !G.pip(f, e.pts)).map(e => e.pts.slice()); CAD._holes = holes; }
      if (!pts || pts.length < 3) return; begin(); add({ type: 'hatch', pts, holes: CAD._holes || [], pattern: ['ansi31', 'ansi37', 'net', 'solid', 'dots', 'brick'].includes(pat) ? pat : 'ansi31', scale: sc, angle: 0 }); CAD._holes = null; commit('Retino'); }, 'Annotazioni');
  cmdDef('SERIE', ['AR', 'ARRAY'], 'Serie rettangolare o polare', async () => { const ids = await getSelection(); if (!ids.length) return; const kind = (await getText('Tipo [R=rettangolare/P=polare]', 'R')).toUpperCase();
      if (kind.startsWith('P')) { const c = await getPoint('Centro della serie'); const n = Math.max(2, Math.round(await getNumber('Numero totale di elementi', 6))); const tot = await getNumber('Angolo da riempire (gradi)', 360); begin(); for (let i = 1; i < n; i++) { const a = (tot * Math.PI / 180) * i / (Math.abs(tot) >= 360 ? n : n - 1); transformSel(ids, q => G.rot(q, c, a), 1, a, false, true); } commit('Serie polare'); }
      else { const nr = Math.max(1, Math.round(await getNumber('Righe', 2))), nc = Math.max(1, Math.round(await getNumber('Colonne', 3))); const dy = await getNumber('Distanza tra righe', 3), dx = await getNumber('Distanza tra colonne', 3); begin(); for (let r = 0; r < nr; r++) for (let k = 0; k < nc; k++) { if (!r && !k) continue; transformSel(ids, q => [q[0] + k * dx, q[1] + r * dy], 1, 0, false, true); } commit('Serie rettangolare'); } }, 'Modifica');
  cmdDef('DIRETTRICE', ['LE', 'LEADER', 'MLEADER'], 'Direttrice con testo', async () => { const pts = [await getPoint('Punta della freccia')]; for (;;) { active.preview = q => [{ type: 'leader', pts: [...pts, q] }]; const b = await getPoint('Punto successivo (Invio per il testo)', pts[pts.length - 1], { allowEnd: true }); if (!b) break; pts.push(b); } if (pts.length < 2) return; const t = await getText('Testo della direttrice', ''); begin(); add({ type: 'leader', pts, text: t, h: .25, layer: layerOf('QUOTE') ? 'QUOTE' : D.current }); commit('Direttrice'); }, 'Annotazioni');
  cmdDef('QUOTALIN', ['DLI', 'DIMLINEAR'], 'Quota lineare orizzontale/verticale', async () => { const a = await getPoint('Origine prima linea di estensione'); const b = await getPoint('Origine seconda linea di estensione', a); active.preview = c => { const hz = Math.abs(c[1] - (a[1] + b[1]) / 2) > Math.abs(c[0] - (a[0] + b[0]) / 2); const A = hz ? [a[0], c[1]] : [c[0], a[1]], B = hz ? [b[0], c[1]] : [c[0], b[1]]; return [{ type: 'line', x1: a[0], y1: a[1], x2: A[0], y2: A[1] }, { type: 'line', x1: b[0], y1: b[1], x2: B[0], y2: B[1] }, { type: 'line', x1: A[0], y1: A[1], x2: B[0], y2: B[1] }]; };
      const c = await getPoint('Posizione linea di quota', b); const hz = Math.abs(c[1] - (a[1] + b[1]) / 2) > Math.abs(c[0] - (a[0] + b[0]) / 2);
      begin(); add({ type: 'dim', x1: a[0], y1: a[1], x2: b[0], y2: b[1], off: 0, lin: hz ? 'h' : 'v', at: hz ? c[1] : c[0], layer: layerOf('QUOTE') ? 'QUOTE' : D.current }); commit('Quota lineare'); }, 'Annotazioni');
  cmdDef('QUOTARAG', ['DRA', 'DIMRADIUS', 'DDI', 'DIMDIAMETER'], 'Quota di raggio o diametro', async () => { const e = await getEntity('Cerchio o arco', x => x.type === 'circle' || x.type === 'arc'); if (!e) return; const p = waiter_last; const dia = (await getText('Tipo [R=raggio/D=diametro]', 'R')).toUpperCase().startsWith('D'); begin(); add({ type: 'dimr', cx: e.cx, cy: e.cy, r: e.r, ang: Math.atan2(p[1] - e.cy, p[0] - e.cx), dia, layer: layerOf('QUOTE') ? 'QUOTE' : D.current }); commit('Quota radiale'); }, 'Annotazioni');
  cmdDef('SPEZZA', ['BR', 'BREAK'], 'Spezza una linea tra due punti', async () => { const e = await getEntity('Linea da spezzare', x => x.type === 'line'); if (!e) return; const p1 = waiter_last; const p2 = await getPoint('Secondo punto di interruzione', p1); const a = [e.x1, e.y1], b = [e.x2, e.y2]; let t1 = Math.max(0, Math.min(1, G.projT(p1, a, b))), t2 = Math.max(0, Math.min(1, G.projT(p2, a, b))); if (t1 > t2) [t1, t2] = [t2, t1]; begin(); delIds([e.id]); if (t1 > 1e-6) { const q = G.lerp(a, b, t1); add({ ...e, id: undefined, x2: q[0], y2: q[1] }); } if (t2 < 1 - 1e-6) { const q = G.lerp(a, b, t2); add({ ...e, id: undefined, x1: q[0], y1: q[1] }); } commit('Spezza'); }, 'Modifica');
  cmdDef('UNISCI', ['J', 'JOIN'], 'Unisce linee e polilinee contigue in una polilinea', async () => { const ids = await getSelection(); const ents = ids.map(byId).filter(e => e && (e.type === 'line' || (e.type === 'pline' && !e.closed))); if (ents.length < 2) { log('Seleziona almeno due linee contigue', 'err'); return; } const segs = ents.map(e => e.type === 'line' ? [[e.x1, e.y1], [e.x2, e.y2]] : e.pts.slice()); let chain = segs.shift(); const near = (p, q) => G.dist(p, q) < 1e-4; let guard = 0;
      while (segs.length && guard++ < 1000) { const i = segs.findIndex(sg => near(sg[0], chain[chain.length - 1]) || near(sg[sg.length - 1], chain[chain.length - 1]) || near(sg[0], chain[0]) || near(sg[sg.length - 1], chain[0])); if (i < 0) break; let sg = segs.splice(i, 1)[0]; if (near(sg[0], chain[chain.length - 1])) chain = chain.concat(sg.slice(1)); else if (near(sg[sg.length - 1], chain[chain.length - 1])) chain = chain.concat(sg.reverse().slice(1)); else if (near(sg[sg.length - 1], chain[0])) chain = sg.slice(0, -1).concat(chain); else chain = sg.reverse().slice(0, -1).concat(chain); }
      const closed = near(chain[0], chain[chain.length - 1]); if (closed) chain.pop(); begin(); delIds(ents.map(e => e.id)); add({ type: 'pline', pts: chain, closed, layer: ents[0].layer }); commit('Unisci'); log(`Polilinea di ${chain.length} vertici${closed ? ' chiusa' : ''}${segs.length ? ' · ' + segs.length + ' elementi non contigui esclusi' : ''}`, 'res'); }, 'Modifica');
  cmdDef('CIMA', ['CHA', 'CHAMFER'], 'Cima (smusso) tra due linee', async () => { const d = await getNumber('Distanza di cimatura', CAD.lastCha ?? .5); CAD.lastCha = d; const e1 = await getEntity('Prima linea', x => x.type === 'line'); const p1 = waiter_last; const e2 = await getEntity('Seconda linea', x => x.type === 'line' && x !== e1); const p2 = waiter_last; if (!e1 || !e2) return; const I = G.lineInt([e1.x1, e1.y1], [e1.x2, e1.y2], [e2.x1, e2.y1], [e2.x2, e2.y2]); if (!I) { log('Linee parallele', 'err'); return; } const X = I.p; const far = (e, p) => { const a = [e.x1, e.y1], b = [e.x2, e.y2]; return G.projT(p, a, b) < G.projT(X, a, b) ? a : b; }; const f1 = far(e1, p1), f2 = far(e2, p2); const t1 = G.add(X, G.mul(G.norm(G.sub(f1, X)), d)), t2 = G.add(X, G.mul(G.norm(G.sub(f2, X)), d)); begin(); Object.assign(e1, { x1: f1[0], y1: f1[1], x2: t1[0], y2: t1[1] }); Object.assign(e2, { x1: f2[0], y1: f2[1], x2: t2[0], y2: t2[1] }); if (d > 0) add({ type: 'line', x1: t1[0], y1: t1[1], x2: t2[0], y2: t2[1], layer: e1.layer }); commit('Cima'); }, 'Modifica');
  cmdDef('STIRA', ['S', 'STRETCH'], 'Stira: sposta i vertici compresi in una finestra', async () => { const a = await getPoint('Primo angolo della finestra di stiramento'); active.preview = q => [{ type: 'pline', closed: true, pts: [a, [q[0], a[1]], q, [a[0], q[1]]] }]; const b = await getPoint('Angolo opposto', a); const box = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; const inB = q => q[0] >= box[0] && q[0] <= box[2] && q[1] >= box[1] && q[1] <= box[3]; const bp = await getPoint('Punto base'); const tp = await getPoint('Secondo punto', bp); const dx = tp[0] - bp[0], dy = tp[1] - bp[1]; const mv = q => inB(q) ? [q[0] + dx, q[1] + dy] : q; let n = 0; begin();
      D.entities.forEach(e => { if (!editable(e)) return; if ('x1' in e) { const p1 = [e.x1, e.y1], p2 = [e.x2, e.y2]; if (inB(p1) || inB(p2)) { [e.x1, e.y1] = mv(p1); [e.x2, e.y2] = mv(p2); n++; } } else if (e.pts && e.pts.some(inB)) { e.pts = e.pts.map(mv); n++; } else if ('x' in e && inB([e.x, e.y])) { e.x += dx; e.y += dy; n++; } else if ('cx' in e && inB([e.cx, e.cy])) { e.cx += dx; e.cy += dy; n++; } }); resolveDims(); commit('Stira'); log(`${n} oggetti stirati`, 'res'); }, 'Modifica');
  cmdDef('CORRISPONDENZA', ['MA', 'MATCHPROP'], 'Copia layer, colore e stile da un oggetto ad altri', async () => { const src = await getEntity('Oggetto di origine'); if (!src) return; for (;;) { const e = await getEntity('Oggetto di destinazione (Invio per terminare)'); if (!e) break; begin(); e.layer = src.layer; if (src.color) e.color = src.color; else delete e.color; if (src.material && 'material' in e) e.material = src.material; if (src.pattern && e.type === 'hatch') { e.pattern = src.pattern; e.scale = src.scale; } commit('Corrispondenza proprietà'); } }, 'Modifica');
  cmdDef('DIVIDI', ['DIV', 'DIVIDE'], 'Divide un oggetto in N parti con punti', async () => { const e = await getEntity('Oggetto da dividere', x => ['line', 'pline', 'circle', 'arc', 'spline', 'ellipse'].includes(x.type)); if (!e) return; const n = Math.max(2, Math.round(await getNumber('Numero di segmenti', 4))); const segs = segsOf(e); const L = segs.reduce((a, s2) => a + G.dist(s2[0], s2[1]), 0); begin(); for (let k = 1; k < n; k++) { let d = L * k / n; for (const s2 of segs) { const l = G.dist(s2[0], s2[1]); if (d <= l) { const q = G.lerp(s2[0], s2[1], d / l); add({ type: 'point', x: q[0], y: q[1], layer: e.layer }); break; } d -= l; } } commit('Dividi'); }, 'Utilità');
  cmdDef('MISURA', ['ME', 'MEASURE'], 'Punti a intervallo fisso lungo un oggetto', async () => { const e = await getEntity('Oggetto da misurare', x => ['line', 'pline', 'circle', 'arc', 'spline', 'ellipse'].includes(x.type)); if (!e) return; const step = await getNumber('Lunghezza del segmento', 1); const segs = segsOf(e); const L = segs.reduce((a, s2) => a + G.dist(s2[0], s2[1]), 0); begin(); for (let D2 = step; D2 < L - 1e-9; D2 += step) { let d = D2; for (const s2 of segs) { const l = G.dist(s2[0], s2[1]); if (d <= l) { const q = G.lerp(s2[0], s2[1], d / l); add({ type: 'point', x: q[0], y: q[1], layer: e.layer }); break; } d -= l; } } commit('Misura'); }, 'Utilità');
  cmdDef('ID', ['IDPOINT'], 'Coordinate di un punto', async () => { const q = await getPoint('Punto'); const crs = App.project().crs; let geo = ''; try { const T = App.gis.cadToLL(App.project()); const ll = T(q[0], q[1]); geo = ` · ${ll[1].toFixed(6)}°N ${ll[0].toFixed(6)}°E`; } catch (e) { } log(`X = ${App.fnum(q[0], 4)}  Y = ${App.fnum(q[1], 4)}  (${crs} locale)${geo}`, 'res'); }, 'Utilità');
  cmdDef('ELIMINA', ['PU', 'PURGE'], 'Elimina layer e blocchi non usati', async () => { const used = new Set(D.entities.map(e => e.layer)); const before = D.layers.length; D.layers = D.layers.filter(l => l.name === '0' || l.name === D.current || used.has(l.name)); const ub = new Set(D.entities.filter(e => e.type === 'insert').map(e => e.name)); let nb = 0; Object.keys(D.blocks || {}).forEach(k => { if (!ub.has(k)) { delete D.blocks[k]; nb++; } }); App.touch(); updatePanels(); log(`Eliminati ${before - D.layers.length} layer e ${nb} blocchi non usati`, 'res'); }, 'Utilità');
  cmdDef('PIANTADABRIEF', ['GEN', 'PIANTA'], 'Genera una pianta da brief (motore procedurale)', async () => { const r = await App.form('Pianta da brief', [{ name: 'p', label: 'Descrizione', value: 'Abitazione di 90 mq con 2 camere, 1 bagno e cucina a vista' }, { name: 'ins', label: 'Inserisci a destra del disegno esistente', type: 'checkbox', value: true }], 'Genera'); if (!r) return; const P = App.gen.parsePrompt(r.p); let ox = 0; if (r.ins) { const pts = []; D.entities.forEach(e => { const b = bboxOf(e); if (b) pts.push([b[2], b[3]]); }); if (pts.length) ox = Math.max(...pts.map(q => q[0])) + 4; } const v = App.gen.generate({ ...P, origin: [ox, 0], seed: Date.now() % 97 }); App.cad.use(App.project()); const idmap = {}; v.entities.forEach(e => idmap[e.id] = App.uid()); begin(); v.entities.forEach(e => { const n = App.clone(e); n.id = idmap[e.id]; if (n.wall) n.wall = idmap[n.wall]; n.ai = true; D.entities.push(n); }); commit('Pianta da brief'); zoomExtents(); log(`Generati ${v.rooms.length} ambienti (${App.fnum(v.sup, 1)} m²): elementi marcati da verificare, usa VALIDA`, 'res'); }, 'Architettura');
  cmdDef('TRACCIA', ['TRACE', 'SCANSIONE'], 'Vettorializza muri da una scansione', async () => { const [f] = await App.pickFiles({ accept: 'image/png,image/jpeg,image/webp' }); if (!f) return; const img = new Image(); img.src = await App.readDataURL(f); await new Promise(r => img.onload = r); const wm = await getNumber(`Larghezza reale dell'immagine in metri (${img.width} px)`, +(img.width / 100).toFixed(2)); const res = App.gen.trace(img, { pxPerM: img.width / wm, thr: 110, minLenM: .5 }); App.cad.use(App.project()); begin(); res.walls.forEach(w => { const e = add({ type: 'wall', x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, thk: w.thk, h: 3, layer: 'MURI', material: w.thk >= .25 ? 'Laterizio' : 'Cartongesso', ai: true }); const L = G.dist([w.x1, w.y1], [w.x2, w.y2]); const hz = Math.abs(w.y1 - w.y2) < 1e-6; const st = hz ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2); (w.gaps || []).forEach(([a, b]) => { const width = b - a; add({ type: width < 1.05 ? 'door' : 'window', wall: e.id, t: ((a + b) / 2 - st) / L, width, side: 1, flip: false, h: width < 1.05 ? 2.1 : 1.4, sill: width < 1.05 ? 0 : .9, layer: 'APERTURE', ai: true }); }); }); commit('Tracciamento scansione'); zoomExtents(); log(`${res.walls.length} muri tracciati (da verificare)`, 'res'); }, 'Architettura');
  cmdDef('AIUTO', ['?', 'HELP', 'H?'], 'Elenco comandi', async () => { Object.values(C).forEach(c => log(`${c.name.padEnd(16)} ${c.aliases.join(', ').padEnd(22)} ${c.desc}`)); }, 'Utilità');
  CAD.commands = C;
  function resolveCmd(s) { s = String(s || '').trim().toUpperCase(); if (!s) return null; const al = App.state.settings.aliases || {}; if (al[s]) return al[s]; if (C[s]) return s; const f = Object.values(C).find(c => c.aliases.includes(s)); return f ? f.name : null; }
  async function run(name, fnOverride) {
    if (active) { cancelWait(); await new Promise(r => setTimeout(r, 0)); }
    if (!App.can('edit') && !['ZOOM', 'DISTANZA', 'AREA', 'LISTA', 'AIUTO', '3D', '2D', 'SELEZIONATUTTO', 'GRIGLIA', 'SNAP', 'OSNAP', 'ORTO', 'POLARE', 'LAYER'].includes(name)) { log('Permesso negato: ruolo in sola lettura/commento', 'err'); return; }
    const c = C[name]; active = { name, preview: null, base: null }; log('Comando: ' + name); setActiveTool(name); App.state.lastCmds = [name, ...(App.state.lastCmds || []).filter(x => x !== name)].slice(0, 20);
    try { await (fnOverride || c.fn)(); } catch (e) { if (e !== CANCEL) { console.error(e); log('Errore: ' + e.message, 'err'); } else log('*Annullato*'); if (baseline) { D.entities = JSON.parse(baseline); baseline = null; } }
    if (active && active.name === name) { active = null; preview = []; waiter = null; setPrompt(App.t('command') + ':'); setActiveTool(null); draw(); }
  }
  CAD.run = n => { const k = resolveCmd(n); if (k) run(k); };
  function setActiveTool(n) { $$('.toolbar-v button[data-cmd]').forEach(b => b.classList.toggle('active', b.dataset.cmd === n)); }
  function toggle(k) { settings[k] = !settings[k]; if (k === 'ortho' && settings.ortho) settings.polar = false; if (k === 'polar' && settings.polar) settings.ortho = false; log(`${k.toUpperCase()} ${settings[k] ? 'attivo' : 'disattivo'}`); renderStatus(); draw(); }

  /* ---------- vista ---------- */
  function fitBox(b, pad = 1.15) { if (!b || !isFinite(b[0])) return; const w = Math.max(1, b[2] - b[0]), h = Math.max(1, b[3] - b[1]); view.x = (b[0] + b[2]) / 2; view.y = (b[1] + b[3]) / 2; view.s = Math.min(W / (w * pad), H / (h * pad)); draw(); }
  function zoomExtents() { const pts = []; D.entities.filter(visible).forEach(e => { const b = bboxOf(e); if (b) pts.push([b[0], b[1]], [b[2], b[3]]); }); if (pts.length) fitBox(G.bbox(pts)); else { view = { x: 0, y: 0, s: 40 }; draw(); } }
  CAD.zoomExtents = () => zoomExtents();
  CAD.focus = id => { const e = byId(id); if (!e) return; const b = bboxOf(e); if (b) fitBox([b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2], 1.6); sel.clear(); sel.add(id); updatePanels(); draw(); };
  CAD.setHighlights = h => { highlights = h || []; draw(); };

  /* ---------- eventi ---------- */
  function onMove(ev) {
    const r = cv.getBoundingClientRect(); cursorScr = [ev.clientX - r.left, ev.clientY - r.top];
    if (panning) { view.x -= (ev.clientX - panning.x) / view.s; view.y += (ev.clientY - panning.y) / view.s; panning.x = ev.clientX; panning.y = ev.clientY; draw(); return; }
    if (dragSel) { dragSel.b = cursorScr; draw(); return; }
    cursor = waiter && (waiter.kind === 'point' || waiter.kind === 'number') ? pointer(cursorScr) : toW(cursorScr);
    if (!waiter || waiter.kind === 'select' || waiter.kind === 'entity') { snap = null; const p = toW(cursorScr); let best = null, bd = 6 / view.s; D.entities.forEach(e => { if (!visible(e)) return; if (waiter && waiter.filter && !waiter.filter(e)) return; const d = hitDist(e, p); if (d < bd) { bd = d; best = e.id; } }); hover = best; }
    preview = active && active.preview ? active.preview(cursor) || [] : [];
    const co = $('#cadCoords'); if (co) co.textContent = `X ${App.fnum(cursor[0], 3)}   Y ${App.fnum(cursor[1], 3)}`;
    draw();
  }
  function pick(p) { let best = null, bd = 6 / view.s; D.entities.forEach(e => { if (!visible(e)) return; const d = hitDist(e, p); if (d < bd || (d === bd && best && best.type === 'room')) { bd = d; best = e; } }); return best; }
  function onDown(ev) {
    cv.focus();
    if (ev.button === 1 || (ev.button === 0 && (ev.shiftKey && ev.altKey || CAD.panTool))) { panning = { x: ev.clientX, y: ev.clientY }; ev.preventDefault(); return; }
    if (ev.button === 2) return;
    const r = cv.getBoundingClientRect(); const scr = [ev.clientX - r.left, ev.clientY - r.top];
    if (waiter && waiter.kind === 'point') { waiter_last = cursor; feed(waiter.raw ? toW(scr) : cursor); return; }
    if (waiter && waiter.kind === 'number' && waiter.base) { feed(/Angolo|Rotazione/.test($('#cmdPrompt').textContent) ? Math.atan2(cursor[1] - waiter.base[1], cursor[0] - waiter.base[0]) * 180 / Math.PI : G.dist(waiter.base, cursor)); return; }
    if (waiter && waiter.kind === 'entity') { const p = toW(scr); waiter_last = p; const e = pick(p); if (e && (!waiter.filter || waiter.filter(e))) feed(e); else log('Nessun oggetto valido selezionato'); return; }
    // selezione
    const p = toW(scr); const e = pick(p);
    if (e) { if (!ev.shiftKey && !(waiter && waiter.kind === 'select')) sel.clear(); if (sel.has(e.id) && ev.shiftKey) sel.delete(e.id); else sel.add(e.id); updatePanels(); draw(); }
    else { dragSel = { a: scr, b: scr, add: ev.shiftKey || (waiter && waiter.kind === 'select') }; }
  }
  function onUp() {
    if (panning) { panning = null; return; }
    if (dragSel) { const { a, b } = dragSel; if (Math.abs(a[0] - b[0]) > 3 || Math.abs(a[1] - b[1]) > 3) { const wa = toW(a), wb = toW(b); const box = [Math.min(wa[0], wb[0]), Math.min(wa[1], wb[1]), Math.max(wa[0], wb[0]), Math.max(wa[1], wb[1])]; const crossing = b[0] < a[0];
        if (!dragSel.add) sel.clear();
        D.entities.forEach(e => { if (!editable(e) && !visible(e)) return; const bb = bboxOf(e); if (!bb) return; const inside = bb[0] >= box[0] && bb[2] <= box[2] && bb[1] >= box[1] && bb[3] <= box[3]; const touch = !(bb[2] < box[0] || bb[0] > box[2] || bb[3] < box[1] || bb[1] > box[3]) && (inside || segsOf(e).some(s => G.segDist([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], s[0], s[1]) < Math.hypot(box[2] - box[0], box[3] - box[1]) / 2 && (lineBox(s, box)))); if (inside || (crossing && touch)) sel.add(e.id); });
      } else if (!dragSel.add) sel.clear();
      dragSel = null; updatePanels(); draw(); }
  }
  const lineBox = (s, b) => { const inB = p => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]; if (inB(s[0]) || inB(s[1])) return true; const E = [[[b[0], b[1]], [b[2], b[1]]], [[b[2], b[1]], [b[2], b[3]]], [[b[2], b[3]], [b[0], b[3]]], [[b[0], b[3]], [b[0], b[1]]]]; return E.some(e => G.segInt(s[0], s[1], e[0], e[1])); };
  function onWheel(ev) { ev.preventDefault(); const r = cv.getBoundingClientRect(); const scr = [ev.clientX - r.left, ev.clientY - r.top]; const before = toW(scr); const f = Math.exp(-ev.deltaY * 0.0015); view.s = Math.max(0.05, Math.min(5000, view.s * f)); const after = toW(scr); view.x += before[0] - after[0]; view.y += before[1] - after[1]; draw(); }
  function onCtx(ev) {
    ev.preventDefault(); if (waiter && (waiter.kind === 'point' || waiter.kind === 'select' || waiter.kind === 'entity')) { feed(null); return; }
    const r = cv.getBoundingClientRect(); const p = toW([ev.clientX - r.left, ev.clientY - r.top]); const e = pick(p);
    if (e && !sel.has(e.id)) { sel.clear(); sel.add(e.id); updatePanels(); draw(); }
    const items = [];
    if (sel.size) {
      items.push({ label: App.icon('move', 15) + ' Sposta', action: () => CAD.run('SPOSTA') }, { label: App.icon('copy', 15) + ' Copia', action: () => CAD.run('COPIA') }, { label: App.icon('rotate', 15) + ' Ruota', action: () => CAD.run('RUOTA') }, { label: App.icon('mirror', 15) + ' Specchia', action: () => CAD.run('SPECCHIO') }, { label: App.icon('trash', 15) + ' Cancella', action: () => CAD.run('CANCELLA') });
      const one = sel.size === 1 && byId([...sel][0]);
      if (one && (one.type === 'door')) items.push({ label: '⇄ Inverti cerniera', action: () => { begin(); one.flip = !one.flip; commit('Inverti porta'); } }, { label: '⇅ Inverti verso apertura', action: () => { begin(); one.side = -(one.side || 1); commit('Inverti porta'); } });
      items.push('-', { label: App.icon('info', 15) + ' Proprietà', action: () => showTab('props') });
      if ([...sel].some(id => byId(id) && byId(id).ai)) items.push({ label: App.icon('check', 15) + ' Valida contenuto AI', action: () => CAD.run('VALIDA') });
    } else items.push({ label: App.icon('undo', 15) + ' Annulla', action: doUndo }, { label: App.icon('redo', 15) + ' Ripeti', action: doRedo }, { label: App.icon('zoom', 15) + ' Zoom estensioni', action: zoomExtents }, { label: App.icon('select', 15) + ' Seleziona tutto', action: () => CAD.run('SELEZIONATUTTO') });
    App.ctxMenu(ev.clientX, ev.clientY, items);
  }
  function onKey(ev) {
    if (mode3d) return;
    const inp = $('#cmdInput'); if (!inp) return;
    if (ev.target.closest('.side') || ev.target.closest('.modal-back')) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? doRedo() : doUndo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); doRedo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a') { if (ev.target === inp) return; ev.preventDefault(); CAD.run('SELEZIONATUTTO'); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); App.saveNow(); log('Salvato localmente'); return; }
    const fk = { F3: 'osnap', F7: 'grid', F8: 'ortho', F9: 'snap', F10: 'polar', F12: 'dyn' }[ev.key]; if (fk) { ev.preventDefault(); toggle(fk); return; }
    if (ev.key === 'Escape') { if (active) cancelWait(); else { sel.clear(); updatePanels(); draw(); } inp.value = ''; hideAC(); return; }
    if (ev.key === 'Delete' && document.activeElement !== inp && sel.size && !active) { CAD.run('CANCELLA'); return; }
    if (ev.target !== inp && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { inp.focus(); }
    if (ev.target !== inp && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); submitCmd(); }
  }
  function submitCmd() {
    const inp = $('#cmdInput'); const v = inp.value.trim(); inp.value = ''; hideAC();
    if (waiter) {
      const w = waiter;
      if (!v) { if (w.kind === 'select') { feed(true); return; } if (w.kind === 'text' && w.def !== undefined) { feed(String(w.def)); return; } if (w.kind === 'number' && w.def !== undefined) { feed(Number(w.def)); return; } if (w.allowEnd || w.kind === 'entity') { feed(null); return; } return; }
      if (w.kind === 'point') { if (w.keywords && w.keywords.includes(v.toUpperCase())) { feed(v.toUpperCase()); return; } const p = parseCoord(v, w.base); if (p) { log('› ' + v); feed(p); } else log('Coordinate non valide. Formati: x,y · @dx,dy · @dist<ang · dist', 'err'); return; }
      if (w.kind === 'number') { const n = Number(v.replace(',', '.')); if (isFinite(n)) { log('› ' + v); feed(n); } else log('Valore numerico atteso', 'err'); return; }
      if (w.kind === 'text') { log('› ' + v); feed(v); return; }
      if (w.kind === 'select' || w.kind === 'entity') { feed(null); return; }
    }
    if (!v) { const last = (App.state.lastCmds || [])[0]; if (last) run(last); return; }
    const k = resolveCmd(v.split(/\s+/)[0]); if (k) run(k); else log(`Comando sconosciuto: "${v}". Digita ? per l'elenco.`, 'err');
  }
  // autocompletamento
  let acIdx = 0, acItems = [];
  function showAC(q) {
    const box = $('#cmdAC'); if (!q || waiter) { hideAC(); return; } q = q.toUpperCase();
    const al = App.state.settings.aliases || {};
    acItems = [...Object.values(C).filter(c => c.name.startsWith(q) || c.aliases.some(a => a.startsWith(q))).map(c => ({ k: c.name, d: c.desc, a: c.aliases.slice(0, 2).join(', ') })), ...Object.entries(al).filter(([a]) => a.startsWith(q)).map(([a, c]) => ({ k: c, d: 'alias utente ' + a, a }))].slice(0, 12);
    if (!acItems.length) { hideAC(); return; } acIdx = 0; box.classList.remove('hidden');
    box.innerHTML = acItems.map((it, i) => `<div class="${i === acIdx ? 'active' : ''}" data-i="${i}"><b>${it.k}</b><span class="faint">${App.esc(it.a)}</span><span class="muted" style="flex:1;text-align:right">${App.esc(it.d)}</span></div>`).join('');
    $$('div', box).forEach(d => d.onmousedown = e => { e.preventDefault(); $('#cmdInput').value = ''; hideAC(); run(acItems[+d.dataset.i].k); });
  }
  function hideAC() { const b = $('#cmdAC'); if (b) b.classList.add('hidden'); acItems = []; }

  /* ---------- pannelli ---------- */
  let sideTab = 'layers';
  function showTab(t) { sideTab = t; $$('.side-tabs button', host.closest('.module')).forEach(b => b.classList.toggle('active', b.dataset.st === t)); updatePanels(); }
  function updatePanels() {
    const body = $('#cadSide'); if (!body) return;
    if (sideTab === 'layers') renderLayers(body); else if (sideTab === 'props') renderProps(body); else if (sideTab === 'blocks') renderBlocks(body); else if (sideTab === 'ai') renderAI(body);
    const sc = $('#selCount'); if (sc) sc.textContent = sel.size ? `${sel.size} selezionati` : '';
  }
  CAD.updatePanels = updatePanels;
  function renderLayers(body) {
    if (CAD.refreshRibbonLayers) CAD.refreshRibbonLayers();
    const cnt = n => D.entities.filter(e => e.layer === n).length;
    body.innerHTML = `<div class="row between"><div class="sec-t" style="margin:0">Layer del disegno</div><button class="btn sm" id="addLayer">${App.icon('plus', 14)} Nuovo</button></div><div style="margin-top:8px">` +
      D.layers.map(l => `<div class="layer-row ${l.name === D.current ? 'cur' : ''}" data-l="${App.esc(l.name)}">
        <input type="radio" name="curL" ${l.name === D.current ? 'checked' : ''} title="Layer corrente">
        <button class="ib ${l.visible ? '' : 'off'}" data-a="visible" title="Acceso/spento">${App.icon('eye', 15)}</button>
        <button class="ib ${l.frozen ? '' : 'off'}" data-a="frozen" title="Congelato">${App.icon('snow', 15)}</button>
        <button class="ib ${l.locked ? '' : 'off'}" data-a="locked" title="Bloccato">${App.icon('lock', 15)}</button>
        <input type="color" value="${l.color}" title="Colore">
        <span class="ln" title="Doppio clic per rinominare">${App.esc(l.name)}</span><span class="tiny faint">${cnt(l.name)}</span>
        <select class="lt" style="width:64px;padding:2px;font-size:11px" title="Tipo linea">${['continuous', 'dashed', 'dotted', 'dashdot'].map(t => `<option value="${t}" ${l.ltype === t ? 'selected' : ''}>${{ continuous: '———', dashed: '– – –', dotted: '·····', dashdot: '–·–·' }[t]}</option>`).join('')}</select>
      </div>`).join('') + `</div><div class="sec-t">Selezione</div><div class="small muted">${sel.size ? sel.size + ' oggetti selezionati' : 'Nessuna selezione. Clic per selezionare, trascina per finestra (→) o intersezione (←).'}</div>
      ${sel.size ? `<div class="row wrap" style="margin-top:6px"><select id="moveToLayer" style="width:auto">${D.layers.map(l => `<option>${App.esc(l.name)}</option>`).join('')}</select><button class="btn sm" id="moveLayerBtn">Sposta su layer</button></div>` : ''}`;
    $$('.layer-row', body).forEach(r => { const l = D.layers.find(x => x.name === r.dataset.l);
      $('input[type=radio]', r).onchange = () => { D.current = l.name; App.touch(); renderLayers(body); renderStatus(); };
      $$('.ib', r).forEach(b => b.onclick = () => { l[b.dataset.a] = !l[b.dataset.a]; if (b.dataset.a === 'frozen' && l.frozen && D.current === l.name) { App.toast('Il layer corrente non può essere congelato', 'warn'); l.frozen = false; } App.touch(); renderLayers(body); draw(); });
      $('input[type=color]', r).onchange = e => { l.color = e.target.value; App.touch(); draw(); };
      $('.lt', r).onchange = e => { l.ltype = e.target.value; App.touch(); draw(); };
      $('.ln', r).ondblclick = async () => { const f = await App.form('Rinomina layer', [{ name: 'n', label: 'Nome', value: l.name }]); if (f && f.n && !D.layers.some(x => x.name === f.n)) { begin(); D.entities.forEach(e => { if (e.layer === l.name) e.layer = f.n; }); if (D.current === l.name) D.current = f.n; l.name = f.n; commit('Rinomina layer'); renderLayers(body); } };
      r.oncontextmenu = ev => { ev.preventDefault(); App.ctxMenu(ev.clientX, ev.clientY, [{ label: 'Rendi corrente', action: () => { D.current = l.name; renderLayers(body); renderStatus(); } }, { label: 'Seleziona oggetti del layer', action: () => { sel = new Set(D.entities.filter(e => e.layer === l.name).map(e => e.id)); updatePanels(); draw(); } }, { label: App.icon('trash', 14) + ' Elimina layer', disabled: l.name === '0' || cnt(l.name) > 0, action: () => { D.layers = D.layers.filter(x => x !== l); App.touch(); renderLayers(body); } }]); };
    });
    $('#addLayer', body).onclick = async () => { const f = await App.form('Nuovo layer', [{ name: 'n', label: 'Nome', value: 'LAYER' + D.layers.length }, { name: 'c', label: 'Colore', type: 'color', value: '#3d6fe0' }]); if (f && f.n && !D.layers.some(x => x.name === f.n)) { D.layers.push({ name: f.n, color: f.c, visible: true, frozen: false, locked: false, ltype: 'continuous', lw: 1 }); D.current = f.n; App.touch(); renderLayers(body); renderStatus(); } };
    const mb = $('#moveLayerBtn', body); if (mb) mb.onclick = () => { const n = $('#moveToLayer', body).value; begin(); sel.forEach(id => { const e = byId(id); if (e) e.layer = n; }); commit('Cambia layer'); };
  }
  const PROPS = {
    line: [['x1', 'X1'], ['y1', 'Y1'], ['x2', 'X2'], ['y2', 'Y2']], wall: [['x1', 'X1'], ['y1', 'Y1'], ['x2', 'X2'], ['y2', 'Y2'], ['thk', 'Spessore'], ['h', 'Altezza'], ['material', 'Materiale', 's', ['Laterizio', 'Calcestruzzo armato', 'Blocchi in cls', 'Legno X-lam', 'Cartongesso', 'Pietra']]],
    circle: [['cx', 'Centro X'], ['cy', 'Centro Y'], ['r', 'Raggio']], arc: [['cx', 'Centro X'], ['cy', 'Centro Y'], ['r', 'Raggio']],
    text: [['x', 'X'], ['y', 'Y'], ['h', 'Altezza'], ['text', 'Testo', 't'], ['font', 'Font TTF', 's', ['Helvetica, Arial, sans-serif', 'Georgia, serif', 'Courier New, monospace', 'Arial Narrow, sans-serif']]],
    dim: [['off', 'Offset'], ['text', 'Testo forzato', 't']], insert: [['x', 'X'], ['y', 'Y'], ['scale', 'Scala'], ['rotDeg', 'Rotazione °']],
    door: [['width', 'Larghezza'], ['h', 'Altezza'], ['t', 'Posizione (0-1)']], window: [['width', 'Larghezza'], ['h', 'Altezza'], ['sill', 'Davanzale'], ['t', 'Posizione (0-1)']],
    room: [['name', 'Nome', 't'], ['rtype', 'Destinazione', 's', CAD.ROOMTYPES], ['h', 'Altezza netta'], ['floor', 'Pavimento', 's', ['Gres', 'Parquet', 'Marmo', 'Resina', 'Cotto']]], pline: [['closed', 'Chiusa', 'b']], solid: [['z0', 'Quota base'], ['h', 'Altezza']]
  };
  function renderProps(body) {
    const ents = [...sel].map(byId).filter(Boolean);
    if (!ents.length) { body.innerHTML = `<div class="sec-t">Disegno</div><div class="prop-grid"><label>Entità</label><span>${D.entities.length}</span><label>Layer</label><span>${D.layers.length}</span><label>Unità</label><span>metri</span><label>Muri</label><span>${D.entities.filter(e => e.type === 'wall').length}</span><label>Stanze</label><span>${D.entities.filter(e => e.type === 'room').length} · ${App.fnum(D.entities.filter(e => e.type === 'room').reduce((a, e) => a + CAD.area(e), 0))} m²</span><label>Elementi AI</label><span>${D.entities.filter(e => e.ai).length} da verificare</span></div><p class="small muted">Seleziona un oggetto per modificarne le proprietà.</p>`; return; }
    const e = ents[0]; const one = ents.length === 1;
    let html = `<div class="sec-t">${one ? e.type.toUpperCase() : ents.length + ' oggetti'}</div><div class="prop-grid">
      <label>Layer</label><select data-p="layer">${D.layers.map(l => `<option ${l.name === e.layer ? 'selected' : ''}>${App.esc(l.name)}</option>`).join('')}</select>
      <label>Colore</label><div class="row"><input type="color" data-p="color" value="${e.color || layerOf(e.layer).color}"><button class="btn sm ghost" data-reset>DaLayer</button></div>`;
    if (one) {
      (PROPS[e.type] || []).forEach(([k, lab, t, opts]) => { const v = k === 'rotDeg' ? ((e.rot || 0) * 180 / Math.PI) : e[k];
        html += `<label>${lab}</label>` + (t === 's' ? `<select data-p="${k}">${opts.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>` : t === 't' ? `<input type="text" data-p="${k}" value="${App.esc(v ?? '')}">` : t === 'b' ? `<input type="checkbox" data-p="${k}" ${v ? 'checked' : ''} style="width:auto">` : `<input type="number" step="0.01" data-p="${k}" value="${v !== undefined ? +Number(v).toFixed(4) : ''}">`); });
      if (e.type === 'line') html += `<label>Lunghezza</label><span>${App.fnum(G.dist([e.x1, e.y1], [e.x2, e.y2]), 3)} m</span>`;
      if (e.type === 'wall') html += `<label>Lunghezza</label><span>${App.fnum(G.dist([e.x1, e.y1], [e.x2, e.y2]), 3)} m</span><label>Aperture</label><span>${openings(e).length}</span>`;
      if (e.pts) html += `<label>Area</label><span>${App.fnum(Math.abs(G.area(e.pts)), 3)} m²</span><label>Perimetro</label><span>${App.fnum(G.perimeter(e.pts, e.closed || e.type !== 'pline'), 3)} m</span>`;
      if (e.type === 'room') { const win = D.entities.filter(o => o.type === 'window' && CAD.openingRooms(o).includes(e.id)); const fa = win.reduce((a, w) => a + w.width * (w.h || 1.4), 0); html += `<label>Sup. finestrata</label><span>${App.fnum(fa)} m² (RAI 1/${fa ? App.fnum(CAD.area(e) / fa, 1) : '∞'})</span><label>Volume</label><span>${App.fnum(CAD.area(e) * (e.h || 2.7))} m³</span>`; }
      if (e.type === 'insert') { html += `<label>Blocco</label><span>${App.esc(e.name)}</span>`; Object.entries(e.attrs || {}).forEach(([k, v]) => html += `<label>Attr. ${App.esc(k)}</label><input type="text" data-attr="${App.esc(k)}" value="${App.esc(v)}">`); }
      if (e.author) { const u = App.state.users.find(u => u.id === e.author); html += `<label>Autore</label><span>${App.esc(u ? u.name : e.author)}</span>`; }
      if (e.ai) html += `<label>Stato</label><span class="pill ai">Generato da AI – da verificare</span>`;
    }
    html += '</div>';
    if (one && e.type === 'insert') html += `<button class="btn sm" id="addAttr" style="margin-top:8px">${App.icon('plus', 13)} Attributo</button>`;
    if (one && (e.type === 'door')) html += `<div class="row" style="margin-top:10px"><button class="btn sm" id="flipD">Inverti cerniera</button><button class="btn sm" id="sideD">Inverti verso</button></div>`;
    body.innerHTML = html;
    $$('[data-p]', body).forEach(inp => inp.onchange = () => { const k = inp.dataset.p; begin(); ents.forEach(x => { if (k === 'layer') x.layer = inp.value; else if (k === 'color') x.color = inp.value; else if (k === 'rotDeg') x.rot = parseFloat(inp.value) * Math.PI / 180; else if (inp.type === 'number') x[k] = parseFloat(inp.value); else if (inp.type === 'checkbox') x[k] = inp.checked; else x[k] = inp.value; if (x.type === 'door' || x.type === 'window') x.t = Math.max(0, Math.min(1, x.t)); }); resolveDims(); commit('Modifica proprietà ' + k); });
    $$('[data-attr]', body).forEach(inp => inp.onchange = () => { begin(); e.attrs[inp.dataset.attr] = inp.value; commit('Modifica attributo'); });
    const rb = $('[data-reset]', body); if (rb) rb.onclick = () => { begin(); ents.forEach(x => delete x.color); commit('Colore DaLayer'); };
    const aa = $('#addAttr', body); if (aa) aa.onclick = async () => { const f = await App.form('Nuovo attributo', [{ name: 'k', label: 'Etichetta' }, { name: 'v', label: 'Valore' }]); if (f && f.k) { begin(); e.attrs = e.attrs || {}; e.attrs[f.k] = f.v; commit('Aggiungi attributo'); } };
    const fd = $('#flipD', body); if (fd) { fd.onclick = () => { begin(); e.flip = !e.flip; commit('Inverti porta'); }; $('#sideD', body).onclick = () => { begin(); e.side = -(e.side || 1); commit('Inverti porta'); }; }
  }
  function renderBlocks(body) {
    const thumb = (b) => { const pts = b.ents.flatMap(e => segsOf(e).flat()); const bb = G.bbox(pts.length ? pts : [[0, 0], [1, 1]]); const s = 46 / Math.max(bb[2] - bb[0], bb[3] - bb[1], .01); return `<svg width="56" height="56" viewBox="-5 -5 56 56"><g fill="none" stroke="#3a4356" stroke-width="1">${b.ents.flatMap(segsOf).map(sg => `<line x1="${(sg[0][0] - bb[0]) * s}" y1="${46 - (sg[0][1] - bb[1]) * s}" x2="${(sg[1][0] - bb[0]) * s}" y2="${46 - (sg[1][1] - bb[1]) * s}"/>`).join('')}</g></svg>`; };
    const all = { ...CAD.LIB, ...(D.blocks || {}) };
    body.innerHTML = `<div class="sec-t">Libreria blocchi (arredi e simboli)</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${Object.entries(all).map(([n, b]) => `<button class="btn" data-b="${App.esc(n)}" style="flex-direction:column;height:auto;padding:8px;white-space:normal">${thumb(b)}<span class="tiny">${App.esc(n)}</span></button>`).join('')}</div>
      <p class="small muted">Clic per inserire. Il comando CREABLOCCO (B) crea un blocco dalla selezione.</p>`;
    $$('[data-b]', body).forEach(b => b.onclick = () => CAD.insertBlock(b.dataset.b));
  }
  function renderAI(body) {
    body.innerHTML = `<div class="sec-t">Assistente comandi CAD</div><p class="small muted">Descrivi l'operazione in linguaggio naturale: l'assistente la traduce in comandi CAD con log annullabile. Funziona offline con un interprete a regole.</p>
      <textarea id="aiCmd" rows="3" placeholder="es. disegna un muro da 0,0 a 6,0 spesso 30 cm&#10;es. disegna un rettangolo 5x4 in 10,0&#10;es. sposta la selezione di 2 m a destra"></textarea>
      <div class="row" style="margin-top:6px"><button class="btn primary sm" id="aiGo">${App.icon('send', 14)} Esegui</button><span class="tiny faint">Crediti: 0 (locale)</span></div>
      <div class="sec-t">Log azioni AI</div><div id="aiLog" class="small"></div>`;
    const logEl = $('#aiLog', body); (CAD.aiLog || []).slice().reverse().forEach(l => logEl.insertAdjacentHTML('beforeend', `<div class="list-item" style="padding:6px 8px">${App.esc(l.text)}<span class="grow"></span><span class="pill ${l.ok ? 'ok' : 'err'}">${l.ok ? l.n + ' op.' : 'non capito'}</span>${l.ok ? `<button class="btn sm ghost" data-u="${l.id}">Annulla</button>` : ''}</div>`));
    $$('[data-u]', logEl).forEach(b => b.onclick = () => { doUndo(); b.disabled = true; });
    $('#aiGo', body).onclick = () => { const t = $('#aiCmd', body).value.trim(); if (!t) return; const r = CAD.nlCommand(t); CAD.aiLog = CAD.aiLog || []; CAD.aiLog.push({ id: App.uid(), text: t, ok: r > 0, n: r }); renderAI(body); };
  }
  /** interprete NL → comandi CAD (regole) */
  CAD.nlCommand = text => {
    const t = text.toLowerCase(); const nums = (t.match(/-?\d+(\.\d+)?/g) || []).map(Number); let n = 0;
    const cm = /(\d+(\.\d+)?)\s*cm/.exec(t); const thk = cm ? +cm[1] / 100 : 0.3;
    begin();
    if (/muro|parete/.test(t) && nums.length >= 4) { add({ type: 'wall', x1: nums[0], y1: nums[1], x2: nums[2], y2: nums[3], thk, h: 3, layer: 'MURI', ai: true }); n = 1; }
    else if (/rettangol|stanza|locale/.test(t) && nums.length >= 2) { const [w, h] = nums; const x = nums[2] || 0, y = nums[3] || 0; if (/stanza|locale/.test(t)) add({ type: 'room', pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], name: 'Stanza', h: 2.7, layer: 'STANZE', ai: true }); else add({ type: 'pline', pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true, ai: true }); n = 1; }
    else if (/cerchi/.test(t) && nums.length >= 1) { const r = /diametro/.test(t) ? nums[0] / 2 : nums[0]; add({ type: 'circle', cx: nums[1] || 0, cy: nums[2] || 0, r, ai: true }); n = 1; }
    else if (/linea/.test(t) && nums.length >= 4) { add({ type: 'line', x1: nums[0], y1: nums[1], x2: nums[2], y2: nums[3], ai: true }); n = 1; }
    else if (/sposta/.test(t) && nums.length >= 1 && sel.size) { const d = nums[0]; const v = /sinistra/.test(t) ? [-d, 0] : /alto|su\b|nord/.test(t) ? [0, d] : /basso|giù|sud/.test(t) ? [0, -d] : [d, 0]; n = transformSel([...sel], q => [q[0] + v[0], q[1] + v[1]]).length; }
    else if (/ruota/.test(t) && nums.length >= 1 && sel.size) { const ids = [...sel]; const b = G.bbox(ids.map(byId).flatMap(e => segsOf(e).flat())); const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; const a = nums[0] * Math.PI / 180; n = transformSel(ids, q => G.rot(q, c, a), 1, a).length; }
    else if (/(cancella|elimina)/.test(t) && sel.size) { n = sel.size; delIds([...sel]); }
    else if (/(cancella|elimina).*(ai|generat)/.test(t)) { const ids = D.entities.filter(e => e.ai).map(e => e.id); n = ids.length; delIds(ids); }
    else if (/testo|scrivi/.test(t)) { const m = text.match(/["“](.+?)["”]/); add({ type: 'text', x: nums[0] || 0, y: nums[1] || 0, h: .4, text: m ? m[1] : text.replace(/^(scrivi|testo)\s*/i, ''), rot: 0, layer: 'TESTI', ai: true }); n = 1; }
    else if (/(arredi|letto|divano|tavolo|wc|lavabo|doccia|vasca|cucina|armadio)/.test(t)) { const name = Object.keys(CAD.LIB).find(k => t.includes(k.toLowerCase().split(' ')[0].slice(0, 5))); if (name) { add({ type: 'insert', name, x: nums[0] || 0, y: nums[1] || 0, rot: (nums[2] || 0) * Math.PI / 180, scale: 1, layer: 'ARREDI', ai: true }); n = 1; } }
    if (n) { commit('Assistente AI: ' + text.slice(0, 40)); log('AI › ' + text, 'res'); } else { baseline = null; log('AI: richiesta non compresa. Esempi: "muro da 0,0 a 5,0 spesso 25 cm", "rettangolo 4x3 in 2,2", "sposta di 1 a sinistra"', 'err'); }
    return n;
  };
  /** stanze adiacenti a un'apertura */
  CAD.openingRooms = o => { const g = openingGeom(o); if (!g) return []; const probes = [G.add(g.c, G.mul(g.n, g.thk / 2 + .15)), G.sub(g.c, G.mul(g.n, g.thk / 2 + .15))]; return D.entities.filter(e => e.type === 'room' && probes.some(p => G.pip(p, e.pts))).map(e => e.id); };

  function renderStatus() {
    const s = $('#cadStatus'); if (!s) return;
    $$('button[data-t]', s).forEach(b => b.classList.toggle('on', !!settings[b.dataset.t]));
    const cl = $('#curLayer'); if (cl) cl.textContent = 'Layer: ' + D.current;
  }

  /* ---------- DXF ---------- */
  const ACI = { 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#1d2433', 8: '#808080', 9: '#c0c0c0', 30: '#ff7f00', 40: '#ffbf00', 140: '#007fff', 250: '#333333' };
  const hexToAci = hex => { let best = 7, bd = Infinity; const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); for (const k in ACI) { const c = ACI[k].replace('#', ''); const d = (r - parseInt(c.slice(0, 2), 16)) ** 2 + (g - parseInt(c.slice(2, 4), 16)) ** 2 + (b - parseInt(c.slice(4, 6), 16)) ** 2; if (d < bd) { bd = d; best = +k; } } return best; };
  CAD.readDXF = (text) => {
    const L = text.split(/\r?\n/); const pairs = []; for (let i = 0; i + 1 < L.length; i += 2) pairs.push([parseInt(L[i].trim(), 10), L[i + 1].trim()]);
    const out = { layers: [], entities: [], blocks: {}, warnings: [] }; let sec = null, i = 0;
    const readEnt = (type) => { const e = { _t: type, g: {} , v: [] }; i++; while (i < pairs.length && pairs[i][0] !== 0) { const [c, v] = pairs[i]; if ((type === 'LWPOLYLINE' || type === 'SPLINE' || type === 'LEADER' || type === 'HATCH') && c === 10) e.v.push([+v, 0]); else if ((type === 'LWPOLYLINE' || type === 'SPLINE' || type === 'LEADER' || type === 'HATCH') && c === 20 && e.v.length) e.v[e.v.length - 1][1] = +v; else if (c === 1 && e.g[1] !== undefined) e.g[1] += '\n' + v; else if (e.g[c] === undefined) e.g[c] = v; i++; } return e; };
    const conv = (e) => { const g = e.g, lay = g[8] || '0', col = g[62] && ACI[+g[62]] ? ACI[+g[62]] : undefined; const base = { id: App.uid(), layer: lay }; if (col) base.color = col;
      switch (e._t) {
        case 'LINE': return { ...base, type: 'line', x1: +g[10], y1: +g[20], x2: +g[11], y2: +g[21] };
        case 'CIRCLE': return { ...base, type: 'circle', cx: +g[10], cy: +g[20], r: +g[40] };
        case 'ARC': return { ...base, type: 'arc', cx: +g[10], cy: +g[20], r: +g[40], a1: +g[50] * Math.PI / 180, a2: +g[51] * Math.PI / 180 };
        case 'LWPOLYLINE': return { ...base, type: 'pline', pts: e.v, closed: (+g[70] & 1) === 1 };
        case 'TEXT': return { ...base, type: 'text', x: +g[10], y: +g[20], h: +g[40] || .25, text: g[1] || '', rot: (+g[50] || 0) * Math.PI / 180 };
        case 'MTEXT': return { ...base, type: /\\P/.test(g[1] || '') ? 'mtext' : 'text', x: +g[10], y: +g[20], h: +g[40] || .25, text: (g[1] || '').replace(/\\P/g, '\n').replace(/\{\\[^;]*;|\}|\\[A-Za-z][^;]*;/g, ''), rot: (+g[50] || 0) * Math.PI / 180 };
        case 'POINT': return { ...base, type: 'point', x: +g[10], y: +g[20] };
        case 'INSERT': return { ...base, type: 'insert', name: g[2], x: +g[10], y: +g[20], scale: +g[41] || 1, rot: (+g[50] || 0) * Math.PI / 180 };
        case 'ELLIPSE': { const mx = +g[11], my = +g[21], rx = Math.hypot(mx, my); const a1 = +g[41] || 0, a2 = g[42] !== undefined ? +g[42] : Math.PI * 2; const full = Math.abs(a2 - a1 - Math.PI * 2) < 1e-6; return { ...base, type: 'ellipse', cx: +g[10], cy: +g[20], rx, ry: rx * (+g[40] || 1), rot: Math.atan2(my, mx), ...(full ? {} : { a1, a2 }) }; }
        case 'SPLINE': return e.v.length > 1 ? { ...base, type: 'spline', pts: e.v, closed: (+g[70] & 1) === 1 } : null;
        case 'LEADER': return e.v.length > 1 ? { ...base, type: 'leader', pts: e.v, text: '' } : null;
        case 'HATCH': return e.v.length > 2 ? { ...base, type: 'hatch', pts: e.v.slice(1), pattern: /SOLID/i.test(g[2] || '') ? 'solid' : 'ansi31', scale: .1 } : null;
        case 'DIMENSION': return { ...base, type: 'dim', x1: +g[13] || 0, y1: +g[23] || 0, x2: +g[14] || 0, y2: +g[24] || 0, off: .5 };
        default: return null; } };
    while (i < pairs.length) {
      const [c, v] = pairs[i];
      if (c === 0 && v === 'SECTION') { sec = pairs[i + 1][1]; i += 2; continue; }
      if (c === 0 && v === 'ENDSEC') { sec = null; i++; continue; }
      if (sec === 'TABLES' && c === 0 && v === 'LAYER') { const e = readEnt('LAYER'); if (e.g[2]) out.layers.push({ name: e.g[2], color: ACI[Math.abs(+e.g[62] || 7)] || '#1d2433', visible: +(e.g[62] || 7) >= 0, frozen: (+e.g[70] & 1) === 1, locked: (+e.g[70] & 4) === 4, ltype: /DASH|HIDDEN|TRAT/i.test(e.g[6] || '') ? 'dashed' : 'continuous', lw: 1 }); continue; }
      if (sec === 'BLOCKS' && c === 0 && v === 'BLOCK') { const b = readEnt('BLOCK'); const name = b.g[2], bx = +b.g[10] || 0, by = +b.g[20] || 0; const ents = [];
        while (i < pairs.length && !(pairs[i][0] === 0 && pairs[i][1] === 'ENDBLK')) { if (pairs[i][0] === 0) { const t = pairs[i][1]; if (t === 'POLYLINE') { const ev = readPoly(); if (ev) ents.push(ev); continue; } const e = readEnt(t); const ce = conv(e); if (ce) { delete ce.id; delete ce.layer; ents.push(xformEnt(ce, q => [q[0] - bx, q[1] - by])); } } else i++; }
        if (name && !name.startsWith('*')) out.blocks[name] = { ents }; i++; continue; }
      if (sec === 'ENTITIES' && c === 0) { if (v === 'POLYLINE') { const e = readPoly(); if (e) out.entities.push(e); continue; } const e = readEnt(v); const ce = conv(e); if (ce) out.entities.push(ce); else if (!['SEQEND', 'VERTEX', 'ENDSEC', 'EOF'].includes(v)) out.warnings.push(v); continue; }
      i++;
    }
    function readPoly() { const h = readEnt('POLYLINE'); const pts = []; while (i < pairs.length && pairs[i][1] === 'VERTEX') { const v = readEnt('VERTEX'); pts.push([+v.g[10], +v.g[20]]); } if (pairs[i] && pairs[i][1] === 'SEQEND') readEnt('SEQEND'); return pts.length ? { id: App.uid(), type: 'pline', layer: h.g[8] || '0', pts, closed: (+h.g[70] & 1) === 1 } : null; }
    return out;
  };
  CAD.writeDXF = (drawing = D) => {
    const o = []; const p = (c, v) => o.push(String(c), String(v));
    const f = v => (+v).toFixed(6);
    p(999, 'BeCity CAD Core – DXF R12 ASCII'); p(0, 'SECTION'); p(2, 'HEADER'); p(9, '$ACADVER'); p(1, 'AC1009'); p(9, '$INSUNITS'); p(70, 6); p(0, 'ENDSEC');
    p(0, 'SECTION'); p(2, 'TABLES'); p(0, 'TABLE'); p(2, 'LTYPE'); p(70, 2); p(0, 'LTYPE'); p(2, 'CONTINUOUS'); p(70, 0); p(3, 'Solid line'); p(72, 65); p(73, 0); p(40, 0); p(0, 'LTYPE'); p(2, 'DASHED'); p(70, 0); p(3, '__ __ __'); p(72, 65); p(73, 2); p(40, 0.75); p(49, 0.5); p(49, -0.25); p(0, 'ENDTAB');
    p(0, 'TABLE'); p(2, 'LAYER'); p(70, drawing.layers.length); drawing.layers.forEach(l => { p(0, 'LAYER'); p(2, l.name.replace(/[<>\/\\":;?*|=']/g, '_')); p(70, (l.frozen ? 1 : 0) | (l.locked ? 4 : 0)); p(62, (l.visible ? 1 : -1) * hexToAci(l.color)); p(6, l.ltype === 'continuous' ? 'CONTINUOUS' : 'DASHED'); }); p(0, 'ENDTAB'); p(0, 'ENDSEC');
    const blocks = {}; drawing.entities.filter(e => e.type === 'insert').forEach(e => blocks[e.name] = (drawing.blocks && drawing.blocks[e.name]) || CAD.LIB[e.name]);
    p(0, 'SECTION'); p(2, 'BLOCKS'); Object.entries(blocks).forEach(([n, b]) => { if (!b) return; p(0, 'BLOCK'); p(8, '0'); p(2, n); p(70, 0); p(10, 0); p(20, 0); p(30, 0); p(3, n); b.ents.forEach(e => writeEnt({ ...e, layer: '0' })); p(0, 'ENDBLK'); p(8, '0'); }); p(0, 'ENDSEC');
    p(0, 'SECTION'); p(2, 'ENTITIES');
    function common(e) { p(8, (e.layer || '0').replace(/[<>\/\\":;?*|=']/g, '_')); if (e.color) p(62, hexToAci(e.color)); }
    function pl(e, pts, closed) { p(0, 'POLYLINE'); common(e); p(66, 1); p(10, 0); p(20, 0); p(30, 0); p(70, closed ? 1 : 0); pts.forEach(q => { p(0, 'VERTEX'); common(e); p(10, f(q[0])); p(20, f(q[1])); p(30, 0); }); p(0, 'SEQEND'); common(e); }
    function line(e, a, b) { p(0, 'LINE'); common(e); p(10, f(a[0])); p(20, f(a[1])); p(30, 0); p(11, f(b[0])); p(21, f(b[1])); p(31, 0); }
    function writeEnt(e) {
      switch (e.type) {
        case 'line': line(e, [e.x1, e.y1], [e.x2, e.y2]); break;
        case 'pline': case 'room': case 'solid': pl(e, e.pts, e.closed || e.type !== 'pline'); if (e.type === 'room') { const c = e.label || G.centroid(e.pts); p(0, 'TEXT'); common(e); p(10, f(c[0])); p(20, f(c[1])); p(30, 0); p(40, .25); p(1, `${e.name} ${App.fnum(CAD.area(e))} mq`); } break;
        case 'ellipse': pl(e, ellPts(e, 72), e.a1 == null); break;
        case 'spline': pl(e, splPts(e.pts, e.closed, 10), !!e.closed); break;
        case 'point': p(0, 'POINT'); common(e); p(10, f(e.x)); p(20, f(e.y)); p(30, 0); break;
        case 'mtext': mtLines(e).forEach((l, i) => { p(0, 'TEXT'); common(e); p(10, f(e.x)); p(20, f(e.y - (i + 1) * e.h * 1.45 + e.h * .45)); p(30, 0); p(40, f(e.h)); p(1, l); }); break;
        case 'leader': pl(e, e.pts, false); if (e.text) { const q = e.pts[e.pts.length - 1]; p(0, 'TEXT'); common(e); p(10, f(q[0])); p(20, f(q[1])); p(30, 0); p(40, f(e.h || .25)); p(1, e.text); } break;
        case 'dimr': { const q = [e.cx + e.r * Math.cos(e.ang), e.cy + e.r * Math.sin(e.ang)]; line(e, [e.cx, e.cy], q); p(0, 'TEXT'); common(e); p(10, f((e.cx + q[0]) / 2)); p(20, f((e.cy + q[1]) / 2)); p(30, 0); p(40, .2); p(1, (e.dia ? '%%c' : 'R') + App.fnum(e.dia ? e.r * 2 : e.r)); break; }
        case 'hatch': { pl(e, e.pts, true); (e.holes || []).forEach(h => pl(e, h, true)); if (e.pattern !== 'solid') { const bb = G.bbox(e.pts); const sp = e.scale || .1; const fam = e.pattern === 'ansi37' ? [Math.PI / 4, -Math.PI / 4] : e.pattern === 'net' || e.pattern === 'brick' ? [0, Math.PI / 2] : [Math.PI / 4]; const R = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]); const c0 = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
          fam.forEach(a => { const d = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]]; for (let k = -R; k <= R; k += sp) { const A = [c0[0] + n[0] * k - d[0] * R, c0[1] + n[1] * k - d[1] * R], B = [c0[0] + n[0] * k + d[0] * R, c0[1] + n[1] * k + d[1] * R]; const ts = []; [e.pts, ...(e.holes || [])].forEach(r => r.forEach((q, i) => { const it = G.segInt(A, B, q, r[(i + 1) % r.length]); if (it) ts.push(it.t); })); ts.sort((x, y) => x - y); for (let j = 0; j + 1 < ts.length; j += 2) line({ ...e }, G.lerp(A, B, ts[j]), G.lerp(A, B, ts[j + 1])); } }); } break; }
        case 'circle': p(0, 'CIRCLE'); common(e); p(10, f(e.cx)); p(20, f(e.cy)); p(30, 0); p(40, f(e.r)); break;
        case 'arc': p(0, 'ARC'); common(e); p(10, f(e.cx)); p(20, f(e.cy)); p(30, 0); p(40, f(e.r)); p(50, f(e.a1 * 180 / Math.PI)); p(51, f(e.a2 * 180 / Math.PI)); break;
        case 'text': p(0, 'TEXT'); common(e); p(10, f(e.x)); p(20, f(e.y)); p(30, 0); p(40, f(e.h)); p(1, e.text); p(50, f((e.rot || 0) * 180 / Math.PI)); break;
        case 'insert': p(0, 'INSERT'); common(e); p(2, e.name); p(10, f(e.x)); p(20, f(e.y)); p(30, 0); p(41, f(e.scale || 1)); p(42, f(e.scale || 1)); p(50, f((e.rot || 0) * 180 / Math.PI)); break;
        case 'dim': { const a = [e.x1, e.y1], b = [e.x2, e.y2]; const n = G.perp(G.norm(G.sub(b, a))); let A = G.add(a, G.mul(n, e.off)), B = G.add(b, G.mul(n, e.off)); if (e.lin) { A = e.lin === 'h' ? [a[0], e.at] : [e.at, a[1]]; B = e.lin === 'h' ? [b[0], e.at] : [e.at, b[1]]; } line(e, a, A); line(e, b, B); line(e, A, B); const m = G.lerp(A, B, .5); p(0, 'TEXT'); common(e); p(10, f(m[0])); p(20, f(m[1] + .05)); p(30, 0); p(40, .2); p(1, e.text || App.fnum(G.dist(a, b))); p(50, f(Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI)); break; }
        case 'wall': { if (!D || drawing !== D) { pl(e, wallPts(e), true); break; } segsOfWallOutline(e).forEach(s => line(e, s[0], s[1])); break; }
        case 'door': case 'window': { const g = openingGeom(e); if (!g) break; const h = g.thk / 2; line(e, G.add(g.p1, G.mul(g.n, h)), G.sub(g.p1, G.mul(g.n, h))); line(e, G.add(g.p2, G.mul(g.n, h)), G.sub(g.p2, G.mul(g.n, h))); if (e.type === 'window') { line(e, G.add(g.p1, G.mul(g.n, h * .35)), G.add(g.p2, G.mul(g.n, h * .35))); line(e, G.sub(g.p1, G.mul(g.n, h * .35)), G.sub(g.p2, G.mul(g.n, h * .35))); } else { const side = e.side || 1; const hinge = e.flip ? g.p2 : g.p1; const hp = G.add(hinge, G.mul(g.n, side * h)); const leaf = G.add(hp, G.mul(g.n, side * e.width)); line(e, hp, leaf); } break; }
      }
    }
    drawing.entities.forEach(writeEnt);
    p(0, 'ENDSEC'); p(0, 'EOF');
    return o.join('\r\n');
  };
  function segsOfWallOutline(w) { // contorno muro con aperture
    const a = [w.x1, w.y1], b = [w.x2, w.y2], L = G.dist(a, b), d = G.norm(G.sub(b, a)), n = G.perp(d), h = w.thk / 2;
    const ops = openings(w).map(o => [o.t * L - o.width / 2, o.t * L + o.width / 2]).sort((x, y) => x[0] - y[0]); const pcs = []; let s = 0; ops.forEach(([o0, o1]) => { if (o0 > s) pcs.push([s, o0]); s = Math.max(s, o1); }); if (s < L) pcs.push([s, L]);
    const P = (t, k) => G.add(G.add(a, G.mul(d, t)), G.mul(n, k)); const out = [];
    pcs.forEach(([t0, t1]) => { out.push([P(t0, h), P(t1, h)], [P(t0, -h), P(t1, -h)], [P(t0, h), P(t0, -h)], [P(t1, h), P(t1, -h)]); }); return out;
  }
  CAD.importDXF = async () => {
    const [f] = await App.pickFiles({ accept: '.dxf,.DXF' }); if (!f) return;
    try { const txt = await App.readText(f); if (/^AutoCAD Binary DXF/.test(txt)) { App.toast('DXF binario: conversione non inclusa in questa build. Salvare in DXF ASCII.', 'warn'); return; }
      const r = CAD.readDXF(txt); begin();
      r.layers.forEach(l => { if (!D.layers.some(x => x.name === l.name)) D.layers.push(l); });
      r.entities.forEach(e => { if (!D.layers.some(x => x.name === e.layer)) D.layers.push({ name: e.layer, color: '#1d2433', visible: true, frozen: false, locked: false, ltype: 'continuous', lw: 1 }); D.entities.push(e); });
      D.blocks = Object.assign(D.blocks || {}, r.blocks);
      commit('Importa DXF ' + f.name); zoomExtents();
      App.toast(`DXF importato: ${r.entities.length} entità, ${r.layers.length} layer, ${Object.keys(r.blocks).length} blocchi${r.warnings.length ? ' · ignorati: ' + [...new Set(r.warnings)].slice(0, 5).join(', ') : ''}`, 'ok');
    } catch (e) { console.error(e); App.toast('Errore DXF: ' + e.message, 'err'); }
  };
  CAD.exportSVG = (drawing = D) => {
    const pts = []; drawing.entities.forEach(e => { const b = bboxOf(e); if (b) pts.push([b[0], b[1]], [b[2], b[3]]); }); const bb = pts.length ? G.bbox(pts) : [0, 0, 10, 10]; const m = 1;
    const X = x => (x - bb[0] + m).toFixed(4), Y = y => (bb[3] - y + m).toFixed(4);
    const el = e => { const col = e.color || layerOf(e.layer).color; const st = `stroke="${col}" fill="none" stroke-width="0.02"`;
      switch (e.type) { case 'line': return `<line x1="${X(e.x1)}" y1="${Y(e.y1)}" x2="${X(e.x2)}" y2="${Y(e.y2)}" ${st}/>`; case 'pline': case 'room': case 'solid': return `<polyline points="${e.pts.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}${e.closed || e.type !== 'pline' ? ' ' + X(e.pts[0][0]) + ',' + Y(e.pts[0][1]) : ''}" ${e.type === 'room' ? `fill="${col}" fill-opacity=".08" stroke="${col}" stroke-width=".01"` : st}/>` + (e.type === 'room' ? `<text x="${X(G.centroid(e.pts)[0])}" y="${Y(G.centroid(e.pts)[1])}" font-size=".3" text-anchor="middle" fill="#14213d">${App.esc(e.name)} ${App.fnum(CAD.area(e))} m²</text>` : '');
        case 'circle': return `<circle cx="${X(e.cx)}" cy="${Y(e.cy)}" r="${e.r}" ${st}/>`; case 'text': return `<text x="${X(e.x)}" y="${Y(e.y)}" font-size="${e.h}" fill="${col}" transform="rotate(${-(e.rot || 0) * 180 / Math.PI} ${X(e.x)} ${Y(e.y)})">${App.esc(e.text)}</text>`;
        case 'wall': return segsOfWallOutline(e).map(s => `<line x1="${X(s[0][0])}" y1="${Y(s[0][1])}" x2="${X(s[1][0])}" y2="${Y(s[1][1])}" stroke="${col}" stroke-width=".04"/>`).join('');
        default: return segsOf(e).map(s => `<line x1="${X(s[0][0])}" y1="${Y(s[0][1])}" x2="${X(s[1][0])}" y2="${Y(s[1][1])}" ${st}/>`).join(''); } };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(bb[2] - bb[0] + 2 * m).toFixed(3)} ${(bb[3] - bb[1] + 2 * m).toFixed(3)}" width="${(bb[2] - bb[0] + 2 * m) * 10}mm" height="${(bb[3] - bb[1] + 2 * m) * 10}mm"><rect width="100%" height="100%" fill="#fff"/>${D.layers.filter(l => l.visible && !l.frozen).map(l => `<g id="${App.esc(l.name)}">${drawing.entities.filter(e => e.layer === l.name).map(el).join('')}</g>`).join('')}</svg>`;
  };
  CAD.exportCSV = () => {
    const rows = D.entities.map(e => ({ id: e.id, tipo: e.type, layer: e.layer, nome: e.name || e.text || '', lunghezza: e.type === 'line' || e.type === 'wall' ? +G.dist([e.x1, e.y1], [e.x2, e.y2]).toFixed(3) : '', area: e.pts ? +Math.abs(G.area(e.pts)).toFixed(3) : e.type === 'circle' ? +(Math.PI * e.r * e.r).toFixed(3) : '', perimetro: e.pts ? +G.perimeter(e.pts, e.closed || e.type !== 'pline').toFixed(3) : '', spessore: e.thk || '', altezza: e.h || '', larghezza: e.width || '', materiale: e.material || e.floor || '', blocco: e.type === 'insert' ? e.name : '', ai_da_verificare: e.ai ? 'SI' : '', autore: (App.state.users.find(u => u.id === e.author) || {}).name || '' }));
    return App.geoformats.toCSV(rows, Object.keys(rows[0] || { id: 1 }));
  };
  /** PDF vettoriale della pianta in scala */
  CAD.exportPDF = async () => {
    const f = await App.form('Esporta PDF vettoriale in scala', [{ name: 'fmt', label: 'Formato', type: 'select', options: ['A4', 'A3', 'A2', 'A1'], value: 'A3' }, { name: 'scale', label: 'Scala 1:', type: 'select', options: ['50', '100', '200', '500'], value: '100' }, { name: 'title', label: 'Titolo tavola', value: 'Pianta – ' + App.project().name }], 'Genera PDF');
    if (!f) return; const fm = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] }[f.fmt]; const mm = 72 / 25.4; const sc = 1000 / +f.scale; // mm per metro
    const pts = []; D.entities.filter(visible).forEach(e => { const b = bboxOf(e); if (b) pts.push([b[0], b[1]], [b[2], b[3]]); }); const bb = G.bbox(pts.length ? pts : [[0, 0], [1, 1]]);
    const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2; const W2 = fm[0] * mm, H2 = fm[1] * mm;
    if ((bb[2] - bb[0]) * sc > fm[0] - 20 || (bb[3] - bb[1]) * sc > fm[1] - 40) App.toast('Il disegno eccede il foglio alla scala scelta: verrà ritagliato', 'warn');
    const X = x => (W2 / 2 + (x - cx) * sc * mm).toFixed(2), Y = y => (H2 / 2 + 10 * mm + (y - cy) * sc * mm).toFixed(2);
    const hex = h => { const c = h.replace('#', ''); return [0, 2, 4].map(i => (parseInt(c.slice(i, i + 2), 16) / 255).toFixed(3)).join(' '); };
    let s = '0.5 w 1 J 1 j\n';
    D.entities.filter(visible).forEach(e => { const col = e.color || layerOf(e.layer).color; s += `${hex(col)} RG ${hex(col)} rg\n`;
      if (e.type === 'text') { s += `BT /F1 ${(e.h * sc * mm).toFixed(2)} Tf ${X(e.x)} ${Y(e.y)} Td ${App.pdf.str(e.text)} Tj ET\n`; return; }
      if (e.type === 'room') { const c = G.centroid(e.pts); s += `0.3 0.33 0.4 rg BT /F2 7 Tf ${X(c[0]) - 20} ${Y(c[1])} Td ${App.pdf.str(e.name || '')} Tj ET BT /F1 6 Tf ${X(c[0]) - 20} ${Y(c[1]) - 8} Td ${App.pdf.str(App.fnum(CAD.area(e)) + ' mq')} Tj ET\n`; return; }
      const segs = e.type === 'wall' ? segsOfWallOutline(e) : e.type === 'door' || e.type === 'window' ? [] : segsOf(e);
      if (e.type === 'wall') s += '1.2 w\n'; segs.forEach(sg => s += `${X(sg[0][0])} ${Y(sg[0][1])} m ${X(sg[1][0])} ${Y(sg[1][1])} l S\n`); if (e.type === 'wall') s += '0.5 w\n';
      if (e.type === 'door' || e.type === 'window') { const g = openingGeom(e); if (g) { const h = g.thk / 2; const L = (a, b) => s += `${X(a[0])} ${Y(a[1])} m ${X(b[0])} ${Y(b[1])} l S\n`; L(G.add(g.p1, G.mul(g.n, h)), G.sub(g.p1, G.mul(g.n, h))); L(G.add(g.p2, G.mul(g.n, h)), G.sub(g.p2, G.mul(g.n, h))); if (e.type === 'window') { L(G.add(g.p1, G.mul(g.n, h * .35)), G.add(g.p2, G.mul(g.n, h * .35))); L(G.sub(g.p1, G.mul(g.n, h * .35)), G.sub(g.p2, G.mul(g.n, h * .35))); } else { const side = e.side || 1, hinge = e.flip ? g.p2 : g.p1, hp = G.add(hinge, G.mul(g.n, side * h)); L(hp, G.add(hp, G.mul(g.n, side * e.width))); } } }
      if (e.type === 'dim') { const a = [e.x1, e.y1], b = [e.x2, e.y2], n = G.perp(G.norm(G.sub(b, a))); const A = G.add(a, G.mul(n, e.off)), B = G.add(b, G.mul(n, e.off)); s += `${X(A[0])} ${Y(A[1])} m ${X(B[0])} ${Y(B[1])} l S BT /F1 6 Tf ${X((A[0] + B[0]) / 2)} ${(+Y((A[1] + B[1]) / 2) + 2).toFixed(2)} Td ${App.pdf.str(App.fnum(G.dist(a, b)))} Tj ET\n`; }
    });
    // cartiglio
    s += `0 0 0 RG 0 0 0 rg 1 w ${10 * mm} ${10 * mm} ${(fm[0] - 20) * mm} ${(fm[1] - 20) * mm} re S ${(fm[0] - 130) * mm} ${10 * mm} ${120 * mm} ${28 * mm} re S\nBT /F2 11 Tf ${(fm[0] - 126) * mm} ${30 * mm} Td ${App.pdf.str(f.title)} Tj ET BT /F1 8 Tf ${(fm[0] - 126) * mm} ${22 * mm} Td ${App.pdf.str(`Scala 1:${f.scale} – Formato ${f.fmt} – ${new Date().toLocaleDateString('it-IT')}`)} Tj ET BT /F1 8 Tf ${(fm[0] - 126) * mm} ${15 * mm} Td ${App.pdf.str(App.project().comune ? 'Comune di ' + App.project().comune : '')} Tj ET\n`;
    const bar = 5 * sc * mm; s += `${15 * mm} ${16 * mm} m ${(15 * mm + bar).toFixed(2)} ${16 * mm} l S BT /F1 7 Tf ${15 * mm} ${18 * mm} Td (0) Tj ET BT /F1 7 Tf ${(15 * mm + bar - 6).toFixed(2)} ${18 * mm} Td (5 m) Tj ET\n`;
    App.download(App.slug(f.title) + '.pdf', App.pdf.make([{ w: W2, h: H2, content: s }], { title: f.title }));
  };

  /* ---------- DWG tramite BeCity.exe (acadrust) ---------- */
  const hasDWG = () => !!(App.server && App.server.dwg);
  CAD.loadDXFText = (txt, name, replace) => {
    const r = CAD.readDXF(txt); begin();
    if (replace) { D.entities = []; D.blocks = {}; }
    r.layers.forEach(l => { if (!D.layers.some(x => x.name === l.name)) D.layers.push(l); });
    r.entities.forEach(e => { if (!D.layers.some(x => x.name === e.layer)) D.layers.push({ name: e.layer, color: '#e8ecf2', visible: true, frozen: false, locked: false, ltype: 'continuous', lw: 1 }); D.entities.push(e); });
    D.blocks = Object.assign(D.blocks || {}, r.blocks); commit((replace ? 'Apri ' : 'Importa ') + name); zoomExtents();
    App.toast(`${name}: ${r.entities.length} entità, ${r.layers.length} layer, ${Object.keys(r.blocks).length} blocchi`, 'ok'); App.audit('cad-open', name);
  };
  CAD.openFile = async (replace) => {
    const [f] = await App.pickFiles({ accept: '.dwg,.dxf,.DWG,.DXF' }); if (!f) return;
    try {
      if (/\.dwg$/i.test(f.name)) {
        if (!hasDWG()) { App.toast(App.WEBAPP ? 'Nella WebApp i file DWG non si possono aprire: salvali in DXF dal programma di origine oppure usa BeCity desktop.' : 'I file DWG si aprono avviando BeCity con BeCity.exe (convertitore DWG integrato).', 'warn'); return; }
        App.toast('Lettura DWG…'); const r = await fetch('api/dwg/to-dxf', { method: 'POST', body: await App.readBuf(f) }); if (!r.ok) throw new Error((await r.json()).error || r.statusText);
        CAD.loadDXFText(await r.text(), f.name, replace);
      } else { const txt = await App.readText(f); if (/^AutoCAD Binary DXF/.test(txt)) { if (!hasDWG()) { App.toast('DXF binario: avvia BeCity.exe per convertirlo', 'warn'); return; } const r = await fetch('api/dxf/upgrade', { method: 'POST', body: await App.readBuf(f) }); CAD.loadDXFText(await r.text(), f.name, replace); } else CAD.loadDXFText(txt, f.name, replace); }
      CAD.fileName = f.name;
    } catch (e) { console.error(e); App.toast('Apertura non riuscita: ' + e.message, 'err'); }
  };
  CAD.saveDWG = async (ver = 'AC1032') => {
    const p = App.project(); if (!hasDWG()) { App.toast(App.WEBAPP ? 'Nella WebApp il disegno si salva in DXF (compatibile con AutoCAD e gli altri CAD).' : 'Il salvataggio DWG è disponibile avviando BeCity con BeCity.exe. Intanto puoi salvare in DXF.', 'warn'); return; }
    try { const dxf = CAD.writeDXF(); const r = await fetch('api/dxf/to-dwg?version=' + ver, { method: 'POST', body: dxf }); if (!r.ok) throw new Error((await r.json()).error || r.statusText); App.download((CAD.fileName ? CAD.fileName.replace(/\.\w+$/, '') : App.slug(p.name)) + '.dwg', await r.blob()); App.toast('DWG salvato (' + ({ AC1032: '2018', AC1027: '2013', AC1024: '2010', AC1018: '2004', AC1015: '2000' }[ver] || ver) + ')', 'ok'); }
    catch (e) { App.toast('Salvataggio DWG non riuscito: ' + e.message, 'err'); }
  };
  CAD.saveDXF = async (modern) => { const p = App.project(); const nm = (CAD.fileName ? CAD.fileName.replace(/\.\w+$/, '') : App.slug(p.name)) + '.dxf'; const dxf = CAD.writeDXF(); if (modern && hasDWG()) { const r = await fetch('api/dxf/upgrade', { method: 'POST', body: dxf }); if (r.ok) { App.download(nm, await r.blob()); return; } } App.download(nm, dxf, 'application/dxf'); };

  /* ---------- ribbon ---------- */
  const RB = (cmd, ic, label) => `<button class="rbtn" data-cmd="${cmd}" title="${label} (${(C[cmd] && C[cmd].aliases[0]) || cmd})">${App.icon(ic, 26)}<span>${label}</span></button>`;
  const RS = (cmd, ic, label) => `<button class="rbtn-s" data-cmd="${cmd}" title="${label} (${(C[cmd] && C[cmd].aliases[0]) || cmd})">${App.icon(ic, 16)}${label}</button>`;
  const RA = (act, ic, label, big) => big ? `<button class="rbtn" data-act="${act}" title="${label}">${App.icon(ic, 26)}<span>${label}</span></button>` : `<button class="rbtn-s" data-act="${act}" title="${label}">${App.icon(ic, 16)}${label}</button>`;
  const GRP = (title, items) => `<div class="rgroup"><div class="rgroup-items">${items}</div><div class="rgroup-title">${title}</div></div>`;
  const RIBBON = {
    home: () => GRP('Disegno', RB('LINEA', 'line', 'Linea') + RB('POLILINEA', 'pline', 'Polilinea') + RB('CERCHIO', 'circle', 'Cerchio') + RB('ARCO', 'arc', 'Arco') + `<div class="rcol">${RS('RETTANGOLO', 'rect', 'Rettangolo')}${RS('POLIGONO', 'polygon', 'Poligono')}${RS('ELLISSE', 'ellipse', 'Ellisse')}</div><div class="rcol">${RS('SPLINE', 'spline', 'Spline')}${RS('PUNTO', 'point', 'Punto')}${RS('RETINO', 'hatch', 'Retino')}</div>`)
      + GRP('Modifica', `<div class="rcol">${RS('SPOSTA', 'move', 'Sposta')}${RS('COPIA', 'copy', 'Copia')}${RS('STIRA', 'stretch', 'Stira')}</div><div class="rcol">${RS('RUOTA', 'rotate', 'Ruota')}${RS('SPECCHIO', 'mirror', 'Specchio')}${RS('SCALA', 'zoom', 'Scala')}</div><div class="rcol">${RS('TAGLIA', 'trim', 'Taglia')}${RS('ESTENDI', 'arrow', 'Estendi')}${RS('OFFSET', 'offset', 'Offset')}</div><div class="rcol">${RS('RACCORDO', 'arc', 'Raccordo')}${RS('CIMA', 'chamfer', 'Cima')}${RS('SERIE', 'array', 'Serie')}</div><div class="rcol">${RS('SPEZZA', 'break', 'Spezza')}${RS('UNISCI', 'join', 'Unisci')}${RS('ESPLODI', 'block', 'Esplodi')}</div><div class="rcol">${RS('CANCELLA', 'erase', 'Cancella')}${RS('CORRISPONDENZA', 'match', 'Corrispond.')}</div>`)
      + GRP('Annotazione', RB('TESTOM', 'mtext', 'Testo') + `<div class="rcol">${RS('QUOTALIN', 'dim', 'Lineare')}${RS('QUOTA', 'dim', 'Allineata')}${RS('QUOTARAG', 'circle', 'Raggio')}</div><div class="rcol">${RS('DIRETTRICE', 'leader', 'Direttrice')}${RS('TESTO', 'text', 'Testo riga')}</div>`)
      + GRP('Layer', `<div class="rcol" style="gap:4px;padding-top:4px"><select class="rsel" id="rbLayer" title="Layer corrente" style="min-width:150px"></select><div class="row" style="gap:2px">${RA('layers', 'layers', 'Gestione layer')}</div></div>`)
      + GRP('Blocco', RB('INSERISCI', 'block', 'Inserisci') + `<div class="rcol">${RS('CREABLOCCO', 'plus', 'Crea')}${RA('blocks', 'block', 'Libreria')}</div>`)
      + GRP('Utilità', `<div class="rcol">${RS('DISTANZA', 'ruler', 'Distanza')}${RS('AREA', 'measure', 'Area')}${RS('ID', 'point', 'ID punto')}</div><div class="rcol">${RS('DIVIDI', 'point', 'Dividi')}${RS('MISURA', 'measure', 'Misura')}${RS('LISTA', 'info', 'Lista')}</div>`),
    arch: () => GRP('Costruisci', RB('MURO', 'wall', 'Muro') + RB('PORTA', 'door', 'Porta') + RB('FINESTRA', 'window', 'Finestra') + RB('STANZA', 'room', 'Stanza'))
      + GRP('Automazione', RB('PIANTADABRIEF', 'spark', 'Pianta da brief') + RB('TRACCIA', 'image', 'Traccia scansione') + RB('VALIDA', 'check', 'Valida AI'))
      + GRP('Modello', RA('3d', 'cube', 'Vista 3D', true) + RA('bim', 'bim', 'Apri in BIM', true) + `<div class="rcol">${RS('ESTRUDI', 'box3d', 'Estrudi')}${RS('PARALLELEPIPEDO', 'box3d', 'Parallelep.')}${RS('CILINDRO', 'circle', 'Cilindro')}</div><div class="rcol">${RS('UNIONE', 'plus', 'Unione')}${RS('SOTTRAI', 'x', 'Sottrai')}${RS('INTERSECA', 'join', 'Interseca')}</div>`)
      + GRP('Verifica', RA('check', 'norm', 'Conformità', true)),
    insert: () => GRP('File', RA('open', 'upload', 'Apri DWG/DXF', true) + RA('import', 'plus', 'Importa disegno', true) + `<div class="rcol">${RA('obj', 'cube', 'Mesh OBJ')}${RA('project', 'folder', 'Progetto .becity')}</div>`) + GRP('Blocchi', RB('INSERISCI', 'block', 'Blocco') + RA('blocks', 'block', 'Libreria', true)),
    annot: () => GRP('Testo', RB('TESTOM', 'mtext', 'Testo multiriga') + RB('TESTO', 'text', 'Testo riga')) + GRP('Quote', RB('QUOTALIN', 'dim', 'Lineare') + RB('QUOTA', 'dim', 'Allineata') + RB('QUOTARAG', 'circle', 'Raggio')) + GRP('Direttrici', RB('DIRETTRICE', 'leader', 'Direttrice')) + GRP('Retini', RB('RETINO', 'hatch', 'Retino')),
    view: () => GRP('Navigazione', RA('zoomE', 'zoom', 'Zoom estensioni', true) + RS('ZOOM', 'zoom', 'Zoom finestra') + RA('pan', 'hand', 'Pan')) + GRP('Visualizza', RA('3d', 'cube', 'Vista 3D', true) + `<div class="rcol">${RS('GRIGLIA', 'grid', 'Griglia')}${RS('ORTO', 'line', 'Orto')}${RS('POLARE', 'rotate', 'Polare')}</div>`) + GRP('Tavolozze', `<div class="rcol">${RA('props', 'info', 'Proprietà')}${RA('layers', 'layers', 'Layer')}${RA('blocks', 'block', 'Blocchi')}</div>`),
    manage: () => GRP('Pulizia', RB('ELIMINA', 'trash', 'Elimina non usati') + RB('SELEZIONATUTTO', 'select2', 'Seleziona tutto')) + GRP('Personalizza', RB('ALIAS', 'settings', 'Alias comandi') + RB('AIUTO', 'info', 'Elenco comandi')),
    output: () => GRP('Salva', RA('dwg', 'download', 'Salva DWG', true) + `<div class="rcol">${RA('dwg2013', 'download', 'DWG 2013')}${RA('dwg2010', 'download', 'DWG 2010')}${RA('dwg2004', 'download', 'DWG 2004')}</div>` + RA('dxf', 'download', 'Salva DXF', true))
      + GRP('Stampa', RA('pdf', 'print', 'PDF in scala', true) + RA('sheet', 'present', 'Tavola', true)) + GRP('Esporta', `<div class="rcol">${RA('svg', 'image', 'SVG')}${RA('png', 'image', 'PNG')}${RA('csv', 'table', 'CSV proprietà')}</div><div class="rcol">${RA('ifc', 'bim', 'IFC4')}${RA('mesh', 'cube', 'OBJ / STL')}${RA('projexp', 'folder', 'Progetto .becity')}</div>`) + GRP('Contabilità', RA('computo', 'acc', 'Computo metrico', true))
  };
  const RTABS = [['home', 'Inizio'], ['arch', 'Architettura'], ['insert', 'Inserisci'], ['annot', 'Annota'], ['view', 'Vista'], ['manage', 'Gestisci'], ['output', 'Output']];

  /* ---------- mount ---------- */
  const Mod = {
    needProject: true,
    mount(view) {
      const p = App.project(); if (!p) { view.innerHTML = '<div class="empty">Nessun progetto disponibile.</div>'; return; }
      D = p.drawing; sel = new Set(); undo = App.undoMem[p.id + ':u'] || []; redo = App.undoMem[p.id + ':r'] || []; highlights = []; mode3d = false; active = null; waiter = null;
      const body = App.modShell(view, { id: 'cad', title: 'BeCity CAD', sub: CAD.fileName || (p.name + '.dwg'), extra: `<span class="pill ai hidden" id="aiBanner" title="Elementi generati automaticamente da validare"><b>0</b>&nbsp;da verificare</span><span class="pill ${hasDWG() ? 'ok' : ''}" title="Convertitore DWG">${hasDWG() ? 'DWG attivo' : 'DWG con BeCity.exe'}</span>` });
      view.querySelector('.module').classList.add('theme-dark');
      body.style.flexDirection = 'column';
      body.innerHTML = `<div class="ribbon"><div class="ribbon-tabs"><button class="app-menu" id="rbApp" title="File">B</button>${RTABS.map(([k, l], i) => `<button data-rt="${k}" class="${i ? '' : 'active'}">${l}</button>`).join('')}</div><div class="ribbon-body" id="rbBody"></div></div>
        <div class="cad-wrap">
        <div class="canvas-col">
          <div class="canvas-host" id="cadHost"><canvas id="cadCv" tabindex="0" aria-label="Area di disegno CAD"></canvas></div>
          <div class="cmdline"><div class="cmd-hist" id="cmdHist"></div><div class="cmd-row"><b id="cmdPrompt">${App.t('command')}:</b><input id="cmdInput" autocomplete="off" spellcheck="false" placeholder="Digita un comando (L, PL, C, MU, H, AR…) o coordinate x,y · @dx,dy · @d<ang — ? per l'elenco"><div class="cmd-ac hidden" id="cmdAC"></div></div></div>
          <div class="layout-tabs"><button class="on">Modello</button><button data-lay="1">Layout1</button><button data-lay="1">Layout2</button></div>
          <div class="statusbar" id="cadStatus"><span class="coords" id="cadCoords">X 0  Y 0</span><b style="font-size:10.5px;padding:0 8px">MODELLO</b>
            <button data-t="grid">GRIGLIA</button><button data-t="snap">SNAP</button><button data-t="ortho">ORTO</button><button data-t="polar">POLARE</button><button data-t="osnap">OSNAP</button><button data-t="dyn">DIN</button>
            <span class="grow"></span><span id="selCount" class="tiny"></span>&nbsp;&nbsp;<span id="curLayer" class="tiny"></span>&nbsp;&nbsp;<span class="tiny">1:100 · m · ${App.esc(p.crs)}</span></div>
        </div>
        <aside class="side"><div class="side-tabs"><button data-st="props">${App.t('props')}</button><button data-st="layers" class="active">${App.t('layers')}</button><button data-st="blocks">${App.t('blocks')}</button><button data-st="ai">Assistente</button></div><div class="side-body" id="cadSide"></div></aside>
      </div>`;
      const showRibbon = k => { $('#rbBody').innerHTML = RIBBON[k](); $$('.ribbon-tabs [data-rt]').forEach(b => b.classList.toggle('active', b.dataset.rt === k)); bindRibbon(); };
      const doAct = a => { const nm = App.slug(p.name);
        ({ layers: () => showTab('layers'), blocks: () => showTab('blocks'), props: () => showTab('props'), '3d': () => CAD.toggle3d(!mode3d), bim: () => { location.hash = '#/bim'; }, check: () => { location.hash = '#/norm/conformita'; },
          open: () => CAD.openFile(true), import: () => CAD.openFile(false), obj: () => App.cad3d.importOBJ(), project: () => App.collab.importProject(),
          zoomE: zoomExtents, pan: () => { CAD.panTool = !CAD.panTool; App.toast(CAD.panTool ? 'Pan attivo: trascina con il tasto sinistro (Esc per uscire)' : 'Pan disattivato'); },
          dwg: () => CAD.saveDWG('AC1032'), dwg2013: () => CAD.saveDWG('AC1027'), dwg2010: () => CAD.saveDWG('AC1024'), dwg2004: () => CAD.saveDWG('AC1018'), dxf: () => CAD.saveDXF(true),
          pdf: CAD.exportPDF, sheet: () => { location.hash = '#/present/tavole'; }, svg: () => App.download(nm + '.svg', CAD.exportSVG(), 'image/svg+xml'), png: () => cv.toBlob(b => App.download(nm + '.png', b)),
          csv: () => App.download(nm + '_proprieta.csv', CAD.exportCSV(), 'text/csv'), ifc: () => App.cad3d.exportIFC(), mesh: () => App.cad3d.exportMesh(), projexp: () => App.collab.exportProject(), computo: () => { location.hash = '#/acc/comp'; setTimeout(() => App.acc && App.acc.importFrom('cad', App.project(), App.acc.data(App.project()), () => App.route()), 400); } }[a] || (() => { }))(); };
      const bindRibbon = () => { $$('#rbBody [data-cmd]').forEach(b => b.onclick = () => run(b.dataset.cmd)); $$('#rbBody [data-act]').forEach(b => b.onclick = () => doAct(b.dataset.act)); const ls = $('#rbLayer'); if (ls) { ls.innerHTML = D.layers.map(l => `<option ${l.name === D.current ? 'selected' : ''}>${App.esc(l.name)}</option>`).join(''); ls.onchange = () => { D.current = ls.value; App.touch(); renderStatus(); updatePanels(); }; } };
      CAD.refreshRibbonLayers = () => { const ls = $('#rbLayer'); if (ls) ls.innerHTML = D.layers.map(l => `<option ${l.name === D.current ? 'selected' : ''}>${App.esc(l.name)}</option>`).join(''); };
      $$('.ribbon-tabs [data-rt]').forEach(b => b.onclick = () => showRibbon(b.dataset.rt));
      $('#rbApp').onclick = e => { const r = e.target.getBoundingClientRect(); App.ctxMenu(r.left, r.bottom + 2, [
        { label: App.icon('plus', 15) + ' Nuovo disegno', action: async () => { if (!await App.confirm('Nuovo disegno', 'Svuotare il disegno corrente del progetto? (puoi annullare con Ctrl+Z)', 'Nuovo')) return; begin(); D.entities = []; commit('Nuovo disegno'); CAD.fileName = null; zoomExtents(); } },
        { label: App.icon('upload', 15) + ' Apri DWG / DXF…', action: () => CAD.openFile(true) }, { label: App.icon('plus', 15) + ' Importa DWG / DXF nel disegno…', action: () => CAD.openFile(false) }, '-',
        { label: App.icon('download', 15) + ' Salva come DWG 2018', action: () => CAD.saveDWG('AC1032') }, { label: App.icon('download', 15) + ' Salva come DXF', action: () => CAD.saveDXF(true) }, { label: App.icon('download', 15) + ' Salva come DXF R12', action: () => CAD.saveDXF(false) }, '-',
        { label: App.icon('print', 15) + ' Stampa PDF in scala…', action: CAD.exportPDF }, { label: App.icon('present', 15) + ' Tavola di presentazione', action: () => { location.hash = '#/present/tavole'; } }]); };
      $$('.layout-tabs [data-lay]').forEach(b => b.onclick = () => { location.hash = '#/present/tavole'; });
      host = $('#cadHost'); cv = $('#cadCv'); ctx = cv.getContext('2d');
      this.ro = new ResizeObserver(() => { resize(); if (!this.fitted && W > 0) { this.fitted = true; zoomExtents(); } }); this.ro.observe(host);
      cv.addEventListener('mousemove', onMove); cv.addEventListener('mousedown', onDown); window.addEventListener('mouseup', onUp); cv.addEventListener('wheel', onWheel, { passive: false }); cv.addEventListener('contextmenu', onCtx);
      cv.addEventListener('mouseleave', () => { cursorScr = null; draw(); });
      this.kh = onKey; document.addEventListener('keydown', this.kh);
      const inp = $('#cmdInput');
      inp.addEventListener('input', () => showAC(inp.value.trim()));
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { if (acItems.length && !waiter && inp.value.trim() && !resolveCmd(inp.value.trim())) { const k = acItems[acIdx].k; inp.value = ''; hideAC(); run(k); } else submitCmd(); e.preventDefault(); e.stopPropagation(); } else if (e.key === 'ArrowDown' && acItems.length) { acIdx = (acIdx + 1) % acItems.length; showAC(inp.value.trim()); e.preventDefault(); } else if (e.key === 'ArrowUp') { if (acItems.length) { acIdx = (acIdx - 1 + acItems.length) % acItems.length; e.preventDefault(); } else { const h = App.state.lastCmds || []; inp.value = h[(this.hi = ((this.hi ?? -1) + 1) % Math.max(1, h.length))] || ''; e.preventDefault(); } } else if (e.key === 'Tab' && acItems.length) { inp.value = acItems[acIdx].k; hideAC(); e.preventDefault(); } else if (e.key === 'Escape') { /* gestito globalmente */ } });
      inp.addEventListener('blur', () => setTimeout(hideAC, 150));
      $$('.side-tabs button', view).forEach(b => b.onclick = () => showTab(b.dataset.st));
      $$('#cadStatus button[data-t]').forEach(b => b.onclick = () => toggle(b.dataset.t));
      this.off = [App.on('external-state', () => { const np = App.project(); if (np) { D = np.drawing; draw(); } })];
      showRibbon('home'); sideTab = 'layers'; renderStatus(); updatePanels(); setPrompt(App.t('command') + ':');
      log('BeCity CAD pronto. Digita ? per l\'elenco comandi. Coordinate: x,y · @dx,dy · @dist<angolo. F3 OSNAP · F8 ORTO · F9 SNAP.');
      const pend = App.cad.pendingFocus; if (pend) { setTimeout(() => { CAD.focus(pend.id); if (pend.hl) CAD.setHighlights(pend.hl); }, 80); App.cad.pendingFocus = null; }
    },
    unmount() { if (this.ro) this.ro.disconnect(); document.removeEventListener('keydown', this.kh); window.removeEventListener('mouseup', onUp); (this.off || []).forEach(f => f()); cancelWait(); const p = App.project(); if (p) { App.undoMem[p.id + ':u'] = undo; App.undoMem[p.id + ':r'] = redo; } this.fitted = false; if (App.cad3d) App.cad3d.stop(); ctx = null; App.saveNow(); }
  };
  CAD.toggle3d = on => { mode3d = on; if (on) App.cad3d.start(host, D); else { App.cad3d.stop(); resize(); } };
  CAD.drawing = () => D;
  CAD.selection = () => [...sel];
  CAD.setDrawing = d => { D = d; };
  CAD.use = p => { D = p.drawing; return D; };
  App.register('cad', Mod);
})();
