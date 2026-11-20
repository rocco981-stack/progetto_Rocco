/* BeCity – geometria computazionale (sviluppo interno) */
'use strict';
const G = App.geom = {};
G.EPS = 1e-9;
G.dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
G.sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
G.add = (a, b) => [a[0] + b[0], a[1] + b[1]];
G.mul = (a, k) => [a[0] * k, a[1] * k];
G.len = a => Math.hypot(a[0], a[1]);
G.norm = a => { const l = G.len(a) || 1; return [a[0] / l, a[1] / l]; };
G.perp = a => [-a[1], a[0]];
G.dot = (a, b) => a[0] * b[0] + a[1] * b[1];
G.cross = (a, b) => a[0] * b[1] - a[1] * b[0];
G.lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
G.rot = (p, c, ang) => { const s = Math.sin(ang), co = Math.cos(ang), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * co - y * s, c[1] + x * s + y * co]; };
G.mirror = (p, a, b) => { const d = G.norm(G.sub(b, a)); const v = G.sub(p, a); const pr = G.mul(d, G.dot(v, d)); const perp = G.sub(v, pr); return G.add(a, G.sub(pr, perp)); };
G.area = pts => { let s = 0; for (let i = 0, n = pts.length; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
G.perimeter = (pts, closed = true) => { let s = 0; const n = pts.length; for (let i = 0; i < (closed ? n : n - 1); i++) s += G.dist(pts[i], pts[(i + 1) % n]); return s; };
G.centroid = pts => {
  let a = 0, cx = 0, cy = 0; const n = pts.length;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], f = p[0] * q[1] - q[0] * p[1]; a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; }
  if (Math.abs(a) < 1e-12) { const s = pts.reduce((m, p) => [m[0] + p[0], m[1] + p[1]], [0, 0]); return [s[0] / n, s[1] / n]; }
  return [cx / (3 * a), cy / (3 * a)];
};
G.pip = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (((a[1] > p[1]) !== (b[1] > p[1])) && (p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; };
G.segDist = (p, a, b) => { const ab = G.sub(b, a), l2 = G.dot(ab, ab); let t = l2 ? G.dot(G.sub(p, a), ab) / l2 : 0; t = Math.max(0, Math.min(1, t)); return G.dist(p, G.lerp(a, b, t)); };
G.projT = (p, a, b) => { const ab = G.sub(b, a), l2 = G.dot(ab, ab); return l2 ? G.dot(G.sub(p, a), ab) / l2 : 0; };
G.closestOnSeg = (p, a, b) => G.lerp(a, b, Math.max(0, Math.min(1, G.projT(p, a, b))));
G.segInt = (a, b, c, d, strict = false) => {
  const r = G.sub(b, a), s = G.sub(d, c), den = G.cross(r, s); if (Math.abs(den) < 1e-14) return null;
  const t = G.cross(G.sub(c, a), s) / den, u = G.cross(G.sub(c, a), r) / den;
  const e = strict ? 1e-12 : -1e-9;
  if (t < e || t > 1 - e || u < e || u > 1 - e) return null;
  return { p: [a[0] + t * r[0], a[1] + t * r[1]], t, u };
};
G.lineInt = (a, b, c, d) => { const r = G.sub(b, a), s = G.sub(d, c), den = G.cross(r, s); if (Math.abs(den) < 1e-14) return null; const t = G.cross(G.sub(c, a), s) / den; return { p: [a[0] + t * r[0], a[1] + t * r[1]], t, u: G.cross(G.sub(c, a), r) / den }; };
G.bbox = pts => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; };
G.circlePts = (c, r, n = 48, a0 = 0, a1 = Math.PI * 2) => { const out = []; const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-9; const m = full ? n : n + 1; for (let i = 0; i < m; i++) { const a = a0 + (a1 - a0) * i / n; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } return out; };
G.hull = pts => { const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p; const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); } up.pop(); lo.pop(); return lo.concat(up); };
G.dedupe = (pts, eps = 1e-9) => { const o = []; for (const p of pts) if (!o.length || G.dist(o[o.length - 1], p) > eps) o.push(p); if (o.length > 1 && G.dist(o[0], o[o.length - 1]) <= eps) o.pop(); return o; };
G.selfIntersections = ring => { const out = []; const n = ring.length; for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; const r = G.segInt(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n], true); if (r) out.push(r.p); } return out; };
G.offsetPolyline = (pts, d, closed) => {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const prev = closed ? pts[(i - 1 + n) % n] : pts[i - 1], cur = pts[i], next = closed ? pts[(i + 1) % n] : pts[i + 1];
    let n1 = prev ? G.perp(G.norm(G.sub(cur, prev))) : null, n2 = next ? G.perp(G.norm(G.sub(next, cur))) : null;
    if (!n1) { out.push(G.add(cur, G.mul(n2, d))); continue; } if (!n2) { out.push(G.add(cur, G.mul(n1, d))); continue; }
    const a1 = G.add(prev, G.mul(n1, d)), b1 = G.add(cur, G.mul(n1, d)), a2 = G.add(cur, G.mul(n2, d)), b2 = G.add(next, G.mul(n2, d));
    const it = G.lineInt(a1, b1, a2, b2); out.push(it ? it.p : b1);
  }
  return out;
};
/* triangolazione ear clipping (con fori uniti tramite ponti) */
G.triangulate = (outer, holes = []) => {
  let pts = outer.slice(); if (G.area(pts) < 0) pts.reverse();
  for (let h of holes) { h = h.slice(); if (G.area(h) > 0) h.reverse(); let hi = 0; for (let i = 1; i < h.length; i++) if (h[i][0] > h[hi][0]) hi = i; const hp = h[hi]; let best = -1, bd = Infinity; for (let i = 0; i < pts.length; i++) { const d = G.dist(pts[i], hp); if (d < bd && pts[i][0] >= hp[0] - 1e-9) { bd = d; best = i; } } if (best < 0) best = 0; const ring = h.slice(hi).concat(h.slice(0, hi + 1)); pts = pts.slice(0, best + 1).concat(ring, pts.slice(best)); }
  const idx = pts.map((_, i) => i), tris = []; let guard = 0;
  const isEar = (i0, i1, i2) => { const a = pts[i0], b = pts[i1], c = pts[i2]; if (G.cross(G.sub(b, a), G.sub(c, a)) <= 1e-14) return false; for (const j of idx) { if (j === i0 || j === i1 || j === i2) continue; const p = pts[j]; if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === b[0] && p[1] === b[1]) || (p[0] === c[0] && p[1] === c[1])) continue; if (G.cross(G.sub(b, a), G.sub(p, a)) >= 0 && G.cross(G.sub(c, b), G.sub(p, b)) >= 0 && G.cross(G.sub(a, c), G.sub(p, c)) >= 0) return false; } return true; };
  while (idx.length > 3 && guard++ < 20000) { let found = false; for (let k = 0; k < idx.length; k++) { const i0 = idx[(k - 1 + idx.length) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length]; if (isEar(i0, i1, i2)) { tris.push([pts[i0], pts[i1], pts[i2]]); idx.splice(k, 1); found = true; break; } } if (!found) { const i0 = idx[0], i1 = idx[1], i2 = idx[2]; tris.push([pts[i0], pts[i1], pts[i2]]); idx.splice(1, 1); } }
  if (idx.length === 3) tris.push(idx.map(i => pts[i]));
  return tris;
};

/* ------- Clipping poligonale Greiner–Hormann (intersezione/unione/differenza) ------- */
G.clip = (subject, clipper, op) => {
  // subject, clipper: anelli semplici [[x,y],...]; ritorna array di poligoni (array di anelli)
  const S0 = G.dedupe(subject), C0 = G.dedupe(clipper).map((p, i) => [p[0] + 1.3e-7 * Math.cos(i * 1.7 + .3), p[1] + 1.1e-7 * Math.sin(i * 2.3 + .7)]);
  if (S0.length < 3 || C0.length < 3) return op === 'union' ? [[S0], [C0]].filter(p => p[0].length >= 3) : op === 'difference' ? (S0.length >= 3 ? [[S0]] : []) : [];
  const mk = pts => { const vs = pts.map(p => ({ x: p[0], y: p[1], next: null, prev: null, inter: false, entry: false, neighbor: null, alpha: 0, visited: false })); vs.forEach((v, i) => { v.next = vs[(i + 1) % vs.length]; v.prev = vs[(i - 1 + vs.length) % vs.length]; }); return vs[0]; };
  const s = mk(S0), c = mk(C0);
  const nextNon = v => { while (v.inter) v = v.next; return v; };
  const insert = (v, start, end) => { let cur = start.next; while (cur !== end && cur.alpha < v.alpha) cur = cur.next; v.next = cur; v.prev = cur.prev; v.prev.next = v; cur.prev = v; };
  const verts = h => { const a = []; let v = h; do { a.push(v); v = v.next; } while (v !== h); return a; };
  const sOrig = verts(s), cOrig = verts(c); let nInter = 0;
  for (const sv of sOrig) { const sn = sOrig[(sOrig.indexOf(sv) + 1) % sOrig.length];
    for (const cv of cOrig) { const cn = cOrig[(cOrig.indexOf(cv) + 1) % cOrig.length];
      const r = G.segInt([sv.x, sv.y], [sn.x, sn.y], [cv.x, cv.y], [cn.x, cn.y], true);
      if (r) { const i1 = { x: r.p[0], y: r.p[1], inter: true, alpha: r.t, visited: false }, i2 = { x: r.p[0], y: r.p[1], inter: true, alpha: r.u, visited: false }; i1.neighbor = i2; i2.neighbor = i1; insert(i1, sv, sn); insert(i2, cv, cn); nInter++; } } }
  const ringOf = h => verts(h).filter(v => !v.inter).map(v => [v.x, v.y]);
  const inside = (pt, ring) => G.pip(pt, ring);
  if (!nInter) {
    const sIn = inside(S0[0], C0), cIn = inside(C0[0], S0);
    if (op === 'intersection') return sIn ? [[S0]] : cIn ? [[C0]] : [];
    if (op === 'union') return sIn ? [[C0]] : cIn ? [[S0]] : [[S0], [C0]];
    if (op === 'difference') return sIn ? [] : cIn ? [[S0, C0.slice().reverse()]] : [[S0]];
  }
  const sF = op === 'intersection' ? true : false, cF = op === 'difference' ? true : op === 'intersection';
  // marcatura entrata/uscita
  let status = !inside([s.x, s.y], C0); let v = s; do { if (v.inter) { v.entry = status; status = !status; } v = v.next; } while (v !== s);
  status = !inside([c.x, c.y], S0); v = c; do { if (v.inter) { v.entry = status; status = !status; } v = v.next; } while (v !== c);
  if (!sF) { v = s; do { if (v.inter) v.entry = !v.entry; v = v.next; } while (v !== s); }
  if (!cF) { v = c; do { if (v.inter) v.entry = !v.entry; v = v.next; } while (v !== c); }
  const res = []; let guard = 0;
  const firstUnvisited = () => { let w = s; do { if (w.inter && !w.visited) return w; w = w.next; } while (w !== s); return null; };
  let cur;
  while ((cur = firstUnvisited()) && guard++ < 1000) {
    const poly = [[cur.x, cur.y]]; let g2 = 0;
    do { cur.visited = true; if (cur.neighbor) cur.neighbor.visited = true;
      if (cur.entry) { do { cur = cur.next; poly.push([cur.x, cur.y]); } while (!cur.inter && g2++ < 100000); }
      else { do { cur = cur.prev; poly.push([cur.x, cur.y]); } while (!cur.inter && g2++ < 100000); }
      cur = cur.neighbor;
    } while (!cur.visited && g2++ < 100000);
    const ring = G.dedupe(poly); if (ring.length >= 3 && Math.abs(G.area(ring)) > 1e-10) res.push(ring);
  }
  // per l'unione possono emergere fori (anelli con orientamento opposto)
  const outers = [], holes = [];
  const so = Math.sign(G.area(S0)) || 1;
  res.forEach(r => (op === 'union' && Math.sign(G.area(r)) !== so && res.length > 1 ? holes : outers).push(r));
  return outers.map(o => [o, ...holes.filter(h => G.pip(h[0], o))]);
};
G.polyArea = poly => poly.reduce((a, r, i) => a + (i === 0 ? Math.abs(G.area(r)) : -Math.abs(G.area(r))), 0);
G.unionMany = rings => {
  let acc = []; // lista di poligoni
  for (const r of rings) {
    let cur = [r]; const keep = [];
    for (const p of acc) { const u = G.clip(p[0], cur[0], 'union'); if (u.length === 1) { cur = u[0]; } else keep.push(p); }
    keep.push(cur); acc = keep;
  }
  return acc;
};
G.bufferPoint = (p, r, n = 36) => G.circlePts(p, r, n);
G.bufferSegment = (a, b, r, n = 12) => {
  const d = G.norm(G.sub(b, a)), ang = Math.atan2(d[1], d[0]); const out = [];
  for (let i = 0; i <= n; i++) { const t = ang + Math.PI / 2 + Math.PI * i / n; out.push([a[0] + r * Math.cos(t), a[1] + r * Math.sin(t)]); }
  for (let i = 0; i <= n; i++) { const t = ang - Math.PI / 2 + Math.PI * i / n; out.push([b[0] + r * Math.cos(t), b[1] + r * Math.sin(t)]); }
  return out;
};
G.bufferPolygon = (ring, r) => { let pts = ring.slice(); if (G.area(pts) < 0) pts.reverse(); const off = G.offsetPolyline(pts, -r, true); // perp(+) è a sinistra → per CCW esterno = destra
  // arrotondamento dei vertici convessi
  const out = []; const n = pts.length;
  for (let i = 0; i < n; i++) { const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n]; const d1 = G.norm(G.sub(cur, prev)), d2 = G.norm(G.sub(next, cur));
    if (r > 0 && G.cross(d1, d2) > 1e-9) { const a1 = Math.atan2(-d1[0], d1[1]), a2 = Math.atan2(-d2[0], d2[1]); let A2 = a2; while (A2 < a1) A2 += Math.PI * 2; for (let k = 0; k <= 6; k++) { const t = a1 + (A2 - a1) * k / 6; out.push([cur[0] + r * Math.cos(t), cur[1] + r * Math.sin(t)]); } }
    else out.push(off[i]); }
  return out;
};
