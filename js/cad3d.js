/* BeCity – modulo 3D: mesh dai disegni, renderer software (orbita, prospetti, sezioni, ombre), OBJ/STL/IFC */
'use strict';
(function () {
  const G = App.geom;
  const M3 = App.cad3d = {};
  const v3 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm: a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; } };
  M3.v3 = v3;
  const MAT = { Laterizio: '#e8dccb', 'Calcestruzzo armato': '#c9cbcf', 'Blocchi in cls': '#d4d6d8', 'Legno X-lam': '#e2c9a0', Cartongesso: '#f2f2f0', Pietra: '#d8cfbf', Gres: '#d9d4cc', Parquet: '#c99d6b', Marmo: '#eeebe6', Resina: '#cfd6dc', Cotto: '#c98a63' };
  M3.MAT = MAT;
  /** costruisce la mesh (facce poligonali 3D) del disegno */
  M3.buildMesh = (D) => {
    App.cad.setDrawing(D);
    const faces = [], lines = [];
    const prism = (base, z0, z1, col, tag, holes) => {
      let b = base.slice(); if (G.area(b) < 0) b.reverse();
      faces.push({ pts: b.map(p => [p[0], p[1], z1]), col, tag, holes: holes && holes.map(h => h.map(p => [p[0], p[1], z1])) });
      faces.push({ pts: b.slice().reverse().map(p => [p[0], p[1], z0]), col, tag });
      for (let i = 0; i < b.length; i++) { const a = b[i], c = b[(i + 1) % b.length]; faces.push({ pts: [[a[0], a[1], z0], [c[0], c[1], z0], [c[0], c[1], z1], [a[0], a[1], z1]], col, tag }); }
      (holes || []).forEach(h => { let hh = h.slice(); if (G.area(hh) > 0) hh.reverse(); for (let i = 0; i < hh.length; i++) { const a = hh[i], c = hh[(i + 1) % hh.length]; faces.push({ pts: [[a[0], a[1], z0], [c[0], c[1], z0], [c[0], c[1], z1], [a[0], a[1], z1]], col, tag }); } });
    };
    const vis = e => { const l = D.layers.find(l => l.name === e.layer); return !l || (l.visible && !l.frozen); };
    D.entities.filter(vis).forEach(e => {
      if (e.type === 'wall') {
        const a = [e.x1, e.y1], b = [e.x2, e.y2], L = G.dist(a, b); if (L < 1e-6) return; const d = G.norm(G.sub(b, a)), n = G.perp(d), h = e.thk / 2, H = e.h || 3;
        const ext = [0, 0]; [0, 1].forEach(k => { const p = k ? b : a; if (D.entities.some(o => o !== e && o.type === 'wall' && G.segDist(p, [o.x1, o.y1], [o.x2, o.y2]) < o.thk / 2 + 1e-6)) ext[k] = h; });
        const ops = App.cad.openingsOf(e).map(o => ({ t0: o.t * L - o.width / 2, t1: o.t * L + o.width / 2, z0: o.type === 'door' ? 0 : (o.sill ?? .9), z1: o.type === 'door' ? (o.h || 2.1) : (o.sill ?? .9) + (o.h || 1.4), o })).sort((x, y) => x.t0 - y.t0);
        const rect = (t0, t1) => [G.add(G.add(a, G.mul(d, t0)), G.mul(n, h)), G.add(G.add(a, G.mul(d, t1)), G.mul(n, h)), G.sub(G.add(a, G.mul(d, t1)), G.mul(n, h)), G.sub(G.add(a, G.mul(d, t0)), G.mul(n, h))];
        const col = e.ai ? '#f6c99a' : MAT[e.material] || '#e8dccb';
        let s = -ext[0];
        ops.forEach(op => { if (op.t0 > s) prism(rect(s, op.t0), 0, H, col, e.id); if (op.z0 > 0) prism(rect(op.t0, op.t1), 0, op.z0, col, e.id); if (op.z1 < H) prism(rect(op.t0, op.t1), op.z1, H, col, e.id);
          if (op.o.type === 'window') { const p1 = G.add(a, G.mul(d, op.t0)), p2 = G.add(a, G.mul(d, op.t1)); faces.push({ pts: [[p1[0], p1[1], op.z0], [p2[0], p2[1], op.z0], [p2[0], p2[1], op.z1], [p1[0], p1[1], op.z1]], col: '#9cc6ea', alpha: .45, tag: op.o.id, glass: true }); }
          else { const p1 = G.add(a, G.mul(d, op.t0)), p2 = G.add(a, G.mul(d, op.t1)); lines.push([[p1[0], p1[1], 0], [p1[0], p1[1], op.z1], [p2[0], p2[1], op.z1], [p2[0], p2[1], 0]]); }
          s = Math.max(s, op.t1); });
        if (s < L + ext[1]) prism(rect(s, L + ext[1]), 0, H, col, e.id);
      } else if (e.type === 'room') { let p = e.pts.slice(); if (G.area(p) < 0) p.reverse(); faces.push({ pts: p.map(q => [q[0], q[1], 0.005]), col: MAT[e.floor] || '#d9d4cc', tag: e.id, floor: true }); }
      else if (e.type === 'solid') prism(e.pts, e.z0 || 0, (e.z0 || 0) + e.h, '#b9b0ea', e.id, e.holes);
      else if (e.type === 'mesh') e.faces.forEach(f => faces.push({ pts: f.map(i => e.verts[i]), col: '#c7cfdc', tag: e.id }));
      else if (e.type === 'insert' || e.type === 'pline' || e.type === 'line' || e.type === 'circle') App.cad.segsOf(e).forEach(sg => lines.push([[sg[0][0], sg[0][1], .01], [sg[1][0], sg[1][1], .01]]));
    });
    return { faces, lines };
  };
  /** clip poligono 3D contro semispazio dot(n,p) <= d */
  const clipPoly = (pts, n, d) => { const out = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const da = v3.dot(n, a) - d, db = v3.dot(n, b) - d; if (da <= 0) out.push(a); if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); out.push(v3.add(a, v3.mul(v3.sub(b, a), t))); } } return out; };
  M3.clipPoly = clipPoly;

  /** renderer su canvas */
  M3.renderer = (canvas, getMesh, opt = {}) => {
    const R = { yaw: -55 * Math.PI / 180, pitch: 32 * Math.PI / 180, dist: 30, target: [0, 0, 1.5], persp: true, fov: 45 * Math.PI / 180, zCut: null, xCut: null, shadows: true, sun: [-.45, -.6, .66], bg: opt.bg || '#eef2f7', edges: true };
    R.fit = () => { const m = getMesh(); const pts = m.faces.flatMap(f => f.pts); if (!pts.length) return; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), zs = pts.map(p => p[2]); R.target = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]; R.dist = Math.max(8, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs)) * 1.25); R.extent = R.dist; };
    R.draw = () => {
      const c = canvas.getContext('2d'); const dpr = opt.dpr || window.devicePixelRatio || 1; const W = canvas.width / dpr, H = canvas.height / dpr;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const grd = c.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, opt.sky || '#f7f9fc'); grd.addColorStop(1, R.bg); c.fillStyle = grd; c.fillRect(0, 0, W, H);
      const eye = v3.add(R.target, v3.mul([Math.cos(R.pitch) * Math.cos(R.yaw), Math.cos(R.pitch) * Math.sin(R.yaw), Math.sin(R.pitch)], R.dist));
      const f = v3.norm(v3.sub(R.target, eye)); let r = v3.cross(f, [0, 0, 1]); if (Math.hypot(...r) < 1e-6) r = [1, 0, 0]; r = v3.norm(r); const u = v3.cross(r, f);
      const focal = H / (2 * Math.tan(R.fov / 2)), oscale = H / (R.dist * Math.tan(R.fov / 2) * 2);
      const proj = p => { const v = v3.sub(p, eye); const xc = v3.dot(v, r), yc = v3.dot(v, u), zc = v3.dot(v, f); if (R.persp) { const z = Math.max(.05, zc); return [W / 2 + xc / z * focal, H / 2 - yc / z * focal, zc]; } return [W / 2 + xc * oscale, H / 2 - yc * oscale, zc]; };
      const mesh = getMesh();
      // terreno
      if (opt.ground !== false) { const g = 60; const T = R.target; const gp = [[T[0] - g, T[1] - g, 0], [T[0] + g, T[1] - g, 0], [T[0] + g, T[1] + g, 0], [T[0] - g, T[1] + g, 0]].map(proj); if (gp.every(p => p[2] > 0) || !R.persp) { c.fillStyle = opt.groundCol || '#e6ebe2'; c.beginPath(); gp.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); }
        c.strokeStyle = 'rgba(0,0,0,.05)'; c.lineWidth = 1; for (let k = -g; k <= g; k += 2) { const a = proj([T[0] + k, T[1] - g, 0]), b = proj([T[0] + k, T[1] + g, 0]), a2 = proj([T[0] - g, T[1] + k, 0]), b2 = proj([T[0] + g, T[1] + k, 0]); if (R.persp && (a[2] < .1 || b[2] < .1)) continue; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.moveTo(a2[0], a2[1]); c.lineTo(b2[0], b2[1]); c.stroke(); } }
      let faces = mesh.faces;
      if (R.zCut != null) faces = faces.map(fc => ({ ...fc, pts: clipPoly(fc.pts, [0, 0, 1], R.zCut) })).filter(fc => fc.pts.length >= 3);
      if (R.xCut != null) faces = faces.map(fc => ({ ...fc, pts: clipPoly(fc.pts, [R.xDir || 1, 0, 0].map((v, i) => i === 0 ? 1 : 0), R.xCut) })).filter(fc => fc.pts.length >= 3);
      const L = v3.norm(R.sun);
      // ombre portate a terra
      if (R.shadows && L[2] > .05) { c.fillStyle = 'rgba(40,50,70,.16)'; faces.forEach(fc => { if (fc.floor || fc.glass) return; const sh = fc.pts.map(p => [p[0] - L[0] * p[2] / L[2], p[1] - L[1] * p[2] / L[2], 0.002]); const hull = G.hull(sh.map(p => [p[0], p[1]])); if (hull.length < 3) return; const pp = hull.map(q => proj([q[0], q[1], .002])); if (R.persp && pp.some(p => p[2] < .05)) return; c.beginPath(); pp.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); }); }
      const list = faces.map(fc => { const P = fc.pts.map(proj); const n = v3.norm(v3.cross(v3.sub(fc.pts[1], fc.pts[0]), v3.sub(fc.pts[2], fc.pts[0]))); const depth = P.reduce((a, p) => a + p[2], 0) / P.length; return { fc, P, n, depth: fc.floor ? depth + 1e3 : depth }; });
      list.sort((a, b) => b.depth - a.depth);
      const shade = (hex, k) => { const h = hex.replace('#', ''); const v = [0, 2, 4].map(i => Math.round(Math.min(255, parseInt(h.slice(i, i + 2), 16) * k))); return `rgb(${v[0]},${v[1]},${v[2]})`; };
      list.forEach(({ fc, P, n }) => { if (R.persp && P.some(p => p[2] < .05)) return; const k = .62 + .45 * Math.abs(v3.dot(n, L)); c.globalAlpha = fc.alpha || 1; c.fillStyle = shade(fc.col, Math.min(1.12, k)); c.beginPath(); P.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
        if (fc.holes) fc.holes.forEach(hh => { const HP = hh.map(proj); HP.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); });
        c.fill('evenodd'); c.globalAlpha = 1; if (R.edges) { c.strokeStyle = fc.sel ? '#3d6fe0' : 'rgba(30,38,56,.35)'; c.lineWidth = .8; c.stroke(); } });
      c.strokeStyle = 'rgba(30,38,56,.55)'; c.lineWidth = 1; mesh.lines.forEach(l => { const P = l.map(proj); if (R.persp && P.some(p => p[2] < .05)) return; if (R.zCut != null && l.some(p => p[2] > R.zCut)) return; c.beginPath(); P.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); });
      // assi
      if (opt.axes !== false) { const o = [56, H - 40]; [[1, 0, 0, '#df5179', 'X'], [0, 1, 0, '#1f9e85', 'Y'], [0, 0, 1, '#3d6fe0', 'Z']].forEach(([x, y, z, col, lab]) => { const d = [v3.dot([x, y, z], r), v3.dot([x, y, z], u)]; c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(...o); c.lineTo(o[0] + d[0] * 26, o[1] - d[1] * 26); c.stroke(); c.fillStyle = col; c.font = '10px Helvetica'; c.fillText(lab, o[0] + d[0] * 32 - 3, o[1] - d[1] * 32 + 3); }); }
    };
    R.preset = name => { const P = { asso: [-55, 32, false], persp: [-55, 25, true], sud: [-90, 0, false], nord: [90, 0, false], est: [0, 0, false], ovest: [180, 0, false], pianta: [-90, 89.9, false], volo: [-120, 50, true] }[name]; if (!P) return; R.yaw = P[0] * Math.PI / 180; R.pitch = P[1] * Math.PI / 180; R.persp = P[2]; R.draw(); };
    return R;
  };

  /* ---------- vista 3D integrata nel CAD ---------- */
  let st = null;
  M3.start = (host, D) => {
    M3.stop();
    const cv2 = document.createElement('canvas'); cv2.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:2;cursor:grab'; host.appendChild(cv2);
    let mesh = M3.buildMesh(D);
    const R = M3.renderer(cv2, () => mesh); R.fit();
    const panel = document.createElement('div'); panel.className = 'view3d-bar';
    const bb = mesh.faces.flatMap(f => f.pts); const zmax = Math.max(3, ...bb.map(p => p[2])), xs = bb.map(p => p[0]); const xmin = Math.min(0, ...xs), xmax = Math.max(1, ...xs);
    panel.innerHTML = `<b>Vista 3D</b><div class="row wrap" style="gap:4px">${[['asso', 'Assonometria'], ['persp', 'Prospettiva'], ['pianta', 'Pianta'], ['sud', 'Prosp. Sud'], ['nord', 'Prosp. Nord'], ['est', 'Prosp. Est'], ['ovest', 'Prosp. Ovest']].map(([k, l]) => `<button class="btn sm" data-v="${k}">${l}</button>`).join('')}</div>
      <label class="f"><span>Taglio orizzontale (quota) <b id="zcv">off</b></span><input type="range" id="zc" min="0" max="${(zmax + .5).toFixed(1)}" step="0.05" value="${(zmax + .5).toFixed(1)}"></label>
      <label class="f"><span>Sezione verticale (X) <b id="xcv">off</b></span><input type="range" id="xc" min="${(xmin - .5).toFixed(1)}" max="${(xmax + .5).toFixed(1)}" step="0.05" value="${(xmax + .5).toFixed(1)}"></label>
      <label class="chk"><input type="checkbox" id="shd" checked> Ombre (sole)</label><label class="f"><span>Azimut sole</span><input type="range" id="sunA" min="0" max="360" value="235"></label>
      <div class="tiny faint">Trascina: orbita · Destro/centrale: pan · Rotella: zoom</div>`;
    host.appendChild(panel);
    const resize = () => { const r = host.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; cv2.width = r.width * dpr; cv2.height = r.height * dpr; R.draw(); };
    const ro = new ResizeObserver(resize); ro.observe(host);
    let drag = null;
    cv2.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, b: e.button }; cv2.style.cursor = 'grabbing'; });
    const mm = e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (drag.b === 0) { R.yaw -= dx * .008; R.pitch = Math.max(-.2, Math.min(1.55, R.pitch + dy * .008)); } else { const eyeDir = [Math.cos(R.pitch) * Math.cos(R.yaw), Math.cos(R.pitch) * Math.sin(R.yaw), Math.sin(R.pitch)]; const rr = v3.norm(v3.cross(v3.mul(eyeDir, -1), [0, 0, 1])); const uu = v3.cross(rr, v3.mul(eyeDir, -1)); const k = R.dist * .0015; R.target = v3.add(R.target, v3.add(v3.mul(rr, -dx * k), v3.mul(uu, dy * k))); } R.draw(); };
    const mu = () => { drag = null; cv2.style.cursor = 'grab'; };
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
    cv2.addEventListener('contextmenu', e => e.preventDefault());
    cv2.addEventListener('wheel', e => { e.preventDefault(); R.dist = Math.max(1, R.dist * Math.exp(e.deltaY * .0012)); R.draw(); }, { passive: false });
    $$('[data-v]', panel).forEach(b => b.onclick = () => R.preset(b.dataset.v));
    $('#zc', panel).oninput = e => { const v = +e.target.value; R.zCut = v >= zmax + .45 ? null : v; $('#zcv', panel).textContent = R.zCut == null ? 'off' : App.fnum(v) + ' m'; R.draw(); };
    $('#xc', panel).oninput = e => { const v = +e.target.value; R.xCut = v >= xmax + .45 ? null : v; $('#xcv', panel).textContent = R.xCut == null ? 'off' : App.fnum(v) + ' m'; R.draw(); };
    $('#shd', panel).onchange = e => { R.shadows = e.target.checked; R.draw(); };
    $('#sunA', panel).oninput = e => { const a = +e.target.value * Math.PI / 180; R.sun = [Math.cos(a) * .6, Math.sin(a) * .6, .66]; R.draw(); };
    st = { cv2, panel, ro, mm, mu, R, refresh: () => { mesh = M3.buildMesh(D); R.draw(); } };
    const off = App.on('remote:drawing', () => st && st.refresh()); st.off = off;
  };
  M3.stop = () => { if (!st) return; st.ro.disconnect(); window.removeEventListener('mousemove', st.mm); window.removeEventListener('mouseup', st.mu); st.cv2.remove(); st.panel.remove(); st.off && st.off(); st = null; };

  /** immagine renderizzata (per presentazioni) */
  M3.renderImage = (D, w = 1200, h = 800, preset = 'asso', o = {}) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const mesh = M3.buildMesh(D);
    const R = M3.renderer(cv, () => mesh, { dpr: 1, axes: false, ...o }); R.fit(); R.preset(preset); if (o.sun) R.sun = o.sun; if (o.dist) R.dist *= o.dist; R.draw(); return cv;
  };

  /* ---------- triangolazione facce per export ---------- */
  function triangulateFace(f) {
    const n = v3.cross(v3.sub(f.pts[1], f.pts[0]), v3.sub(f.pts[2], f.pts[0])); const ax = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])]; const drop = ax.indexOf(Math.max(...ax)); const keep = [0, 1, 2].filter(i => i !== drop);
    if (f.pts.length === 3) return [f.pts];
    if (f.pts.length === 4 && !f.holes) return [[f.pts[0], f.pts[1], f.pts[2]], [f.pts[0], f.pts[2], f.pts[3]]];
    const p2 = f.pts.map(p => [p[keep[0]], p[keep[1]]]); const map = new Map(p2.map((q, i) => [q.join(','), f.pts[i]]));
    const holes = (f.holes || []).map(h => h.map(p => { map.set([p[keep[0]], p[keep[1]]].join(','), p); return [p[keep[0]], p[keep[1]]]; }));
    const flip = G.area(p2) < 0;
    return G.triangulate(p2, holes).map(t => { const tt = t.map(q => map.get(q.join(','))); return flip ? tt.reverse() : tt; }).filter(t => t.every(Boolean));
  }
  M3.exportMesh = async () => {
    const p = App.project(); const D = p.drawing; const mesh = M3.buildMesh(D); if (!mesh.faces.length) { App.toast('Nessuna geometria 3D (muri, solidi o mesh)', 'warn'); return; }
    const f = await App.form('Esporta modello 3D', [{ name: 'fmt', label: 'Formato', type: 'select', options: ['OBJ (con gruppi)', 'STL ASCII'] }]); if (!f) return;
    if (f.fmt.startsWith('OBJ')) { let s = `# BeCity – ${p.name}\n# unità: metri, asse Z verso l'alto\n`, vi = 1; const groups = {}; mesh.faces.forEach(fc => { (groups[fc.tag] = groups[fc.tag] || []).push(fc); });
      Object.entries(groups).forEach(([tag, fs]) => { const e = D.entities.find(x => x.id === tag); s += `g ${(e ? e.type + '_' + (e.name || tag) : tag).replace(/\s+/g, '_')}\n`; fs.forEach(fc => { triangulateFace(fc).forEach(t => { t.forEach(q => s += `v ${q[0].toFixed(4)} ${q[1].toFixed(4)} ${q[2].toFixed(4)}\n`); s += `f ${vi} ${vi + 1} ${vi + 2}\n`; vi += 3; }); }); });
      App.download(App.slug(p.name) + '.obj', s, 'text/plain'); }
    else { let s = `solid ${App.slug(p.name)}\n`; mesh.faces.forEach(fc => triangulateFace(fc).forEach(t => { const n = v3.norm(v3.cross(v3.sub(t[1], t[0]), v3.sub(t[2], t[0]))); s += ` facet normal ${n.map(v => v.toFixed(6)).join(' ')}\n  outer loop\n${t.map(q => `   vertex ${q.map(v => v.toFixed(5)).join(' ')}`).join('\n')}\n  endloop\n endfacet\n`; })); s += `endsolid ${App.slug(p.name)}\n`; App.download(App.slug(p.name) + '.stl', s, 'model/stl'); }
  };
  M3.importOBJ = async () => {
    const [f] = await App.pickFiles({ accept: '.obj' }); if (!f) return; const txt = await App.readText(f); const verts = [], faces = [];
    txt.split(/\r?\n/).forEach(l => { const t = l.trim().split(/\s+/); if (t[0] === 'v') verts.push([+t[1], +t[2], +t[3]]); else if (t[0] === 'f') faces.push(t.slice(1).map(x => { const i = parseInt(x.split('/')[0], 10); return i < 0 ? verts.length + i : i - 1; })); });
    if (!faces.length) { App.toast('OBJ senza facce', 'err'); return; }
    if (faces.length > 20000) { App.toast('Mesh troppo grande per l\'archivio locale (max 20.000 facce)', 'err'); return; }
    const yup = await App.confirm('Orientamento asse', 'Il file usa l\'asse Y verso l\'alto (convenzione comune OBJ)? Scegli Conferma per convertire in Z-up.', 'Converti Y→Z');
    const V = yup ? verts.map(v => [v[0], -v[2], v[1]]) : verts;
    App.cad.begin(); App.cad.add({ type: 'mesh', verts: V.map(v => v.map(x => +x.toFixed(4))), faces, layer: 'SOLIDI', name: f.name }); App.cad.commit('Importa OBJ'); App.toast(`OBJ importato: ${verts.length} vertici, ${faces.length} facce`, 'ok'); App.cad.draw();
  };

  /* ---------- IFC4 (serializzatore interno, export) ---------- */
  const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  const guid = () => { let s = B64[Math.floor(Math.random() * 4)]; for (let i = 0; i < 21; i++) s += B64[Math.floor(Math.random() * 64)]; return s; };
  M3.exportIFC = (download = true) => {
    const p = App.project(); const D = p.drawing; App.cad.setDrawing(D);
    let n = 0; const L = []; const E = s => { L.push(`#${++n}=${s};`); return '#' + n; };
    const S = s => `'${String(s ?? '').replace(/'/g, "''").replace(/[^\x20-\x7e]/g, c => `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}\\X0\\`)}'`;
    const F = v => { const s = (+v).toFixed(6).replace(/0+$/, ''); return s.endsWith('.') ? s : s; };
    const P3 = (x, y, z) => E(`IFCCARTESIANPOINT((${F(x)},${F(y)},${F(z)}))`), P2 = (x, y) => E(`IFCCARTESIANPOINT((${F(x)},${F(y)}))`);
    const user = App.user || {}; const nm = String(user.name || 'Utente').split(' ');
    const per = E(`IFCPERSON($,${S(nm.slice(1).join(' ') || nm[0])},${S(nm[0])},$,$,$,$,$)`), org = E(`IFCORGANIZATION($,${S(App.state.org.name)},$,$,$)`), po = E(`IFCPERSONANDORGANIZATION(${per},${org},$)`), app = E(`IFCAPPLICATION(${org},'1.0','BeCity','BeCity')`);
    const oh = E(`IFCOWNERHISTORY(${po},${app},$,.ADDED.,$,$,$,${Math.floor(Date.now() / 1000)})`);
    const u1 = E('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'), u2 = E('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'), u3 = E('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'), u4 = E('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)');
    const units = E(`IFCUNITASSIGNMENT((${u1},${u2},${u3},${u4}))`);
    const o0 = P3(0, 0, 0), zd = E('IFCDIRECTION((0.,0.,1.))'), xd = E('IFCDIRECTION((1.,0.,0.))'); const ax0 = E(`IFCAXIS2PLACEMENT3D(${o0},${zd},${xd})`);
    const ctx = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${ax0},$)`); const body = E(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
    const proj = E(`IFCPROJECT('${guid()}',${oh},${S(p.name)},${S('Esportato da BeCity')},$,$,${S(p.phase)},(${ctx}),${units})`);
    const dms = v => { const d = Math.trunc(v), mf = Math.abs(v - d) * 60, m = Math.trunc(mf), sf = (mf - m) * 60, s = Math.trunc(sf), us = Math.round((sf - s) * 1e6); const sg = v < 0 ? -1 : 1; return `(${d},${sg * m},${sg * s},${sg * us})`; };
    const plSite = E(`IFCLOCALPLACEMENT($,${ax0})`); const site = E(`IFCSITE('${guid()}',${oh},${S('Sito – ' + (p.comune || ''))},$,$,${plSite},$,$,.ELEMENT.,${dms(p.origin.lat)},${dms(p.origin.lon)},0.,$,$)`);
    const plB = E(`IFCLOCALPLACEMENT(${plSite},${ax0})`); const bld = E(`IFCBUILDING('${guid()}',${oh},${S(p.name)},$,$,${plB},$,$,.ELEMENT.,$,$,$)`);
    const plS = E(`IFCLOCALPLACEMENT(${plB},${ax0})`); const sto = E(`IFCBUILDINGSTOREY('${guid()}',${oh},'Piano terra',$,$,${plS},$,$,.ELEMENT.,0.)`);
    E(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${proj},(${site}))`); E(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${site},(${bld}))`); E(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${bld},(${sto}))`);
    const contained = [], spaces = [];
    const extrRect = (cx, cy, w, d, h, place) => { const prof = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${E(`IFCAXIS2PLACEMENT2D(${P2(cx, cy)},$)`)},${F(w)},${F(d)})`); const sol = E(`IFCEXTRUDEDAREASOLID(${prof},${place || E(`IFCAXIS2PLACEMENT3D(${o0},$,$)`)},${zd},${F(h)})`); return E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${E(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${sol}))`)}))`); };
    const extrPoly = (pts, h, z0 = 0) => { let pp = pts.slice(); if (G.area(pp) < 0) pp.reverse(); const pl = E(`IFCPOLYLINE((${[...pp, pp[0]].map(q => P2(q[0], q[1])).join(',')}))`); const prof = E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${pl})`); const sol = E(`IFCEXTRUDEDAREASOLID(${prof},${E(`IFCAXIS2PLACEMENT3D(${P3(0, 0, z0)},$,$)`)},${zd},${F(h)})`); return E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${E(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${sol}))`)}))`); };
    const pset = (obj, name, props) => { const ps = Object.entries(props).map(([k, v]) => E(`IFCPROPERTYSINGLEVALUE(${S(k)},$,${typeof v === 'number' ? `IFCREAL(${F(v)})` : `IFCLABEL(${S(v)})`},$)`)); const s = E(`IFCPROPERTYSET('${guid()}',${oh},${S(name)},$,(${ps.join(',')}))`); E(`IFCRELDEFINESBYPROPERTIES('${guid()}',${oh},$,$,(${obj}),${s})`); };
    D.entities.forEach(e => {
      if (e.type === 'wall') { const a = [e.x1, e.y1], b = [e.x2, e.y2], Ln = G.dist(a, b); if (Ln < 1e-6) return; const d = G.norm(G.sub(b, a));
        const pl = E(`IFCLOCALPLACEMENT(${plS},${E(`IFCAXIS2PLACEMENT3D(${P3(a[0], a[1], 0)},${zd},${E(`IFCDIRECTION((${F(d[0])},${F(d[1])},0.))`)})`)})`);
        const w = E(`IFCWALL('${guid()}',${oh},${S('Muro ' + (e.material || ''))},$,$,${pl},${extrRect(Ln / 2, 0, Ln, e.thk, e.h || 3)},$,.STANDARD.)`); contained.push(w);
        pset(w, 'Pset_WallCommon', { Spessore: e.thk, Altezza: e.h || 3, Materiale: e.material || 'Laterizio', IsExternal: e.thk >= .25 ? 'TRUE' : 'FALSE' }); if (e.ai) pset(w, 'BeCity_AI', { Stato: 'Generato da AI – da verificare' });
        App.cad.openingsOf(e).forEach(o => { const z0 = o.type === 'door' ? 0 : (o.sill ?? .9), h = o.h || (o.type === 'door' ? 2.1 : 1.4); const x0 = o.t * Ln - o.width / 2;
          const opl = E(`IFCLOCALPLACEMENT(${pl},${E(`IFCAXIS2PLACEMENT3D(${P3(x0, 0, z0)},$,$)`)})`);
          const op = E(`IFCOPENINGELEMENT('${guid()}',${oh},'Apertura',$,$,${opl},${extrRect(o.width / 2, 0, o.width, e.thk + .1, h)},$,.OPENING.)`); E(`IFCRELVOIDSELEMENT('${guid()}',${oh},$,$,${w},${op})`);
          const fl = o.type === 'door' ? E(`IFCDOOR('${guid()}',${oh},'Porta',$,$,${opl},$,$,${F(h)},${F(o.width)},.DOOR.,.SINGLE_SWING_LEFT.,$)`) : E(`IFCWINDOW('${guid()}',${oh},'Finestra',$,$,${opl},$,$,${F(h)},${F(o.width)},.WINDOW.,.SINGLE_PANEL.,$)`);
          E(`IFCRELFILLSELEMENT('${guid()}',${oh},$,$,${op},${fl})`); contained.push(fl); });
      } else if (e.type === 'room') { const sp = E(`IFCSPACE('${guid()}',${oh},${S(e.name)},$,$,${E(`IFCLOCALPLACEMENT(${plS},${ax0})`)},${extrPoly(e.pts, e.h || 2.7)},${S(e.rtype || '')},.ELEMENT.,.INTERNAL.,$)`); spaces.push(sp); pset(sp, 'Pset_SpaceCommon', { Superficie: +CAD_area(e).toFixed(3), AltezzaNetta: e.h || 2.7, Pavimento: e.floor || '' }); }
      else if (e.type === 'solid') { const px = E(`IFCBUILDINGELEMENTPROXY('${guid()}',${oh},'Solido',$,$,${E(`IFCLOCALPLACEMENT(${plS},${ax0})`)},${extrPoly(e.pts, e.h, e.z0 || 0)},$,.NOTDEFINED.)`); contained.push(px); }
    });
    if (spaces.length) E(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${sto},(${spaces.join(',')}))`);
    if (contained.length) E(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',${oh},$,$,(${contained.join(',')}),${sto})`);
    const ts = new Date().toISOString().slice(0, 19);
    const txt = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');\nFILE_NAME(${S(App.slug(p.name) + '.ifc')},'${ts}',(${S(user.name || '')}),(${S(App.state.org.name)}),'BeCity IFC serializer','BeCity ${App.version}','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n${L.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
    if (download) App.download(App.slug(p.name) + '.ifc', txt, 'application/x-step');
    return txt;
  };
  const CAD_area = e => Math.abs(G.area(e.pts));
})();
