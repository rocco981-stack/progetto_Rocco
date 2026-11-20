/* BeCity – estensioni GIS con componenti open source:
   GeoPackage (sql.js / SQLite, MIT), GeoTIFF e COG (geotiff.js, MIT), PostGIS (driver pg, MIT, via server locale). */
'use strict';
(function () {
  const X = App.gisx = {};
  const G = App.geom;
  const loadScript = src => new Promise((ok, ko) => { if (document.querySelector(`script[data-src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.dataset.src = src; s.onload = ok; s.onerror = () => ko(new Error('Impossibile caricare ' + src)); document.head.appendChild(s); });
  let SQLp = null;
  const sql = () => SQLp || (SQLp = loadScript('vendor/sqljs/sql-wasm.js').then(async () => window.initSqlJs(App.BUNDLED ? { wasmBinary: await App.wasmBytes('sqljs') } : { locateFile: f => 'vendor/sqljs/' + f })));
  X.sql = sql;
  const geotiff = () => loadScript('vendor/geotiff/geotiff.js').then(() => window.GeoTIFF);

  /* ---------- WKB ---------- */
  X.readWKB = (u8, off = 0) => {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let p = off;
    const geom = () => { const le = dv.getUint8(p) === 1; p++; let t = dv.getUint32(p, le); p += 4; let hasZ = false, hasM = false;
      if (t & 0x80000000) { hasZ = true; } if (t & 0x40000000) hasM = true; if (t & 0x20000000) p += 4; t &= 0x0FFFFFFF;
      if (t > 3000) { hasZ = hasM = true; t -= 3000; } else if (t > 2000) { hasM = true; t -= 2000; } else if (t > 1000) { hasZ = true; t -= 1000; }
      const dim = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);
      const pt = () => { const x = dv.getFloat64(p, le), y = dv.getFloat64(p + 8, le); const z = hasZ ? dv.getFloat64(p + 16, le) : undefined; p += 8 * dim; return z !== undefined ? [x, y, z] : [x, y]; };
      const pts = () => { const n = dv.getUint32(p, le); p += 4; const a = []; for (let i = 0; i < n; i++) a.push(pt()); return a; };
      const rings = () => { const n = dv.getUint32(p, le); p += 4; const a = []; for (let i = 0; i < n; i++) a.push(pts()); return a; };
      const multi = () => { const n = dv.getUint32(p, le); p += 4; const a = []; for (let i = 0; i < n; i++) a.push(geom()); return a; };
      switch (t) { case 1: return { type: 'Point', coordinates: pt() }; case 2: return { type: 'LineString', coordinates: pts() }; case 3: return { type: 'Polygon', coordinates: rings() };
        case 4: return { type: 'MultiPoint', coordinates: multi().map(g => g.coordinates) }; case 5: return { type: 'MultiLineString', coordinates: multi().map(g => g.coordinates) }; case 6: return { type: 'MultiPolygon', coordinates: multi().map(g => g.coordinates) };
        case 7: return { type: 'GeometryCollection', geometries: multi() }; default: throw new Error('Tipo WKB non supportato: ' + t); } };
    return geom();
  };
  X.writeWKB = g => {
    const parts = []; const u32 = v => { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, v, true); parts.push(new Uint8Array(b.buffer)); }; const f64 = v => { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, v, true); parts.push(new Uint8Array(b.buffer)); };
    const hdr = t => { parts.push(new Uint8Array([1])); u32(t); }; const pt = c => { f64(c[0]); f64(c[1]); }; const pts = a => { u32(a.length); a.forEach(pt); }; const rings = r => { u32(r.length); r.forEach(pts); };
    const w = g => { switch (g.type) { case 'Point': hdr(1); pt(g.coordinates); break; case 'LineString': hdr(2); pts(g.coordinates); break; case 'Polygon': hdr(3); rings(g.coordinates); break;
      case 'MultiPoint': hdr(4); u32(g.coordinates.length); g.coordinates.forEach(c => { hdr(1); pt(c); }); break; case 'MultiLineString': hdr(5); u32(g.coordinates.length); g.coordinates.forEach(c => { hdr(2); pts(c); }); break;
      case 'MultiPolygon': hdr(6); u32(g.coordinates.length); g.coordinates.forEach(c => { hdr(3); rings(c); }); break; case 'GeometryCollection': hdr(7); u32(g.geometries.length); g.geometries.forEach(w); break; } };
    w(g); const len = parts.reduce((a, b) => a + b.length, 0); const out = new Uint8Array(len); let o = 0; parts.forEach(b => { out.set(b, o); o += b.length; }); return out;
  };
  const gpGeom = (blob) => { if (!blob || blob.length < 8 || blob[0] !== 0x47 || blob[1] !== 0x50) return blob ? X.readWKB(blob) : null; const flags = blob[3]; const env = (flags >> 1) & 7; const envLen = [0, 32, 48, 48, 64][env] || 0; if (flags & 0x10) return null; return X.readWKB(blob, 8 + envLen); };
  const gpBlob = (g, srs) => { const wkb = X.writeWKB(g); const b = G.bbox(App.geoformats.allCoords(g)); const h = new DataView(new ArrayBuffer(40)); h.setUint8(0, 0x47); h.setUint8(1, 0x50); h.setUint8(2, 0); h.setUint8(3, 0b00000011); h.setInt32(4, srs, true); [b[0], b[2], b[1], b[3]].forEach((v, i) => h.setFloat64(8 + i * 8, v, true)); const out = new Uint8Array(40 + wkb.length); out.set(new Uint8Array(h.buffer), 0); out.set(wkb, 40); return out; };

  /* ---------- GeoPackage ---------- */
  X.readGPKG = async file => {
    const SQL = await sql(); const db = new SQL.Database(new Uint8Array(await App.readBuf(file)));
    try {
      const q = (s, p) => { const st = db.prepare(s); if (p) st.bind(p); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; };
      const contents = q("SELECT table_name, data_type, identifier, srs_id FROM gpkg_contents");
      const layers = [];
      for (const c of contents.filter(c => c.data_type === 'features')) {
        const gc = q('SELECT column_name, geometry_type_name, srs_id FROM gpkg_geometry_columns WHERE table_name = ?', [c.table_name])[0]; if (!gc) continue;
        const srs = q('SELECT organization, organization_coordsys_id, definition FROM gpkg_spatial_ref_sys WHERE srs_id = ?', [gc.srs_id])[0] || {};
        let crs = srs.organization && String(srs.organization).toUpperCase() === 'EPSG' ? 'EPSG:' + srs.organization_coordsys_id : App.crs.detectPrj(srs.definition) || 'EPSG:4326';
        if (!App.crs.defs[crs]) crs = App.crs.detectPrj(srs.definition) || null;
        const rows = q(`SELECT * FROM "${c.table_name.replace(/"/g, '""')}"`);
        const feats = rows.map(r => { const g = gpGeom(r[gc.column_name]); const props = {}; Object.entries(r).forEach(([k, v]) => { if (k !== gc.column_name && !(v instanceof Uint8Array)) props[k] = v; }); return g ? { id: App.uid(), geometry: g, properties: props } : null; }).filter(Boolean);
        layers.push({ name: c.identifier || c.table_name, features: feats, srcCrs: crs, srsDef: srs.definition, geomType: gc.geometry_type_name });
      }
      const tiles = contents.filter(c => c.data_type === 'tiles').map(c => c.table_name);
      return { layers, tiles };
    } finally { db.close(); }
  };
  X.writeGPKG = async (layer, crs) => {
    const SQL = await sql(); const db = new SQL.Database(); const code = +crs.split(':')[1]; const tn = App.slug(layer.name).toLowerCase() || 'layer';
    db.run('PRAGMA application_id = 1196444487'); db.run('PRAGMA user_version = 10300');
    db.run(`CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT)`);
    db.run(`INSERT INTO gpkg_spatial_ref_sys VALUES ('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', NULL), ('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', NULL), ('WGS 84 geodetic', 4326, 'EPSG', 4326, ?, NULL)`, [App.crs.wktOf('EPSG:4326')]);
    if (code !== 4326) db.run('INSERT INTO gpkg_spatial_ref_sys VALUES (?, ?, ?, ?, ?, NULL)', [App.crs.defs[crs].name, code, 'EPSG', code, App.crs.wktOf(crs)]);
    db.run(`CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER)`);
    db.run(`CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name))`);
    const fields = [...new Set(layer.features.flatMap(f => Object.keys(f.properties || {})))].filter(k => k.toLowerCase() !== 'fid' && k.toLowerCase() !== 'geom');
    const typeOf = k => layer.features.every(f => f.properties[k] == null || typeof f.properties[k] === 'number') ? (layer.features.every(f => f.properties[k] == null || Number.isInteger(f.properties[k])) ? 'INTEGER' : 'REAL') : 'TEXT';
    db.run(`CREATE TABLE "${tn}" (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB${fields.map(k => `, "${k.replace(/"/g, '')}" ${typeOf(k)}`).join('')})`);
    const geoms = layer.features.map(f => App.geoformats.reproj(f.geometry, 'EPSG:4326', crs)); const bb = G.bbox(geoms.flatMap(g => App.geoformats.allCoords(g)));
    const gt = [...new Set(geoms.map(g => g.type.toUpperCase()))]; const gtype = gt.length === 1 ? gt[0] : 'GEOMETRY';
    db.run('INSERT INTO gpkg_contents (table_name, data_type, identifier, description, min_x, min_y, max_x, max_y, srs_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [tn, 'features', layer.name, (layer.meta && layer.meta.abstract) || '', ...bb, code]);
    db.run('INSERT INTO gpkg_geometry_columns VALUES (?, ?, ?, ?, 0, 0)', [tn, 'geom', gtype, code]);
    const st = db.prepare(`INSERT INTO "${tn}" (geom${fields.map(k => `, "${k.replace(/"/g, '')}"`).join('')}) VALUES (?${fields.map(() => ', ?').join('')})`);
    layer.features.forEach((f, i) => st.run([gpBlob(geoms[i], code), ...fields.map(k => { const v = f.properties[k]; return v == null ? null : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 1 : 0) : v; })]));
    st.free(); const out = db.export(); db.close(); return out;
  };

  /* ---------- GeoTIFF / COG ---------- */
  X.readGeoTIFF = async file => {
    const GT = await geotiff(); const tiff = await GT.fromArrayBuffer(await App.readBuf(file)); const img = await tiff.getImage();
    const W = img.getWidth(), H = img.getHeight(), bb = img.getBoundingBox(), keys = img.getGeoKeys() || {};
    const epsg = keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey; let crs = epsg && epsg !== 32767 ? 'EPSG:' + epsg : null;
    if (!crs || !App.crs.defs[crs]) { const r = await App.form(`Sistema di riferimento di ${file.name}`, [{ name: 'c', label: `EPSG ${epsg || 'non dichiarato'}: scegli il CRS`, type: 'select', options: App.crs.list().map(c => ({ value: c.code, label: c.code + ' – ' + c.name })), value: App.project().crs }], 'Continua'); if (!r) return null; crs = r.c; }
    const sc = Math.min(1, 1600 / Math.max(W, H)); const w = Math.max(1, Math.round(W * sc)), h = Math.max(1, Math.round(H * sc));
    const spp = img.getSamplesPerPixel(); const nodata = img.getGDALNoData();
    const ras = await img.readRasters({ width: w, height: h, resampleMethod: 'bilinear', interleave: false });
    const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); const id = ctx.createImageData(w, h);
    let stats = null, grid = null;
    if (spp >= 3) { for (let i = 0; i < w * h; i++) { id.data[i * 4] = ras[0][i]; id.data[i * 4 + 1] = ras[1][i]; id.data[i * 4 + 2] = ras[2][i]; id.data[i * 4 + 3] = spp > 3 ? ras[3][i] : 255; } }
    else { // banda singola: DTM/DSM → rampa altimetrica con ombreggiatura
      const b = ras[0]; let mn = Infinity, mx = -Infinity; for (let i = 0; i < b.length; i++) { const v = b[i]; if (v === nodata || !isFinite(v)) continue; if (v < mn) mn = v; if (v > mx) mx = v; } stats = { min: mn, max: mx };
      const ramp = t => { const cs = [[40, 120, 80], [130, 180, 90], [230, 220, 140], [190, 140, 90], [245, 245, 245]]; const x = Math.max(0, Math.min(.999, t)) * (cs.length - 1); const i = Math.floor(x), f = x - i; return cs[i].map((v, k) => v + (cs[i + 1][k] - v) * f); };
      const cell = Math.abs(bb[2] - bb[0]) / w; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, v = b[i]; if (v === nodata || !isFinite(v)) { id.data[i * 4 + 3] = 0; continue; } const dzx = (b[y * w + Math.min(w - 1, x + 1)] - b[y * w + Math.max(0, x - 1)]) / (2 * cell), dzy = (b[Math.min(h - 1, y + 1) * w + x] - b[Math.max(0, y - 1) * w + x]) / (2 * cell); const shade = Math.max(.35, Math.min(1.15, .85 + (-dzx * .5 + dzy * .5) * .6)); const col = ramp((v - mn) / Math.max(1e-9, mx - mn)); id.data[i * 4] = col[0] * shade; id.data[i * 4 + 1] = col[1] * shade; id.data[i * 4 + 2] = col[2] * shade; id.data[i * 4 + 3] = 255; }
      const gs = Math.min(1, 200 / Math.max(w, h)); const gw = Math.max(1, Math.round(w * gs)), gh = Math.max(1, Math.round(h * gs)); grid = { w: gw, h: gh, v: [] }; for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const v = b[Math.floor(y / gs) * w + Math.floor(x / gs)]; grid.v.push(v === nodata || !isFinite(v) ? null : +(+v).toFixed(2)); } }
    ctx.putImageData(id, 0, 0);
    const a = App.crs.toWgs(bb[0], bb[1], crs), d = App.crs.toWgs(bb[2], bb[3], crs), b2 = App.crs.toWgs(bb[0], bb[3], crs), c2 = App.crs.toWgs(bb[2], bb[1], crs);
    const wbb = [Math.min(a[0], b2[0]), Math.min(a[1], c2[1]), Math.max(d[0], c2[0]), Math.max(d[1], b2[1])];
    return { name: file.name, data: c.toDataURL(spp >= 3 ? 'image/jpeg' : 'image/png', .9), bbox: wbb, crs, size: [W, H], bands: spp, stats, grid, srcBBox: bb };
  };

  /* ---------- PostGIS (tramite server locale) ---------- */
  const api = async (op, body) => { const r = await fetch('api/postgis/' + op, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j; };
  const connForm = async (title, extra = []) => { const last = App.state.settings.postgis || { host: 'localhost', port: 5432, database: 'gis', user: 'postgres' };
    const r = await App.form(title, [{ type: 'html', html: '<div class="small muted">Connessione a un database PostgreSQL/PostGIS raggiungibile dal computer (es. localhost). La password non viene salvata.</div>' }, { name: 'host', label: 'Host', value: last.host }, { name: 'port', label: 'Porta', type: 'number', value: last.port }, { name: 'database', label: 'Database', value: last.database }, { name: 'user', label: 'Utente', value: last.user }, { name: 'password', label: 'Password', type: 'password', value: '' }, ...extra], 'Connetti');
    if (r) { App.state.settings.postgis = { host: r.host, port: r.port, database: r.database, user: r.user }; App.save(); } return r; };
  X.postgisImport = async (viewBBox) => {
    if (!location.protocol.startsWith('http')) { App.toast('PostGIS richiede il server locale (avvia.bat / avvia.sh con Node.js)', 'warn'); return null; }
    const st = await fetch('api/status').then(r => r.json()).catch(() => null); if (!st || !st.postgis) { App.toast('Il server locale non supporta PostGIS: avviare con Node.js (server.js).', 'warn'); return null; }
    const conn = await connForm('Connessione PostGIS'); if (!conn) return null; const { password, ...c } = conn; const cc = { ...c, password };
    let L; try { L = await api('layers', { conn: cc }); } catch (e) { App.toast('PostGIS: ' + e.message, 'err'); return null; }
    if (!L.layers.length) { App.toast('Nessuna tabella geometrica nel database', 'warn'); return null; }
    const r = await App.form('Tabella PostGIS da caricare', [{ type: 'html', html: `<div class="tiny faint">${App.esc(L.version || '')}</div>` }, { name: 't', label: 'Tabella', type: 'select', options: L.layers.map((l, i) => ({ value: i, label: `${l.schema}.${l.table} (${l.type}, EPSG:${l.srid})` })) }, { name: 'bb', label: 'Solo nell\'estensione della mappa (filtro spaziale lato server)', type: 'checkbox', value: true }, { name: 'lim', label: 'Numero massimo di feature', type: 'number', value: 5000 }], 'Carica');
    if (!r) return null; const l = L.layers[+r.t];
    const fc = await api('features', { conn: cc, schema: l.schema, table: l.table, geom: l.geom, bbox: r.bb ? viewBBox : null, limit: r.lim });
    return { name: `${l.schema}.${l.table}`, features: fc.features.map(f => ({ id: App.uid(), geometry: f.geometry, properties: f.properties })), srcCrs: 'EPSG:' + l.srid, attribution: 'PostGIS ' + c.database };
  };
  X.postgisExport = async layer => {
    if (!location.protocol.startsWith('http')) { App.toast('PostGIS richiede il server locale', 'warn'); return; }
    const conn = await connForm(`Scrivi “${layer.name}” in PostGIS`, [{ name: 'schema', label: 'Schema', value: 'public' }, { name: 'table', label: 'Tabella', value: App.slug(layer.name).toLowerCase() }, { name: 'srid', label: 'SRID di destinazione', type: 'select', options: App.crs.list().filter(x => /^\d+$/.test(x.code.split(':')[1])).map(x => ({ value: x.code.split(':')[1], label: x.code + ' – ' + x.name })), value: App.project().crs.split(':')[1] }, { name: 'replace', label: 'Sostituisci la tabella se esiste', type: 'checkbox', value: false }]);
    if (!conn) return; try { const r = await api('write', { conn: { host: conn.host, port: conn.port, database: conn.database, user: conn.user, password: conn.password }, schema: conn.schema, table: conn.table, srid: +conn.srid, replace: conn.replace, features: layer.features.map(f => ({ geometry: f.geometry, properties: f.properties })) }); App.toast(`${r.inserted} feature scritte in ${conn.schema}.${conn.table}`, 'ok'); App.audit('postgis-write', conn.table); } catch (e) { App.toast('PostGIS: ' + e.message, 'err'); }
  };
})();
