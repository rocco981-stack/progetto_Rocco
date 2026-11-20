/* BeCity – strumenti di mappatura da drone e analisi del terreno:
   piano di volo fotogrammetrico, nuvole di punti LAS, DSM, curve di livello, profili, volumi, statistiche zonali. */
'use strict';
(function () {
  const G = App.geom;
  const T = App.terra = {};
  const api = () => App.gis.api;
  const polysOf = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];

  /* ---------- selezione geometrie ---------- */
  function selected(kind) {
    const A = api(); const l = A.layerById(A.active()); const ids = A.selIds();
    const f = l && l.type === 'vector' ? l.features.find(x => ids.has(x.id) && (kind === 'poly' ? polysOf(x.geometry).length : x.geometry.type.includes('Line'))) : null;
    if (!f) { App.toast(kind === 'poly' ? 'Seleziona un poligono (area di rilievo) nel layer attivo, oppure disegnalo con lo strumento Poligono.' : 'Seleziona una linea nel layer attivo, oppure disegnala con lo strumento Linea.', 'warn'); return null; }
    return f;
  }
  const dtmLayers = () => api().layers().filter(l => l.type === 'raster' && l.grid);
  /** quota bilineare da un layer DTM in lon/lat */
  T.sample = (l, lon, lat) => { const g = l.grid, bb = l.bbox; const fx = (lon - bb[0]) / (bb[2] - bb[0]) * g.w - .5, fy = (bb[3] - lat) / (bb[3] - bb[1]) * g.h - .5; if (fx < -.5 || fy < -.5 || fx > g.w - .5 || fy > g.h - .5) return null; const x0 = Math.max(0, Math.min(g.w - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(g.h - 1, Math.floor(fy))), x1 = Math.min(g.w - 1, x0 + 1), y1 = Math.min(g.h - 1, y0 + 1); const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0)); const v = (x, y) => g.v[y * g.w + x]; const a = v(x0, y0), b = v(x1, y0), c = v(x0, y1), d = v(x1, y1); if ([a, b, c, d].some(x => x == null)) return a ?? b ?? c ?? d; return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty; };
  const pickDTM = async title => { const ds = dtmLayers(); if (!ds.length) { App.toast('Serve un modello del terreno: importa un GeoTIFF DTM/DSM o genera un DSM da nuvola di punti.', 'warn'); return null; } if (ds.length === 1) return ds[0]; const r = await App.form(title, [{ name: 'l', label: 'Modello del terreno', type: 'select', options: ds.map(l => ({ value: l.id, label: l.name })) }], 'Continua'); return r ? ds.find(l => l.id === r.l) : null; };
  const cellSize = l => { const L = App.gis.local([(l.bbox[0] + l.bbox[2]) / 2, (l.bbox[1] + l.bbox[3]) / 2]); const a = L.to(l.bbox[0], l.bbox[1]), b = L.to(l.bbox[2], l.bbox[3]); return [(b[0] - a[0]) / l.grid.w, (b[1] - a[1]) / l.grid.h]; };

  /* ---------- piano di volo fotogrammetrico ---------- */
  T.CAMERAS = {
    'Drone compatto con sensore 4/3 (17,3×13 mm, f 12,3 mm, 5280×3956 px)': { sw: 17.3, sh: 13, f: 12.29, iw: 5280, ih: 3956 },
    'Drone RTK con sensore 1" (13,2×8,8 mm, f 8,8 mm, 5472×3648 px)': { sw: 13.2, sh: 8.8, f: 8.8, iw: 5472, ih: 3648 },
    'Camera full frame 45 MP (35,9×24 mm, f 35 mm, 8192×5460 px)': { sw: 35.9, sh: 24, f: 35, iw: 8192, ih: 5460 },
    'Camera multispettrale (4,8×3,6 mm, f 5,7 mm, 1600×1300 px)': { sw: 4.8, sh: 3.6, f: 5.7, iw: 1600, ih: 1300 }
  };
  T.flightPlan = async () => {
    const f = selected('poly'); if (!f) return;
    const r = await App.form('Piano di volo – rilievo fotogrammetrico', [
      { name: 'cam', label: 'Camera', type: 'select', options: Object.keys(T.CAMERAS) },
      { type: 'html', html: '<div class="grid2">' }, { name: 'alt', label: 'Quota di volo AGL (m)', type: 'number', value: 80 }, { name: 'spd', label: 'Velocità (m/s)', type: 'number', value: 10 }, { name: 'fo', label: 'Sovrapposizione longitudinale (%)', type: 'number', value: 80 }, { name: 'so', label: 'Sovrapposizione laterale (%)', type: 'number', value: 70 }, { type: 'html', html: '</div>' },
      { name: 'ang', label: 'Direzione delle strisciate (° da Est, vuoto = automatica)', value: '' }, { name: 'margin', label: 'Margine oltre l\'area (m)', type: 'number', value: 10 },
      { name: 'oblique', label: 'Aggiungi strisciate incrociate (rilievo 3D / oblique)', type: 'checkbox', value: false }], 'Calcola piano');
    if (!r) return; const cam = T.CAMERAS[r.cam];
    const H = r.alt, gsd = cam.sw * H * 100 / (cam.f * cam.iw), fw = cam.sw * H / cam.f, fh = cam.sh * H / cam.f;
    const spacing = fw * (1 - r.so / 100), interval = fh * (1 - r.fo / 100);
    const ring = polysOf(f.geometry)[0][0]; const c0 = App.gis.centroidLL(f.geometry); const L = App.gis.local(c0); let poly = ring.slice(0, -1).map(q => L.to(q[0], q[1])); if (G.area(poly) < 0) poly.reverse();
    if (r.margin) poly = G.offsetPolyline(poly, -r.margin, true);
    let ang = r.ang === '' || isNaN(+r.ang) ? null : +r.ang * Math.PI / 180;
    if (ang == null) { let best = 0, bl = 0; poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; const l = G.dist(p, q); if (l > bl) { bl = l; best = Math.atan2(q[1] - p[1], q[0] - p[0]); } }); ang = best; }
    const lines = (a) => { const d = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]]; const pr = poly.map(p => G.dot(p, n)); const mn = Math.min(...pr), mx = Math.max(...pr); const R = 1e5; const out = []; let k = 0;
      for (let o = mn + spacing / 2; o <= mx; o += spacing, k++) { const A = G.add(G.mul(n, o), G.mul(d, -R)), B = G.add(G.mul(n, o), G.mul(d, R)); const ts = []; poly.forEach((p, i) => { const it = G.segInt(A, B, p, poly[(i + 1) % poly.length]); if (it) ts.push(it.t); }); ts.sort((x, y) => x - y); if (ts.length >= 2) { let s = G.lerp(A, B, ts[0]), e = G.lerp(A, B, ts[ts.length - 1]); if (k % 2) [s, e] = [e, s]; out.push([s, e]); } } return out; };
    let strips = lines(ang); if (r.oblique) strips = strips.concat(lines(ang + Math.PI / 2));
    if (!strips.length) { App.toast('Area troppo piccola rispetto all\'impronta del fotogramma', 'warn'); return; }
    const route = []; strips.forEach(([s, e]) => { route.push(s, e); });
    let len = 0; for (let i = 1; i < route.length; i++) len += G.dist(route[i - 1], route[i]);
    const photoLen = strips.reduce((a, [s, e]) => a + G.dist(s, e), 0); const photos = Math.ceil(photoLen / interval) + strips.length;
    const time = len / r.spd + strips.length * 6; const area = Math.abs(G.area(polysOf(f.geometry)[0][0].slice(0, -1).map(q => L.to(q[0], q[1])))) / 1e4;
    const back = q => L.from(q[0], q[1]);
    const A = api(); const routeL = App.gis.newLayer(A.P(), `Piano di volo – percorso (${H} m)`, [{ id: App.uid(), geometry: { type: 'LineString', coordinates: route.map(back) }, properties: { quota_m: H, gsd_cm: +gsd.toFixed(2), lunghezza_m: +len.toFixed(1), foto: photos, tempo_min: +(time / 60).toFixed(1), velocita: r.spd } }], { style: { mode: 'single', color: '#e5134b', width: 2 }, license: 'Elaborazione propria' });
    const wps = route.map((q, i) => ({ id: App.uid(), geometry: { type: 'Point', coordinates: back(q) }, properties: { wp: i + 1, quota_m: H, velocita: r.spd, azione: i % 2 ? 'fine strisciata' : 'inizio strisciata' } }));
    App.gis.newLayer(A.P(), 'Piano di volo – waypoint', wps, { style: { mode: 'single', color: '#0a6cff', width: 1, label: 'wp' } });
    A.refresh(); App.audit('terra-flight', `Piano di volo: ${strips.length} strisciate, ${photos} foto`);
    const res = await App.modal({ title: 'Piano di volo calcolato', size: 'wide', body: `<div class="kpi"><div class="card"><b>${App.fnum(gsd, 2)} cm/px</b><span>GSD (risoluzione a terra)</span></div><div class="card"><b>${App.fnum(area, 2)} ha</b><span>area di rilievo</span></div><div class="card"><b>${strips.length}</b><span>strisciate</span></div><div class="card"><b>${photos}</b><span>fotogrammi stimati</span></div><div class="card"><b>${App.fnum(len / 1000, 2)} km</b><span>percorso</span></div><div class="card"><b>${App.fnum(time / 60, 1)} min</b><span>tempo di volo</span></div></div>
      <table class="tbl" style="margin-top:14px"><tbody><tr><th>Impronta fotogramma</th><td>${App.fnum(fw, 1)} × ${App.fnum(fh, 1)} m</td></tr><tr><th>Interasse strisciate</th><td>${App.fnum(spacing, 1)} m</td></tr><tr><th>Intervallo di scatto</th><td>${App.fnum(interval, 1)} m · ${App.fnum(interval / r.spd, 1)} s</td></tr><tr><th>Direzione</th><td>${App.fnum((ang * 180 / Math.PI + 360) % 360, 1)}°</td></tr><tr><th>Batterie stimate (25 min utili)</th><td>${Math.max(1, Math.ceil(time / 60 / 25))}</td></tr></tbody></table>
      <div class="disclaimer">Verificare zone geografiche UAS, quota massima consentita e scenario operativo previsti dal Regolamento (UE) 2019/947 e dalle disposizioni ENAC prima del volo.</div>`,
      actions: [{ label: App.t('close'), value: null }, { label: 'Esporta waypoint CSV', value: 'csv' }, { label: 'Esporta KML (area e percorso)', primary: true, value: 'kml' }] });
    if (res === 'kml') { const lr = { name: routeL.name, features: [{ geometry: f.geometry, properties: { name: 'Area di rilievo' } }, ...routeL.features.map(x => ({ geometry: x.geometry, properties: { name: 'Percorso', ...x.properties } }))] }; App.download(App.slug(routeL.name) + '.kml', App.geoformats.writeKML(lr), 'application/vnd.google-earth.kml+xml'); }
    if (res === 'csv') App.download('waypoint.csv', App.geoformats.toCSV(wps.map(w => ({ wp: w.properties.wp, latitudine: w.geometry.coordinates[1].toFixed(8), longitudine: w.geometry.coordinates[0].toFixed(8), quota_agl_m: H, velocita_ms: r.spd, azione: w.properties.azione })), ['wp', 'latitudine', 'longitudine', 'quota_agl_m', 'velocita_ms', 'azione']), 'text/csv');
  };

  /* ---------- volumi di scavo e riporto ---------- */
  T.volumes = async () => {
    const f = selected('poly'); if (!f) return; const l = await pickDTM('Calcolo volumi'); if (!l) return;
    const ring = polysOf(f.geometry)[0][0]; const bnd = []; for (let i = 0; i < ring.length - 1; i++) { const a = ring[i], b = ring[i + 1]; for (let t = 0; t < 1; t += .1) { const v = T.sample(l, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); if (v != null) bnd.push(v); } }
    const r = await App.form('Calcolo volumi', [{ name: 'base', label: 'Piano di riferimento', type: 'select', options: [{ value: 'min', label: `Quota minima sul perimetro (${bnd.length ? App.fnum(Math.min(...bnd), 2) : 'n.d.'} m)` }, { value: 'mean', label: `Quota media sul perimetro (${bnd.length ? App.fnum(bnd.reduce((a, b) => a + b, 0) / bnd.length, 2) : 'n.d.'} m)` }, { value: 'custom', label: 'Quota di progetto (valore)' }] }, { name: 'z', label: 'Quota di progetto (m s.l.m.)', type: 'number', value: bnd.length ? +(bnd.reduce((a, b) => a + b, 0) / bnd.length).toFixed(2) : 0 }], 'Calcola');
    if (!r) return; const z0 = r.base === 'min' ? Math.min(...bnd) : r.base === 'mean' ? bnd.reduce((a, b) => a + b, 0) / bnd.length : r.z;
    const g = l.grid, bb = l.bbox; const [cw, ch] = cellSize(l); const ca = Math.abs(cw * ch); let cut = 0, fill = 0, n = 0;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const lon = bb[0] + (x + .5) / g.w * (bb[2] - bb[0]), lat = bb[3] - (y + .5) / g.h * (bb[3] - bb[1]); if (!G.pip([lon, lat], ring)) continue; const v = g.v[y * g.w + x]; if (v == null) continue; n++; const d = v - z0; if (d > 0) cut += d * ca; else fill -= d * ca; }
    if (!n) { App.toast('Il poligono non interseca il modello del terreno', 'warn'); return; }
    Object.assign(f.properties, { vol_scavo_m3: +cut.toFixed(2), vol_riporto_m3: +fill.toFixed(2), quota_rif_m: +z0.toFixed(2) }); App.touch(); api().refresh();
    App.modal({ title: 'Volumi – ' + l.name, body: `<div class="kpi"><div class="card"><b>${App.fnum(cut, 1)} m³</b><span>scavo (sopra il piano)</span></div><div class="card"><b>${App.fnum(fill, 1)} m³</b><span>riporto (sotto il piano)</span></div><div class="card"><b>${App.fnum(cut - fill, 1)} m³</b><span>bilancio</span></div><div class="card"><b>${App.fnum(n * ca, 1)} m²</b><span>superficie calcolata</span></div></div><p class="small muted">Piano di riferimento ${App.fnum(z0, 2)} m · ${n} celle da ${App.fnum(Math.abs(cw), 2)} × ${App.fnum(Math.abs(ch), 2)} m. I valori sono stati salvati negli attributi del poligono.</p>` });
    App.audit('terra-volume', `Scavo ${cut.toFixed(1)} m³, riporto ${fill.toFixed(1)} m³`);
  };

  /* ---------- profilo altimetrico ---------- */
  T.profile = async () => {
    const f = selected('line'); if (!f) return; const l = await pickDTM('Profilo altimetrico'); if (!l) return;
    const coords = f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates[0]; const L = App.gis.local(coords[0]); const pts = []; let dist = 0;
    for (let i = 0; i < coords.length - 1; i++) { const a = coords[i], b = coords[i + 1]; const la = L.to(...a), lb = L.to(...b); const seg = G.dist(la, lb); const n = Math.max(2, Math.ceil(seg / 1)); for (let k = 0; k < n; k++) { const t = k / n; const z = T.sample(l, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); pts.push({ d: dist + seg * t, z }); } dist += seg; }
    const last = coords[coords.length - 1]; pts.push({ d: dist, z: T.sample(l, last[0], last[1]) });
    const valid = pts.filter(p => p.z != null); if (valid.length < 2) { App.toast('La linea non attraversa il modello del terreno', 'warn'); return; }
    const zmin = Math.min(...valid.map(p => p.z)), zmax = Math.max(...valid.map(p => p.z)); const Wd = 760, Hd = 260, pad = 40; const X = d => pad + d / dist * (Wd - pad - 10), Y = z => Hd - 28 - (z - zmin) / Math.max(.01, zmax - zmin) * (Hd - 50);
    let up = 0, down = 0; for (let i = 1; i < valid.length; i++) { const dz = valid[i].z - valid[i - 1].z; if (dz > 0) up += dz; else down -= dz; }
    const path = valid.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.z).toFixed(1)}`).join('');
    const svg = `<svg viewBox="0 0 ${Wd} ${Hd}" width="100%" style="background:#fafafa;border:1px solid var(--line);border-radius:4px"><path d="${path} L${X(dist)},${Hd - 28} L${X(0)},${Hd - 28} Z" fill="#0a6cff" fill-opacity=".12"/><path d="${path}" fill="none" stroke="#0a6cff" stroke-width="2"/>${[0, .25, .5, .75, 1].map(t => `<line x1="${pad}" x2="${Wd - 10}" y1="${Y(zmin + (zmax - zmin) * t)}" y2="${Y(zmin + (zmax - zmin) * t)}" stroke="#000" stroke-opacity=".08"/><text x="4" y="${Y(zmin + (zmax - zmin) * t) + 4}" font-size="10" fill="#5f5f5f">${App.fnum(zmin + (zmax - zmin) * t, 1)}</text>`).join('')}${[0, .25, .5, .75, 1].map(t => `<text x="${X(dist * t) - 10}" y="${Hd - 10}" font-size="10" fill="#5f5f5f">${App.fnum(dist * t, 0)} m</text>`).join('')}</svg>`;
    const res = await App.modal({ title: 'Profilo altimetrico – ' + l.name, size: 'wide', body: `${svg}<div class="kpi" style="margin-top:12px"><div class="card"><b>${App.fnum(dist, 1)} m</b><span>lunghezza</span></div><div class="card"><b>${App.fnum(zmin, 2)} – ${App.fnum(zmax, 2)} m</b><span>quote min – max</span></div><div class="card"><b>+${App.fnum(up, 1)} / −${App.fnum(down, 1)} m</b><span>dislivelli cumulati</span></div><div class="card"><b>${App.fnum((zmax - zmin) / Math.max(1, dist) * 100, 1)} %</b><span>pendenza media</span></div></div>`, actions: [{ label: App.t('close'), value: null }, { label: 'Esporta CSV', primary: true, value: 'csv' }] });
    if (res === 'csv') App.download('profilo.csv', App.geoformats.toCSV(valid.map(p => ({ progressiva_m: +p.d.toFixed(2), quota_m: +p.z.toFixed(3) })), ['progressiva_m', 'quota_m']), 'text/csv');
  };

  /* ---------- curve di livello (marching squares) ---------- */
  T.contours = async () => {
    const l = await pickDTM('Curve di livello'); if (!l) return; const st = l.stats || { min: Math.min(...l.grid.v.filter(v => v != null)), max: Math.max(...l.grid.v.filter(v => v != null)) };
    const r = await App.form('Curve di livello', [{ name: 'eq', label: 'Equidistanza (m)', type: 'number', value: +Math.max(.5, ((st.max - st.min) / 15)).toPrecision(2) }], 'Genera'); if (!r || !(r.eq > 0)) return;
    const g = l.grid, bb = l.bbox; const P = (x, y) => [bb[0] + (x + .5) / g.w * (bb[2] - bb[0]), bb[3] - (y + .5) / g.h * (bb[3] - bb[1])]; const v = (x, y) => g.v[y * g.w + x];
    const feats = [];
    for (let z = Math.ceil(st.min / r.eq) * r.eq; z <= st.max; z += r.eq) { const segs = [];
      for (let y = 0; y < g.h - 1; y++) for (let x = 0; x < g.w - 1; x++) { const c = [v(x, y), v(x + 1, y), v(x + 1, y + 1), v(x, y + 1)]; if (c.some(q => q == null)) continue; const corners = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]; const pts = [];
        for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4]; if ((a < z) !== (b < z)) { const t = (z - a) / (b - a); const A = corners[k], B = corners[(k + 1) % 4]; pts.push(P(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t)); } }
        if (pts.length === 2) segs.push(pts); else if (pts.length === 4) { segs.push([pts[0], pts[1]], [pts[2], pts[3]]); } }
      // concatenazione dei segmenti in polilinee
      const key = q => q[0].toFixed(9) + ',' + q[1].toFixed(9); const used = new Array(segs.length).fill(false); const ends = new Map(); segs.forEach((s, i) => [0, 1].forEach(k => { const kk = key(s[k]); (ends.get(kk) || ends.set(kk, []).get(kk)).push(i); }));
      for (let i = 0; i < segs.length; i++) { if (used[i]) continue; used[i] = true; let line = segs[i].slice(); let grow = true; while (grow) { grow = false; const kk = key(line[line.length - 1]); for (const j of ends.get(kk) || []) { if (used[j]) continue; used[j] = true; const s = segs[j]; line.push(key(s[0]) === kk ? s[1] : s[0]); grow = true; break; } } if (line.length > 2) feats.push({ id: App.uid(), geometry: { type: 'LineString', coordinates: line }, properties: { quota_m: +z.toFixed(2), maestra: Math.abs(z / (r.eq * 5) - Math.round(z / (r.eq * 5))) < 1e-6 } }); } }
    if (!feats.length) { App.toast('Nessuna curva generata', 'warn'); return; }
    App.gis.newLayer(api().P(), `Curve di livello ${r.eq} m – ${l.name}`, feats, { style: { mode: 'single', color: '#8a5a2b', width: 1, label: '' }, license: 'Elaborazione propria' }); api().refresh(); App.toast(`${feats.length} curve di livello generate`, 'ok');
  };

  /* ---------- statistiche zonali ---------- */
  T.zonal = async () => {
    const A = api(); const l = A.layerById(A.active()); if (!l || l.type !== 'vector' || !l.features.some(f => polysOf(f.geometry).length)) { App.toast('Rendi attivo un layer di poligoni', 'warn'); return; } const d = await pickDTM('Statistiche zonali'); if (!d) return;
    const g = d.grid, bb = d.bbox; let n = 0;
    l.features.forEach(f => { const ps = polysOf(f.geometry); if (!ps.length) return; const vals = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const lon = bb[0] + (x + .5) / g.w * (bb[2] - bb[0]), lat = bb[3] - (y + .5) / g.h * (bb[3] - bb[1]); if (!ps.some(pl => G.pip([lon, lat], pl[0]))) continue; const v = g.v[y * g.w + x]; if (v != null) vals.push(v); } if (!vals.length) return; n++; const m = vals.reduce((a, b) => a + b, 0) / vals.length; Object.assign(f.properties, { z_min: +Math.min(...vals).toFixed(2), z_max: +Math.max(...vals).toFixed(2), z_media: +m.toFixed(2), z_dev: +Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length).toFixed(2) }); });
    App.touch(); A.refresh(); App.toast(`Statistiche calcolate su ${n} poligoni (z_min, z_max, z_media, z_dev)`, 'ok');
  };

  /* ---------- nuvole di punti LAS ---------- */
  T.readLAS = async (file, maxPts = 400000) => {
    const buf = await App.readBuf(file); const dv = new DataView(buf); if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'LASF') throw new Error('Non è un file LAS (i LAZ compressi vanno prima decompressi)');
    const vmaj = dv.getUint8(24), vmin = dv.getUint8(25); const off = dv.getUint32(96, true); const fmt = dv.getUint8(104) & 0x3f; const rlen = dv.getUint16(105, true);
    let n = dv.getUint32(107, true); if (vmin >= 4 && n === 0) n = Number(dv.getBigUint64(247, true));
    const sc = [dv.getFloat64(131, true), dv.getFloat64(139, true), dv.getFloat64(147, true)], of = [dv.getFloat64(155, true), dv.getFloat64(163, true), dv.getFloat64(171, true)];
    const bbox = { maxX: dv.getFloat64(179, true), minX: dv.getFloat64(187, true), maxY: dv.getFloat64(195, true), minY: dv.getFloat64(203, true), maxZ: dv.getFloat64(211, true), minZ: dv.getFloat64(219, true) };
    const rgbOff = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 }[fmt]; const step = Math.max(1, Math.ceil(n / maxPts)); const m = Math.ceil(n / step);
    const xyz = new Float64Array(m * 3), rgb = rgbOff != null ? new Uint8Array(m * 3) : null; const cls = new Uint8Array(m); let k = 0;
    for (let i = 0; i < n && k < m; i += step) { const p = off + i * rlen; if (p + rlen > buf.byteLength) break; xyz[k * 3] = dv.getInt32(p, true) * sc[0] + of[0]; xyz[k * 3 + 1] = dv.getInt32(p + 4, true) * sc[1] + of[1]; xyz[k * 3 + 2] = dv.getInt32(p + 8, true) * sc[2] + of[2]; cls[k] = fmt >= 6 ? dv.getUint8(p + 16) : dv.getUint8(p + 15) & 31; if (rgb) { rgb[k * 3] = dv.getUint16(p + rgbOff, true) >> 8; rgb[k * 3 + 1] = dv.getUint16(p + rgbOff + 2, true) >> 8; rgb[k * 3 + 2] = dv.getUint16(p + rgbOff + 4, true) >> 8; } k++; }
    return { version: `${vmaj}.${vmin}`, format: fmt, count: n, loaded: k, xyz: xyz.subarray(0, k * 3), rgb: rgb && rgb.subarray(0, k * 3), cls: cls.subarray(0, k), bbox, name: file.name };
  };
  T.lasImport = async () => {
    const [file] = await App.pickFiles({ accept: '.las,.LAS' }); if (!file) return;
    let pc; try { App.toast('Lettura nuvola di punti…'); pc = await T.readLAS(file); } catch (e) { App.toast(e.message, 'err'); return; }
    const r = await App.form(`Nuvola di punti – ${file.name}`, [{ type: 'html', html: `<div class="small">LAS ${pc.version} · formato ${pc.format} · ${pc.count.toLocaleString('it-IT')} punti (${pc.loaded.toLocaleString('it-IT')} caricati)${pc.rgb ? ' · colori RGB' : ''}<br>Estensione X ${App.fnum(pc.bbox.minX, 2)}–${App.fnum(pc.bbox.maxX, 2)} · Y ${App.fnum(pc.bbox.minY, 2)}–${App.fnum(pc.bbox.maxY, 2)} · Z ${App.fnum(pc.bbox.minZ, 2)}–${App.fnum(pc.bbox.maxZ, 2)}</div>` }, { name: 'crs', label: 'Sistema di riferimento delle coordinate', type: 'select', options: App.crs.list().filter(c => !App.crs.isGeo(c.code)).map(c => ({ value: c.code, label: c.code + ' – ' + c.name })), value: api().P().crs }, { name: 'act', label: 'Operazione', type: 'select', options: [{ value: 'view', label: 'Visualizza in 3D' }, { value: 'dsm', label: 'Genera DSM (modello della superficie) come raster' }, { value: 'dtm', label: 'Genera DTM dai punti classificati "terreno" (classe 2)' }, { value: 'both', label: 'Visualizza e genera DSM' }] }, { name: 'cell', label: 'Risoluzione raster (m)', type: 'number', value: 1 }], 'Continua');
    if (!r) return; pc.crs = r.crs;
    if (r.act === 'view' || r.act === 'both') T.view3D(pc);
    if (r.act === 'dsm' || r.act === 'dtm' || r.act === 'both') T.rasterFromCloud(pc, r.cell, r.act === 'dtm');
    App.audit('terra-las', file.name);
  };
  T.rasterFromCloud = (pc, cell, groundOnly) => {
    const b = pc.bbox; const W = Math.min(400, Math.max(2, Math.ceil((b.maxX - b.minX) / cell))), H = Math.min(400, Math.max(2, Math.ceil((b.maxY - b.minY) / cell))); const cw = (b.maxX - b.minX) / W, ch = (b.maxY - b.minY) / H;
    const z = new Float32Array(W * H).fill(NaN); let used = 0;
    for (let i = 0; i < pc.xyz.length / 3; i++) { if (groundOnly && pc.cls[i] !== 2) continue; const x = Math.min(W - 1, Math.floor((pc.xyz[i * 3] - b.minX) / cw)), y = Math.min(H - 1, Math.floor((b.maxY - pc.xyz[i * 3 + 1]) / ch)); const v = pc.xyz[i * 3 + 2]; const j = y * W + x; if (isNaN(z[j]) || (groundOnly ? v < z[j] : v > z[j])) z[j] = v; used++; }
    if (!used) { App.toast(groundOnly ? 'Nessun punto di classe 2 (terreno) nella nuvola' : 'Nessun punto', 'warn'); return; }
    // riempimento dei vuoti con la media dei vicini
    for (let it = 0; it < 6; it++) for (let j = 0; j < z.length; j++) if (isNaN(z[j])) { const x = j % W, y = (j / W) | 0; let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const v = z[yy * W + xx]; if (!isNaN(v)) { s += v; n++; } } if (n) z[j] = s / n; }
    let mn = Infinity, mx = -Infinity; z.forEach(v => { if (!isNaN(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); } });
    const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d'); const id = ctx.createImageData(W, H);
    const ramp = t => { const cs = [[40, 120, 80], [130, 180, 90], [230, 220, 140], [190, 140, 90], [245, 245, 245]]; const x = Math.max(0, Math.min(.999, t)) * (cs.length - 1); const i = Math.floor(x), f = x - i; return cs[i].map((v, k) => v + (cs[i + 1][k] - v) * f); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const j = y * W + x, v = z[j]; if (isNaN(v)) continue; const dzx = (z[y * W + Math.min(W - 1, x + 1)] - z[y * W + Math.max(0, x - 1)]) / (2 * cw) || 0, dzy = (z[Math.min(H - 1, y + 1) * W + x] - z[Math.max(0, y - 1) * W + x]) / (2 * ch) || 0; const sh = Math.max(.35, Math.min(1.15, .85 + (-dzx * .5 + dzy * .5) * .6)); const col = ramp((v - mn) / Math.max(1e-9, mx - mn)); id.data[j * 4] = col[0] * sh; id.data[j * 4 + 1] = col[1] * sh; id.data[j * 4 + 2] = col[2] * sh; id.data[j * 4 + 3] = 255; }
    ctx.putImageData(id, 0, 0);
    const a = App.crs.toWgs(b.minX, b.minY, pc.crs), d = App.crs.toWgs(b.maxX, b.maxY, pc.crs); const bbox = [Math.min(a[0], d[0]), Math.min(a[1], d[1]), Math.max(a[0], d[0]), Math.max(a[1], d[1])];
    const gs = Math.min(1, 200 / Math.max(W, H)); const gw = Math.max(2, Math.round(W * gs)), gh = Math.max(2, Math.round(H * gs)); const grid = { w: gw, h: gh, v: [] }; for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const v = z[Math.floor(y / gs) * W + Math.floor(x / gs)]; grid.v.push(isNaN(v) ? null : +v.toFixed(2)); }
    const A = api(); A.layers().push({ id: App.uid(), name: `${groundOnly ? 'DTM' : 'DSM'} da ${pc.name} (${cell} m)`, type: 'raster', data: c.toDataURL('image/png'), bbox, visible: true, opacity: .9, grid, stats: { min: mn, max: mx }, srcCrs: pc.crs, license: 'Elaborazione propria', meta: { title: `${groundOnly ? 'DTM' : 'DSM'} da nuvola di punti`, lineage: `Rasterizzazione di ${pc.loaded} punti LAS, cella ${cell} m, ${pc.crs}` } });
    App.touch(); A.refresh(); App.gis.zoomTo(bbox); App.toast(`${groundOnly ? 'DTM' : 'DSM'} generato: ${W}×${H} celle, quote ${App.fnum(mn, 1)}–${App.fnum(mx, 1)} m`, 'ok');
  };
  T.view3D = async pc => {
    const { THREE, OrbitControls } = await App.loadBIM();
    const host = document.createElement('div'); host.style.cssText = 'height:70vh;position:relative;background:#0d0f13;border-radius:4px;overflow:hidden';
    const mode = document.createElement('div'); mode.style.cssText = 'position:absolute;left:10px;top:10px;z-index:2;display:flex;gap:4px'; mode.innerHTML = `${pc.rgb ? '<button class="btn sm" data-c="rgb">RGB</button>' : ''}<button class="btn sm" data-c="z">Quota</button><button class="btn sm" data-c="cls">Classificazione</button><span class="pill" style="background:#222;color:#ddd">${pc.loaded.toLocaleString('it-IT')} punti</span>`; host.appendChild(mode);
    const close = App.modal({ title: 'Nuvola di punti – ' + pc.name, size: 'xwide', body: host });
    await new Promise(r => setTimeout(r, 50));
    const W = host.clientWidth, H = host.clientHeight; const ren = new THREE.WebGLRenderer({ antialias: true }); ren.setSize(W, H); ren.setPixelRatio(Math.min(2, devicePixelRatio)); host.appendChild(ren.domElement);
    const sc = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(55, W / H, .1, 1e6);
    const b = pc.bbox, cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2, cz = b.minZ; const n = pc.xyz.length / 3; const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = pc.xyz[i * 3] - cx; pos[i * 3 + 1] = pc.xyz[i * 3 + 2] - cz; pos[i * 3 + 2] = -(pc.xyz[i * 3 + 1] - cy); }
    const CLS = { 2: [.62, .45, .25], 3: [.5, .8, .3], 4: [.3, .7, .2], 5: [.1, .5, .1], 6: [.9, .3, .3], 9: [.2, .5, .9] };
    const paint = m => { for (let i = 0; i < n; i++) { let c; if (m === 'rgb' && pc.rgb) c = [pc.rgb[i * 3] / 255, pc.rgb[i * 3 + 1] / 255, pc.rgb[i * 3 + 2] / 255]; else if (m === 'cls') c = CLS[pc.cls[i]] || [.7, .7, .7]; else { const t = (pc.xyz[i * 3 + 2] - b.minZ) / Math.max(1e-6, b.maxZ - b.minZ); c = new THREE.Color().setHSL(.66 - .66 * t, .85, .5).toArray(); } col.set(c, i * 3); } geo.attributes.color.needsUpdate = true; };
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); paint(pc.rgb ? 'rgb' : 'z');
    sc.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: Math.max(.05, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 1500), vertexColors: true })));
    const ext = Math.hypot(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ); cam.position.set(ext * .6, ext * .5, ext * .6); const ctl = new OrbitControls(cam, ren.domElement); ctl.target.set(0, (b.maxZ - b.minZ) / 3, 0); ctl.update();
    let alive = true; const loop = () => { if (!alive || !host.isConnected) { ren.dispose(); return; } ren.render(sc, cam); requestAnimationFrame(loop); }; loop();
    $$('[data-c]', mode).forEach(x => x.onclick = () => paint(x.dataset.c));
    close.then(() => { alive = false; });
  };
})();
