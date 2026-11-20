/* BeCity – formati GIS: Shapefile (shp/shx/dbf/prj/cpg), GeoJSON, KML, GPX, CSV/WKT, SLD, metadati RNDT */
'use strict';
(function () {
  const F = App.geoformats = {};
  const G = App.geom;
  /* ---------- WKT ---------- */
  F.parseWKT = s => {
    s = s.trim(); const m = s.match(/^(\w+)\s*(Z|M|ZM)?\s*\((.*)\)$/is); if (!m) return null;
    const type = m[1].toUpperCase(), body = m[3];
    const pt = t => t.trim().split(/\s+/).map(Number).slice(0, 2);
    const ring = t => t.replace(/[()]/g, '').split(',').map(pt);
    const split = (t) => { const out = []; let d = 0, cur = ''; for (const ch of t) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur); return out; };
    if (type === 'POINT') return { type: 'Point', coordinates: pt(body) };
    if (type === 'LINESTRING') return { type: 'LineString', coordinates: ring(body) };
    if (type === 'POLYGON') return { type: 'Polygon', coordinates: split(body).map(ring) };
    if (type === 'MULTIPOINT') return { type: 'MultiPoint', coordinates: ring(body) };
    if (type === 'MULTILINESTRING') return { type: 'MultiLineString', coordinates: split(body).map(ring) };
    if (type === 'MULTIPOLYGON') return { type: 'MultiPolygon', coordinates: split(body).map(p => split(p.trim().replace(/^\(|\)$/g, '')).map(ring)) };
    return null;
  };
  F.toWKT = g => {
    const c = p => p.slice(0, 2).map(v => +v.toFixed(8)).join(' '), r = a => '(' + a.map(c).join(', ') + ')';
    switch (g.type) { case 'Point': return `POINT (${c(g.coordinates)})`; case 'LineString': return `LINESTRING ${r(g.coordinates)}`; case 'Polygon': return `POLYGON (${g.coordinates.map(r).join(', ')})`;
      case 'MultiPoint': return `MULTIPOINT ${r(g.coordinates)}`; case 'MultiLineString': return `MULTILINESTRING (${g.coordinates.map(r).join(', ')})`; case 'MultiPolygon': return `MULTIPOLYGON (${g.coordinates.map(p => '(' + p.map(r).join(', ') + ')').join(', ')})`; }
    return '';
  };
  /* ---------- trasformazione coordinate di una geometria ---------- */
  F.mapCoords = (g, fn) => {
    const m1 = p => { const q = fn(p[0], p[1]); return p.length > 2 ? [q[0], q[1], p[2]] : q; };
    const t = { Point: c => m1(c), MultiPoint: c => c.map(m1), LineString: c => c.map(m1), MultiLineString: c => c.map(l => l.map(m1)), Polygon: c => c.map(l => l.map(m1)), MultiPolygon: c => c.map(p => p.map(l => l.map(m1))) };
    if (g.type === 'GeometryCollection') return { type: g.type, geometries: g.geometries.map(x => F.mapCoords(x, fn)) };
    return { type: g.type, coordinates: t[g.type](g.coordinates) };
  };
  F.reproj = (g, from, to) => from === to ? g : F.mapCoords(g, (x, y) => App.crs.transform(x, y, from, to));
  F.allCoords = g => { const o = []; const walk = c => { if (typeof c[0] === 'number') o.push(c); else c.forEach(walk); }; if (g.type === 'GeometryCollection') g.geometries.forEach(x => o.push(...F.allCoords(x))); else walk(g.coordinates); return o; };
  F.baseType = t => t.replace('Multi', '');
  /* ---------- DBF ---------- */
  F.readDBF = (buf, encoding = 'windows-1252') => {
    const dv = new DataView(buf), u8 = new Uint8Array(buf); const n = dv.getUint32(4, true), hl = dv.getUint16(8, true), rl = dv.getUint16(10, true);
    let dec; try { dec = new TextDecoder(encoding); } catch (e) { dec = new TextDecoder('windows-1252'); }
    const fields = []; for (let p = 32; p < hl - 1 && u8[p] !== 0x0D; p += 32) { let name = ''; for (let i = 0; i < 11 && u8[p + i]; i++) name += String.fromCharCode(u8[p + i]); fields.push({ name, type: String.fromCharCode(u8[p + 11]), len: u8[p + 16], dec: u8[p + 17] }); }
    const recs = [];
    for (let r = 0; r < n; r++) { let p = hl + r * rl; if (u8[p] === 0x2A) { recs.push(null); continue; } p++; const o = {};
      for (const f of fields) { const raw = dec.decode(u8.subarray(p, p + f.len)).trim(); p += f.len;
        o[f.name] = f.type === 'N' || f.type === 'F' ? (raw === '' || raw.startsWith('*') ? null : Number(raw)) : f.type === 'L' ? /^[YyTt]/.test(raw) : f.type === 'D' && raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw; }
      recs.push(o); }
    return { fields, recs };
  };
  F.writeDBF = (rows, fieldsIn) => {
    const enc = new TextEncoder(); const used = new Set();
    const fields = fieldsIn.map(f => { let nm = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 10) || 'F'; let k = 1; while (used.has(nm.toUpperCase())) nm = nm.slice(0, 8) + '_' + (k++); used.add(nm.toUpperCase());
      const vals = rows.map(r => r[f.name]); const num = vals.every(v => v === null || v === undefined || v === '' || (typeof v === 'number' && isFinite(v))) && vals.some(v => typeof v === 'number'); const bool = !num && vals.every(v => v === null || v === undefined || typeof v === 'boolean') && vals.some(v => typeof v === 'boolean');
      if (num) { const dec = vals.some(v => typeof v === 'number' && !Number.isInteger(v)) ? 6 : 0; return { src: f.name, name: nm, type: 'N', len: 19, dec }; }
      if (bool) return { src: f.name, name: nm, type: 'L', len: 1, dec: 0 };
      const len = Math.min(254, Math.max(1, ...vals.map(v => v == null ? 0 : enc.encode(typeof v === 'object' ? JSON.stringify(v) : String(v)).length))); return { src: f.name, name: nm, type: 'C', len, dec: 0 }; });
    const hl = 32 + fields.length * 32 + 1, rl = 1 + fields.reduce((a, f) => a + f.len, 0);
    const buf = new ArrayBuffer(hl + rl * rows.length + 1), dv = new DataView(buf), u8 = new Uint8Array(buf); const d = new Date();
    dv.setUint8(0, 3); dv.setUint8(1, d.getFullYear() - 1900); dv.setUint8(2, d.getMonth() + 1); dv.setUint8(3, d.getDate()); dv.setUint32(4, rows.length, true); dv.setUint16(8, hl, true); dv.setUint16(10, rl, true); dv.setUint8(29, 0);
    fields.forEach((f, i) => { const p = 32 + i * 32; for (let k = 0; k < f.name.length; k++) u8[p + k] = f.name.charCodeAt(k); u8[p + 11] = f.type.charCodeAt(0); u8[p + 16] = f.len; u8[p + 17] = f.dec; });
    u8[hl - 1] = 0x0D;
    rows.forEach((r, ri) => { let p = hl + ri * rl; u8[p++] = 0x20;
      for (const f of fields) { let v = r[f.src]; let s;
        if (f.type === 'N') s = v == null || v === '' ? '' : (f.dec ? Number(v).toFixed(f.dec) : String(Math.round(v))); else if (f.type === 'L') s = v === true ? 'T' : v === false ? 'F' : '?'; else s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        let b = enc.encode(s); if (b.length > f.len) b = b.subarray(0, f.len);
        const pad = new Uint8Array(f.len).fill(0x20); if (f.type === 'N') pad.set(b, f.len - b.length); else pad.set(b, 0); u8.set(pad, p); p += f.len; } });
    u8[buf.byteLength - 1] = 0x1A; return { buf, fields };
  };
  /* ---------- SHP ---------- */
  F.readSHP = buf => {
    const dv = new DataView(buf); if (dv.getInt32(0, false) !== 9994) throw new Error('File .shp non valido');
    const type = dv.getInt32(32, true), len = dv.getInt32(24, false) * 2; let p = 100; const out = [];
    while (p < len && p + 8 <= buf.byteLength) {
      const cl = dv.getInt32(p + 4, false) * 2; const q = p + 8; const st = dv.getInt32(q, true); let g = null;
      const bt = st % 10; // 1 punto, 3 linea, 5 poligono, 8 multipunto (anche Z=1x, M=2x)
      if (st === 0) g = null;
      else if (bt === 1) g = { type: 'Point', coordinates: [dv.getFloat64(q + 4, true), dv.getFloat64(q + 12, true)] };
      else if (bt === 8) { const np = dv.getInt32(q + 36, true); const c = []; for (let i = 0; i < np; i++) c.push([dv.getFloat64(q + 40 + i * 16, true), dv.getFloat64(q + 48 + i * 16, true)]); g = { type: 'MultiPoint', coordinates: c }; }
      else if (bt === 3 || bt === 5) {
        const nparts = dv.getInt32(q + 36, true), np = dv.getInt32(q + 40, true); const parts = []; for (let i = 0; i < nparts; i++) parts.push(dv.getInt32(q + 44 + i * 4, true));
        const base = q + 44 + nparts * 4; const pts = []; for (let i = 0; i < np; i++) pts.push([dv.getFloat64(base + i * 16, true), dv.getFloat64(base + 8 + i * 16, true)]);
        if (st === 13 || st === 15) { const zb = base + np * 16 + 16; for (let i = 0; i < np && zb + i * 8 + 8 <= q + cl; i++) pts[i].push(dv.getFloat64(zb + i * 8, true)); }
        const rings = parts.map((s, i) => pts.slice(s, i + 1 < nparts ? parts[i + 1] : np));
        if (bt === 3) g = rings.length === 1 ? { type: 'LineString', coordinates: rings[0] } : { type: 'MultiLineString', coordinates: rings };
        else { const outers = [], holes = []; rings.forEach(r => (G.area(r) <= 0 ? outers : holes).push(r)); // shapefile: esterni orari
          if (!outers.length) outers.push(...holes.splice(0));
          const polys = outers.map(o => [o]); holes.forEach(h => { const host = polys.find(pp => G.pip(h[0], pp[0])) || polys[0]; host.push(h); });
          g = polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys }; }
      }
      out.push(g); p = q + cl;
    }
    return { type, geoms: out };
  };
  F.writeSHP = (geoms, gtype) => {
    // gtype: 'Point' | 'LineString' | 'Polygon' (anche Multi); 2D
    const st = { Point: 1, MultiPoint: 8, LineString: 3, Polygon: 5 }[gtype];
    const recs = geoms.map(g => {
      if (!g) return { len: 4, write: (dv, o) => dv.setInt32(o, 0, true), bb: null };
      if (st === 1) { const c = g.coordinates; return { len: 20, bb: [c[0], c[1], c[0], c[1]], write: (dv, o) => { dv.setInt32(o, 1, true); dv.setFloat64(o + 4, c[0], true); dv.setFloat64(o + 12, c[1], true); } }; }
      if (st === 8) { const c = g.type === 'Point' ? [g.coordinates] : g.coordinates; const bb = G.bbox(c); return { len: 40 + 16 * c.length, bb, write: (dv, o) => { dv.setInt32(o, 8, true); bb.forEach((v, i) => dv.setFloat64(o + 4 + i * 8, v, true)); dv.setInt32(o + 36, c.length, true); c.forEach((p, i) => { dv.setFloat64(o + 40 + i * 16, p[0], true); dv.setFloat64(o + 48 + i * 16, p[1], true); }); } }; }
      let parts;
      if (st === 3) parts = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
      else { const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; parts = []; polys.forEach(pl => pl.forEach((r, i) => { let rr = r.slice(); if (G.dist(rr[0], rr[rr.length - 1]) > 0) rr.push(rr[0]); const cw = G.area(rr) < 0; if ((i === 0) !== cw) rr.reverse(); parts.push(rr); })); }
      const pts = parts.flat(); const bb = G.bbox(pts);
      return { len: 44 + 4 * parts.length + 16 * pts.length, bb, write: (dv, o) => { dv.setInt32(o, st, true); bb.forEach((v, i) => dv.setFloat64(o + 4 + i * 8, v, true)); dv.setInt32(o + 36, parts.length, true); dv.setInt32(o + 40, pts.length, true); let k = 0; parts.forEach((pp, i) => { dv.setInt32(o + 44 + i * 4, k, true); k += pp.length; }); const b = o + 44 + parts.length * 4; pts.forEach((p, i) => { dv.setFloat64(b + i * 16, p[0], true); dv.setFloat64(b + 8 + i * 16, p[1], true); }); } };
    });
    const bbs = recs.filter(r => r.bb).map(r => r.bb); const BB = bbs.length ? [Math.min(...bbs.map(b => b[0])), Math.min(...bbs.map(b => b[1])), Math.max(...bbs.map(b => b[2])), Math.max(...bbs.map(b => b[3]))] : [0, 0, 0, 0];
    const shpLen = 100 + recs.reduce((a, r) => a + 8 + r.len, 0), shxLen = 100 + 8 * recs.length;
    const shp = new ArrayBuffer(shpLen), shx = new ArrayBuffer(shxLen); const a = new DataView(shp), b = new DataView(shx);
    [[a, shpLen], [b, shxLen]].forEach(([dv, L]) => { dv.setInt32(0, 9994, false); dv.setInt32(24, L / 2, false); dv.setInt32(28, 1000, true); dv.setInt32(32, st, true); BB.forEach((v, i) => dv.setFloat64(36 + i * 8, v, true)); });
    let o = 100; recs.forEach((r, i) => { a.setInt32(o, i + 1, false); a.setInt32(o + 4, r.len / 2, false); b.setInt32(100 + i * 8, o / 2, false); b.setInt32(104 + i * 8, r.len / 2, false); r.write(a, o + 8); o += 8 + r.len; });
    return { shp, shx };
  };
  /** importa un insieme di file (zip o file sciolti) → [{name, features, srcCrs, fields}] */
  F.readShapefileSet = async files => {
    const map = {};
    for (const f of files) { if (/\.zip$/i.test(f.name)) { const z = await App.zip.read(await App.readBuf(f)); for (const k in z) map[k.split('/').pop()] = { name: k.split('/').pop(), buf: z[k].buffer.slice(z[k].byteOffset, z[k].byteOffset + z[k].byteLength) }; } else map[f.name] = { name: f.name, buf: await App.readBuf(f) }; }
    const bases = Object.keys(map).filter(k => /\.shp$/i.test(k)).map(k => k.replace(/\.shp$/i, ''));
    if (!bases.length) throw new Error('Nessun file .shp trovato');
    return bases.map(b => {
      const get = ext => map[Object.keys(map).find(k => k.toLowerCase() === (b + ext).toLowerCase())];
      const shp = F.readSHP(get('.shp').buf); const cpg = get('.cpg'); let enc = cpg ? new TextDecoder().decode(cpg.buf).trim() : 'windows-1252';
      if (/^(utf-?8|65001)$/i.test(enc)) enc = 'utf-8'; else if (/1252|latin|8859/i.test(enc)) enc = 'windows-1252';
      const dbf = get('.dbf') ? F.readDBF(get('.dbf').buf, enc) : { fields: [], recs: [] };
      const prj = get('.prj') ? new TextDecoder().decode(get('.prj').buf) : null;
      const feats = shp.geoms.map((g, i) => ({ id: App.uid(), geometry: g, properties: dbf.recs[i] || {} })).filter(f => f.geometry);
      return { name: b, features: feats, srcCrs: App.crs.detectPrj(prj), prj, encoding: enc, fields: dbf.fields.map(f => f.name), shpType: shp.type };
    });
  };
  /** esporta layer → zip con shp/shx/dbf/prj/cpg (un set per tipo geometrico) */
  F.shapefileZip = (layer, crs) => {
    const groups = {}; layer.features.forEach(f => { if (!f.geometry) return; const t = F.baseType(f.geometry.type); (groups[t] = groups[t] || []).push(f); });
    const files = []; const base = App.slug(layer.name);
    for (const t in groups) { const feats = groups[t]; const nm = Object.keys(groups).length > 1 ? `${base}_${t.toLowerCase()}` : base;
      const geoms = feats.map(f => F.reproj(f.geometry, 'EPSG:4326', crs));
      const { shp, shx } = F.writeSHP(geoms, t === 'Point' && geoms.some(g => g.type === 'MultiPoint') ? 'MultiPoint' : t);
      const fieldNames = [...new Set(feats.flatMap(f => Object.keys(f.properties || {})))];
      const { buf } = F.writeDBF(feats.map(f => f.properties || {}), fieldNames.map(n => ({ name: n })));
      files.push({ name: nm + '.shp', data: new Uint8Array(shp) }, { name: nm + '.shx', data: new Uint8Array(shx) }, { name: nm + '.dbf', data: new Uint8Array(buf) }, { name: nm + '.prj', data: App.crs.wktOf(crs) }, { name: nm + '.cpg', data: 'UTF-8' }); }
    return App.zip.make(files);
  };
  /* ---------- GeoJSON ---------- */
  F.readGeoJSON = (text, forceCrs) => {
    const j = JSON.parse(text); let src = forceCrs || 'EPSG:4326';
    const nm = j.crs && j.crs.properties && j.crs.properties.name; if (nm && !forceCrs) { const m = String(nm).match(/EPSG:{1,2}(\d+)/i) || String(nm).match(/CRS84/i) && [0, '4326']; if (m && App.crs.defs['EPSG:' + m[1]]) src = 'EPSG:' + m[1]; }
    const feats = j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : [{ type: 'Feature', geometry: j, properties: {} }];
    return { features: feats.filter(f => f.geometry).map(f => ({ id: App.uid(), geometry: f.geometry, properties: f.properties || {} })), srcCrs: src };
  };
  F.writeGeoJSON = (layer, crs = 'EPSG:4326', extended = false) => {
    const fc = { type: 'FeatureCollection', name: layer.name };
    if (extended && crs !== 'EPSG:4326') fc.crs = { type: 'name', properties: { name: 'urn:ogc:def:crs:' + crs.replace(':', '::') } };
    fc.features = layer.features.map(f => ({ type: 'Feature', properties: f.properties, geometry: F.mapCoords(F.reproj(f.geometry, 'EPSG:4326', crs), (x, y) => [+x.toFixed(crs === 'EPSG:4326' ? 8 : 3), +y.toFixed(crs === 'EPSG:4326' ? 8 : 3)]) }));
    return JSON.stringify(fc);
  };
  /* ---------- KML / GPX ---------- */
  F.readKML = text => {
    const x = new DOMParser().parseFromString(text, 'application/xml'); const feats = [];
    const coords = s => s.trim().split(/\s+/).map(t => t.split(',').map(Number).slice(0, 2));
    x.querySelectorAll('Placemark').forEach(pm => {
      const props = { name: pm.querySelector('name')?.textContent || '', description: pm.querySelector('description')?.textContent || '' };
      pm.querySelectorAll('ExtendedData Data').forEach(d => props[d.getAttribute('name')] = d.querySelector('value')?.textContent);
      pm.querySelectorAll('ExtendedData SimpleData').forEach(d => props[d.getAttribute('name')] = d.textContent);
      const gs = [];
      pm.querySelectorAll('Point coordinates').forEach(c => gs.push({ type: 'Point', coordinates: coords(c.textContent)[0] }));
      pm.querySelectorAll('LineString coordinates').forEach(c => gs.push({ type: 'LineString', coordinates: coords(c.textContent) }));
      pm.querySelectorAll('Polygon').forEach(p => { const o = p.querySelector('outerBoundaryIs coordinates'); const hs = [...p.querySelectorAll('innerBoundaryIs coordinates')]; if (o) gs.push({ type: 'Polygon', coordinates: [coords(o.textContent), ...hs.map(h => coords(h.textContent))] }); });
      gs.forEach(g => feats.push({ id: App.uid(), geometry: g, properties: props }));
    });
    return feats;
  };
  F.writeKML = layer => {
    const c = a => a.map(p => `${p[0].toFixed(8)},${p[1].toFixed(8)},0`).join(' ');
    const geo = g => g.type === 'Point' ? `<Point><coordinates>${c([g.coordinates])}</coordinates></Point>` : g.type === 'LineString' ? `<LineString><coordinates>${c(g.coordinates)}</coordinates></LineString>` : g.type === 'Polygon' ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${c(g.coordinates[0])}</coordinates></LinearRing></outerBoundaryIs>${g.coordinates.slice(1).map(h => `<innerBoundaryIs><LinearRing><coordinates>${c(h)}</coordinates></LinearRing></innerBoundaryIs>`).join('')}</Polygon>` : g.type.startsWith('Multi') ? `<MultiGeometry>${g.coordinates.map(cc => geo({ type: g.type.slice(5), coordinates: cc })).join('')}</MultiGeometry>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(layer.name)}</name>${layer.features.map(f => `<Placemark><name>${esc(f.properties.name || f.properties.nome || '')}</name><ExtendedData>${Object.entries(f.properties || {}).map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(v)}</value></Data>`).join('')}</ExtendedData>${geo(f.geometry)}</Placemark>`).join('')}</Document></kml>`;
  };
  F.readGPX = text => {
    const x = new DOMParser().parseFromString(text, 'application/xml'); const feats = [];
    x.querySelectorAll('wpt').forEach(w => feats.push({ id: App.uid(), geometry: { type: 'Point', coordinates: [+w.getAttribute('lon'), +w.getAttribute('lat')] }, properties: { name: w.querySelector('name')?.textContent || '', ele: +(w.querySelector('ele')?.textContent || 0) } }));
    x.querySelectorAll('trk').forEach(t => { const segs = [...t.querySelectorAll('trkseg')].map(s => [...s.querySelectorAll('trkpt')].map(p => [+p.getAttribute('lon'), +p.getAttribute('lat')])); feats.push({ id: App.uid(), geometry: segs.length === 1 ? { type: 'LineString', coordinates: segs[0] } : { type: 'MultiLineString', coordinates: segs }, properties: { name: t.querySelector('name')?.textContent || 'traccia' } }); });
    x.querySelectorAll('rte').forEach(t => feats.push({ id: App.uid(), geometry: { type: 'LineString', coordinates: [...t.querySelectorAll('rtept')].map(p => [+p.getAttribute('lon'), +p.getAttribute('lat')]) }, properties: { name: t.querySelector('name')?.textContent || 'percorso' } }));
    return feats;
  };
  F.writeGPX = layer => {
    const pts = [], trk = [];
    layer.features.forEach(f => { const g = f.geometry; if (g.type === 'Point') pts.push(`<wpt lat="${g.coordinates[1]}" lon="${g.coordinates[0]}"><name>${esc(f.properties.name || f.properties.nome || '')}</name></wpt>`); else if (g.type.includes('Line')) { const ls = g.type === 'LineString' ? [g.coordinates] : g.coordinates; trk.push(`<trk><name>${esc(f.properties.name || '')}</name>${ls.map(l => `<trkseg>${l.map(p => `<trkpt lat="${p[1]}" lon="${p[0]}"/>`).join('')}</trkseg>`).join('')}</trk>`); } });
    return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="BeCity" xmlns="http://www.topografix.com/GPX/1/1">${pts.join('')}${trk.join('')}</gpx>`;
  };
  /* ---------- CSV ---------- */
  F.parseCSV = text => {
    const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : (text.split('\n')[0].includes('\t') ? '\t' : ',');
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) { const ch = text[i]; if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const head = rows.shift() || []; return { head: head.map(h => h.trim()), rows: rows.filter(r => r.some(c => c !== '')), sep };
  };
  F.readCSVGeo = (text, opt = {}) => {
    const { head, rows } = F.parseCSV(text); const H = head.map(h => h.toLowerCase());
    const wi = opt.wkt ?? H.findIndex(h => ['wkt', 'geom', 'geometry', 'the_geom'].includes(h));
    const xi = opt.x ?? H.findIndex(h => ['lon', 'lng', 'longitude', 'longitudine', 'x', 'est', 'east'].includes(h));
    const yi = opt.y ?? H.findIndex(h => ['lat', 'latitude', 'latitudine', 'y', 'nord', 'north'].includes(h));
    if (wi < 0 && (xi < 0 || yi < 0)) throw new Error('Colonne coordinate non trovate (attese lon/lat, x/y oppure WKT)');
    const num = v => { const n = Number(String(v).replace(',', '.')); return isFinite(n) && String(v).trim() !== '' ? n : v; };
    return rows.map(r => { const props = {}; head.forEach((h, i) => { if (i !== wi) props[h] = num(r[i]); });
      const g = wi >= 0 ? F.parseWKT(r[wi] || '') : { type: 'Point', coordinates: [Number(String(r[xi]).replace(',', '.')), Number(String(r[yi]).replace(',', '.'))] };
      return g ? { id: App.uid(), geometry: g, properties: props } : null; }).filter(Boolean);
  };
  F.toCSV = (rows, head) => { const q = v => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; return '﻿' + [head.join(';'), ...rows.map(r => head.map(h => q(r[h])).join(';'))].join('\r\n'); };
  F.writeCSV = (layer, crs = 'EPSG:4326') => { const fields = [...new Set(layer.features.flatMap(f => Object.keys(f.properties || {})))]; return F.toCSV(layer.features.map(f => ({ ...f.properties, WKT: F.toWKT(F.reproj(f.geometry, 'EPSG:4326', crs)) })), [...fields, 'WKT']); };
  /* ---------- world file ---------- */
  F.readWorld = text => { const v = text.trim().split(/\s+/).map(Number); return v.length >= 6 ? { A: v[0], D: v[1], B: v[2], E: v[3], C: v[4], F: v[5] } : null; };
  /* ---------- SLD / QML ---------- */
  F.writeSLD = layer => {
    const s = layer.style || {}; const sym = (col, fill) => { const gt = layer.geomType || 'Polygon'; return gt.includes('Point') ? `<PointSymbolizer><Graphic><Mark><WellKnownName>circle</WellKnownName><Fill><CssParameter name="fill">${fill || col}</CssParameter></Fill><Stroke><CssParameter name="stroke">${col}</CssParameter></Stroke></Mark><Size>8</Size></Graphic></PointSymbolizer>` : gt.includes('Line') ? `<LineSymbolizer><Stroke><CssParameter name="stroke">${col}</CssParameter><CssParameter name="stroke-width">${s.width || 1.5}</CssParameter></Stroke></LineSymbolizer>` : `<PolygonSymbolizer><Fill><CssParameter name="fill">${fill || col}</CssParameter><CssParameter name="fill-opacity">${s.fillOpacity ?? .35}</CssParameter></Fill><Stroke><CssParameter name="stroke">${col}</CssParameter><CssParameter name="stroke-width">${s.width || 1.2}</CssParameter></Stroke></PolygonSymbolizer>`; };
    let rules = '';
    if (s.mode === 'cat' && s.classes) rules = s.classes.map(c => `<Rule><Name>${esc(c.value)}</Name><ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>${esc(s.field)}</ogc:PropertyName><ogc:Literal>${esc(c.value)}</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>${sym(c.color, c.color)}</Rule>`).join('');
    else if (s.mode === 'grad' && s.classes) rules = s.classes.map(c => `<Rule><Name>${c.min} - ${c.max}</Name><ogc:Filter><ogc:And><ogc:PropertyIsGreaterThanOrEqualTo><ogc:PropertyName>${esc(s.field)}</ogc:PropertyName><ogc:Literal>${c.min}</ogc:Literal></ogc:PropertyIsGreaterThanOrEqualTo><ogc:PropertyIsLessThanOrEqualTo><ogc:PropertyName>${esc(s.field)}</ogc:PropertyName><ogc:Literal>${c.max}</ogc:Literal></ogc:PropertyIsLessThanOrEqualTo></ogc:And></ogc:Filter>${sym(c.color, c.color)}</Rule>`).join('');
    else rules = `<Rule><Name>${esc(layer.name)}</Name>${sym(s.color || '#3d6fe0', s.fill)}</Rule>`;
    if (s.label) rules += `<Rule><TextSymbolizer><Label><ogc:PropertyName>${esc(s.label)}</ogc:PropertyName></Label></TextSymbolizer></Rule>`;
    return `<?xml version="1.0" encoding="UTF-8"?><StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"><NamedLayer><Name>${esc(layer.name)}</Name><UserStyle><FeatureTypeStyle>${rules}</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>`;
  };
  F.readSLD = text => {
    const x = new DOMParser().parseFromString(text, 'application/xml'); const st = {};
    const css = (el, n) => { const e = [...el.getElementsByTagName('*')].find(e => /CssParameter|SvgParameter/.test(e.localName) && e.getAttribute('name') === n); return e && e.textContent.trim(); };
    const rules = [...x.getElementsByTagName('*')].filter(e => e.localName === 'Rule');
    const lit = r => { const l = [...r.getElementsByTagName('*')].find(e => e.localName === 'Literal'); return l && l.textContent; };
    const prop = r => { const l = [...r.getElementsByTagName('*')].find(e => e.localName === 'PropertyName'); return l && l.textContent; };
    const cats = rules.filter(r => [...r.getElementsByTagName('*')].some(e => e.localName === 'PropertyIsEqualTo'));
    if (cats.length) { st.mode = 'cat'; st.field = prop(cats[0]); st.classes = cats.map(r => ({ value: lit(r), color: css(r, 'fill') || css(r, 'stroke') || '#888' })); }
    else if (rules[0]) { st.mode = 'single'; st.color = css(rules[0], 'stroke') || css(rules[0], 'fill') || '#3d6fe0'; st.fill = css(rules[0], 'fill'); }
    return st;
  };
  F.writeQML = layer => { const s = layer.style || {}; return `<!DOCTYPE qgis><qgis version="3.28"><renderer-v2 type="${s.mode === 'cat' ? 'categorizedSymbol' : s.mode === 'grad' ? 'graduatedSymbol' : 'singleSymbol'}" attr="${esc(s.field || '')}">${(s.classes || [{ color: s.color || '#3d6fe0', value: '' }]).map(c => `<category value="${esc(c.value ?? '')}" label="${esc(c.value ?? c.min + '-' + c.max)}" color="${c.color}"/>`).join('')}</renderer-v2></qgis>`; };
  /* ---------- Metadati RNDT (profilo semplificato ISO 19115/19139) ---------- */
  F.writeRNDT = (layer, bbox) => {
    const m = layer.meta || {}; const d = (m.date || new Date().toISOString().slice(0, 10));
    return `<?xml version="1.0" encoding="UTF-8"?>
<gmd:MD_Metadata xmlns:gmd="http://www.isotc211.org/2005/gmd" xmlns:gco="http://www.isotc211.org/2005/gco" xmlns:gml="http://www.opengis.net/gml">
 <gmd:fileIdentifier><gco:CharacterString>${esc(m.ipa || 'r_xxxxx')}:${esc(layer.id)}</gco:CharacterString></gmd:fileIdentifier>
 <gmd:language><gmd:LanguageCode codeList="http://www.loc.gov/standards/iso639-2/" codeListValue="ita">ita</gmd:LanguageCode></gmd:language>
 <gmd:characterSet><gmd:MD_CharacterSetCode codeList="http://standards.iso.org/iso/19139/resources/gmxCodelists.xml#MD_CharacterSetCode" codeListValue="utf8">utf8</gmd:MD_CharacterSetCode></gmd:characterSet>
 <gmd:hierarchyLevel><gmd:MD_ScopeCode codeList="http://standards.iso.org/iso/19139/resources/gmxCodelists.xml#MD_ScopeCode" codeListValue="dataset">dataset</gmd:MD_ScopeCode></gmd:hierarchyLevel>
 <gmd:contact><gmd:CI_ResponsibleParty><gmd:organisationName><gco:CharacterString>${esc(m.ente || App.state.org.name)}</gco:CharacterString></gmd:organisationName><gmd:contactInfo><gmd:CI_Contact><gmd:address><gmd:CI_Address><gmd:electronicMailAddress><gco:CharacterString>${esc(m.email || '')}</gco:CharacterString></gmd:electronicMailAddress></gmd:CI_Address></gmd:address></gmd:CI_Contact></gmd:contactInfo><gmd:role><gmd:CI_RoleCode codeList="http://standards.iso.org/iso/19139/resources/gmxCodelists.xml#CI_RoleCode" codeListValue="pointOfContact">pointOfContact</gmd:CI_RoleCode></gmd:role></gmd:CI_ResponsibleParty></gmd:contact>
 <gmd:dateStamp><gco:Date>${new Date().toISOString().slice(0, 10)}</gco:Date></gmd:dateStamp>
 <gmd:metadataStandardName><gco:CharacterString>DM - Regole tecniche RNDT</gco:CharacterString></gmd:metadataStandardName>
 <gmd:referenceSystemInfo><gmd:MD_ReferenceSystem><gmd:referenceSystemIdentifier><gmd:RS_Identifier><gmd:code><gco:CharacterString>${esc(m.crs || 'EPSG:4326')}</gco:CharacterString></gmd:code><gmd:codeSpace><gco:CharacterString>EPSG</gco:CharacterString></gmd:codeSpace></gmd:RS_Identifier></gmd:referenceSystemIdentifier></gmd:MD_ReferenceSystem></gmd:referenceSystemInfo>
 <gmd:identificationInfo><gmd:MD_DataIdentification>
  <gmd:citation><gmd:CI_Citation><gmd:title><gco:CharacterString>${esc(m.title || layer.name)}</gco:CharacterString></gmd:title><gmd:date><gmd:CI_Date><gmd:date><gco:Date>${esc(d)}</gco:Date></gmd:date><gmd:dateType><gmd:CI_DateTypeCode codeList="http://standards.iso.org/iso/19139/resources/gmxCodelists.xml#CI_DateTypeCode" codeListValue="creation">creation</gmd:CI_DateTypeCode></gmd:dateType></gmd:CI_Date></gmd:date></gmd:CI_Citation></gmd:citation>
  <gmd:abstract><gco:CharacterString>${esc(m.abstract || '')}</gco:CharacterString></gmd:abstract>
  <gmd:descriptiveKeywords><gmd:MD_Keywords>${String(m.keywords || '').split(',').filter(Boolean).map(k => `<gmd:keyword><gco:CharacterString>${esc(k.trim())}</gco:CharacterString></gmd:keyword>`).join('')}<gmd:thesaurusName><gmd:CI_Citation><gmd:title><gco:CharacterString>GEMET - INSPIRE themes, version 1.0</gco:CharacterString></gmd:title></gmd:CI_Citation></gmd:thesaurusName></gmd:MD_Keywords></gmd:descriptiveKeywords>
  <gmd:resourceConstraints><gmd:MD_LegalConstraints><gmd:useConstraints><gmd:MD_RestrictionCode codeList="http://standards.iso.org/iso/19139/resources/gmxCodelists.xml#MD_RestrictionCode" codeListValue="otherRestrictions">otherRestrictions</gmd:MD_RestrictionCode></gmd:useConstraints><gmd:otherConstraints><gco:CharacterString>${esc(m.license || layer.license || 'CC-BY 4.0')}</gco:CharacterString></gmd:otherConstraints></gmd:MD_LegalConstraints></gmd:resourceConstraints>
  <gmd:language><gmd:LanguageCode codeList="http://www.loc.gov/standards/iso639-2/" codeListValue="ita">ita</gmd:LanguageCode></gmd:language>
  <gmd:topicCategory><gmd:MD_TopicCategoryCode>${esc(m.topic || 'planningCadastre')}</gmd:MD_TopicCategoryCode></gmd:topicCategory>
  <gmd:extent><gmd:EX_Extent><gmd:geographicElement><gmd:EX_GeographicBoundingBox><gmd:westBoundLongitude><gco:Decimal>${bbox[0].toFixed(6)}</gco:Decimal></gmd:westBoundLongitude><gmd:eastBoundLongitude><gco:Decimal>${bbox[2].toFixed(6)}</gco:Decimal></gmd:eastBoundLongitude><gmd:southBoundLatitude><gco:Decimal>${bbox[1].toFixed(6)}</gco:Decimal></gmd:southBoundLatitude><gmd:northBoundLatitude><gco:Decimal>${bbox[3].toFixed(6)}</gco:Decimal></gmd:northBoundLatitude></gmd:EX_GeographicBoundingBox></gmd:geographicElement></gmd:EX_Extent></gmd:extent>
 </gmd:MD_DataIdentification></gmd:identificationInfo>
 <gmd:dataQualityInfo><gmd:DQ_DataQuality><gmd:lineage><gmd:LI_Lineage><gmd:statement><gco:CharacterString>${esc(m.lineage || 'Dataset prodotto con BeCity')}</gco:CharacterString></gmd:statement></gmd:LI_Lineage></gmd:lineage></gmd:DQ_DataQuality></gmd:dataQualityInfo>
</gmd:MD_Metadata>`;
  };
})();
