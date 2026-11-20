/* BeCity – Progettazione generativa (motore procedurale interno) e tracciamento da scansioni */
'use strict';
(function () {
  const G = App.geom;
  const GEN = App.gen = {};
  const rnd = seed => { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
  const r05 = v => Math.round(v * 20) / 20;

  /** generatore di pianta residenziale (zona giorno / zona notte con disimpegno) */
  GEN.generate = (o) => {
    const P = Object.assign({ w: 12, d: 9.5, bedrooms: 2, baths: 1, kitchen: 'open', seed: 1, ext: 0.3, int: 0.12, h: 3, origin: [0, 0], furniture: true }, o);
    const R = rnd(P.seed); const E = []; const id = () => App.uid();
    const { w, d } = P, te = P.ext, ti = P.int;
    const ratio = .40 + R() * .12; const xd = r05(w * ratio);
    const cw = 1.2; const nightRooms = [];
    for (let i = 0; i < P.bedrooms; i++) nightRooms.push({ name: i === 0 ? 'Camera matrimoniale' : `Camera ${i + 1}`, rtype: i === 0 ? 'Camera doppia' : (P.bedrooms > 2 && i === P.bedrooms - 1 ? 'Camera singola' : 'Camera doppia'), wgt: i === 0 ? 15 : 11 });
    for (let i = 0; i < P.baths; i++) nightRooms.push({ name: i === 0 ? 'Bagno' : `Bagno ${i + 1}`, rtype: 'Bagno', wgt: 5.5 });
    // ripartizione nelle due fasce attorno al disimpegno
    const baths = nightRooms.filter(r => r.rtype === 'Bagno'), beds = nightRooms.filter(r => r.rtype !== 'Bagno');
    let bottom = [...baths], top = [];
    beds.forEach((b, i) => (i % 2 === (P.seed % 2) || top.length > bottom.length + 1 ? bottom : top).push(b));
    if (!top.length && bottom.length > 1) top.push(bottom.pop());
    const sumB = bottom.reduce((a, r) => a + r.wgt, 0), sumT = top.reduce((a, r) => a + r.wgt, 0);
    const yc = r05(Math.max(3, Math.min(d - cw - 3, d * (sumB / (sumB + sumT || 1)) - cw / 2)));
    const W = (x1, y1, x2, y2, thk, extra = {}) => { const e = { id: id(), type: 'wall', x1, y1, x2, y2, thk, h: P.h, layer: 'MURI', material: thk >= .25 ? 'Laterizio' : 'Cartongesso', ...extra }; E.push(e); return e; };
    const wS = W(0, 0, w, 0, te), wE = W(w, 0, w, d, te), wN = W(w, d, 0, d, te), wW = W(0, d, 0, 0, te);
    const wDay = W(xd, 0, xd, d, ti);
    const wC1 = W(xd, yc, w, yc, ti), wC2 = W(xd, yc + cw, w, yc + cw, ti);
    const rooms = [];
    const room = (x0, y0, x1, y1, name, rtype, hx = []) => { const r = { id: id(), type: 'room', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], name, rtype, h: 2.7, layer: 'STANZE', floor: rtype === 'Bagno' ? 'Gres' : rtype.startsWith('Camera') ? 'Parquet' : 'Gres' }; rooms.push(r); E.push(r); return r; };
    const door = (wall, t, width = .8, side = 1, flip = false) => E.push({ id: id(), type: 'door', wall: wall.id, t, width, side, flip, h: 2.1, sill: 0, layer: 'APERTURE' });
    const win = (wall, t, width, h = 1.4, sill = .9) => E.push({ id: id(), type: 'window', wall: wall.id, t, width: r05(width), h, sill, layer: 'APERTURE' });
    const tParam = (wall, x, y) => G.projT([x, y], [wall.x1, wall.y1], [wall.x2, wall.y2]);
    // fasce notte
    const band = (list, y0, y1, corrWall, extWall) => { let x = xd; const tot = list.reduce((a, r) => a + r.wgt, 0); list.forEach((r, i) => { const x1 = i === list.length - 1 ? w : r05(x + (w - xd) * r.wgt / tot); if (i < list.length - 1) W(x1, y0, x1, y1, ti);
        const rm = room(x + (i === 0 ? ti / 2 : ti / 2), y0 + (y0 === 0 ? te / 2 : ti / 2), x1 - (i === list.length - 1 ? te / 2 : ti / 2), y1 - (y1 === d ? te / 2 : ti / 2), r.name, r.rtype);
        door(corrWall, tParam(corrWall, (x + x1) / 2, corrWall.y1), r.rtype === 'Bagno' ? .7 : .8, corrWall === wC1 ? -1 : 1, i % 2 === 1);
        const area = Math.abs(G.area(rm.pts)); const need = area / 8 * 1.15; const ww = Math.max(r.rtype === 'Bagno' ? .6 : .9, Math.min(x1 - x - .8, need / (r.rtype === 'Bagno' ? 1 : 1.4)));
        win(extWall, tParam(extWall, (x + x1) / 2, extWall.y1), ww, r.rtype === 'Bagno' ? 1.0 : 1.4, r.rtype === 'Bagno' ? 1.2 : .9);
        if (P.furniture) furnish(rm, r.rtype);
        x = x1; }); };
    band(bottom, 0, yc, wC1, wS); band(top, yc + cw, d, wC2, wN);
    const corr = room(xd + ti / 2, yc + ti / 2, w - te / 2, yc + cw - ti / 2, 'Disimpegno', 'Disimpegno');
    if (!bottom.length) { /* nessuna stanza sotto */ }
    door(wDay, tParam(wDay, xd, yc + cw / 2), .9, 1);
    // zona giorno
    if (P.kitchen === 'separate') { const yk = r05(d - Math.max(3.2, d * .36)); const wK = W(0, yk, xd, yk, ti);
      const sg = room(te / 2, te / 2, xd - ti / 2, yk - ti / 2, 'Soggiorno', 'Soggiorno'); const ck = room(te / 2, yk + ti / 2, xd - ti / 2, d - te / 2, 'Cucina', 'Cucina');
      door(wK, .7, .9, 1); win(wS, tParam(wS, xd * .5, 0), Math.max(1.6, Math.abs(G.area(sg.pts)) / 8 / 1.4 * 1.1), 1.4, .9); win(wN, tParam(wN, xd * .5, d), Math.max(1.2, Math.abs(G.area(ck.pts)) / 8 / 1.4 * 1.1));
      if (P.furniture) { furnish(sg, 'Soggiorno'); furnish(ck, 'Cucina'); } }
    else { const sg = room(te / 2, te / 2, xd - ti / 2, d - te / 2, 'Soggiorno-cucina', 'Soggiorno-cucina'); const A = Math.abs(G.area(sg.pts)); const need = A / 8 * 1.15;
      win(wS, tParam(wS, xd * .55, 0), Math.min(xd - 1.6, Math.max(1.8, need * .6 / 1.4)), 1.4, .9); win(wW, tParam(wW, 0, d * .62), Math.min(d - 2, Math.max(1.2, need * .45 / 1.4)));
      if (P.furniture) furnish(sg, 'Soggiorno-cucina'); }
    door(wS, tParam(wS, xd * .2 + .2, 0), 1.0, 1);
    // quote generali
    E.push({ id: id(), type: 'dim', x1: 0, y1: 0, x2: w, y2: 0, off: -1.2, layer: 'QUOTE' }, { id: id(), type: 'dim', x1: 0, y1: d, x2: 0, y2: 0, off: -1.2, layer: 'QUOTE' });
    function furnish(rm, t) { const b = G.bbox(rm.pts); const ins = (name, x, y, rot = 0) => E.push({ id: id(), type: 'insert', name, x, y, rot, scale: 1, layer: 'ARREDI', attrs: {} });
      const bw = b[2] - b[0], bh = b[3] - b[1];
      if (t === 'Camera doppia' && bw > 2.2 && bh > 2.4) ins('Letto matrimoniale', b[0] + bw / 2 - .8, b[3] - 2.05);
      else if (t.startsWith('Camera') && bw > 1.4 && bh > 2.2) ins('Letto singolo', b[0] + .3, b[3] - 2.05);
      if (t.startsWith('Camera') && bw > 1.5) ins('Armadio 1,2 m', b[2] - 1.25, b[1] + .05);
      if (t === 'Bagno' && bw > 1.2) { ins('WC', b[0] + .2, b[3] - .7); ins('Lavabo', b[0] + .75, b[3] - .5); if (bw > 2) ins('Doccia 80x80', b[2] - .85, b[1] + .05); }
      if (t.startsWith('Soggiorno') && bw > 3) { ins('Divano 3 posti', b[0] + .3, b[1] + .4); ins('Tavolo 6 posti', b[0] + bw / 2 - .9, b[1] + bh * .5); if (t === 'Soggiorno-cucina') ins('Cucina lineare 2,4 m', b[0] + .1, b[3] - .65); }
      if (t === 'Cucina' && bw > 2.5) { ins('Cucina lineare 2,4 m', b[0] + .1, b[3] - .65); } }
    // traslazione all'origine richiesta
    const [ox, oy] = P.origin; if (ox || oy) E.forEach(e => { if ('x1' in e) { e.x1 += ox; e.y1 += oy; e.x2 += ox; e.y2 += oy; } if (e.pts) e.pts = e.pts.map(p => [p[0] + ox, p[1] + oy]); if (e.type === 'insert') { e.x += ox; e.y += oy; } });
    const summary = rooms.map(r => ({ name: r.name, rtype: r.rtype, area: Math.abs(G.area(r.pts)) }));
    return { entities: E, rooms: summary, params: P, sup: summary.reduce((a, r) => a + r.area, 0), footprint: [[ox, oy], [ox + w, oy], [ox + w, oy + d], [ox, oy + d]] };
  };
  /** interpreta il prompt in parametri */
  GEN.parsePrompt = (text, base = {}) => {
    const t = text.toLowerCase().replace(/,(?=\d)/g, '.'); const P = Object.assign({ area: 90, bedrooms: 2, baths: 1, kitchen: 'open', floors: 1, h: 3 }, base);
    const num = re => { const m = t.match(re); return m ? parseFloat(m[1]) : null; };
    const words = { un: 1, una: 1, uno: 1, due: 2, tre: 3, quattro: 4, cinque: 5 };
    const cnt = re => { const m = t.match(re); if (!m) return null; return isFinite(+m[1]) ? +m[1] : words[m[1]] || null; };
    const a = num(/(\d+(?:\.\d+)?)\s*(?:mq|m2|m²|metri quadr)/); if (a) P.area = a;
    const b = cnt(/(\d+|un[ao]?|due|tre|quattro|cinque)\s*(?:camer|stanz[ae] da letto)/); if (b) P.bedrooms = b;
    const ba = cnt(/(\d+|un[ao]?|due|tre)\s*bagn/); if (ba) P.baths = ba;
    if (/bilocale/.test(t)) { P.bedrooms = 1; P.baths = 1; if (!a) P.area = 55; } if (/trilocale/.test(t)) { P.bedrooms = 2; if (!a) P.area = 80; } if (/quadrilocale/.test(t)) { P.bedrooms = 3; if (!a) P.area = 105; P.baths = Math.max(P.baths, 2); }
    if (/cucina separata|cucina abitabile|cucina chiusa/.test(t)) P.kitchen = 'separate'; if (/open space|cucina a vista|cucina aperta|openspace/.test(t)) P.kitchen = 'open';
    const fl = cnt(/(\d+|due|tre)\s*piani/); if (fl) P.floors = fl;
    const wd = t.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/); if (wd) { P.w = +wd[1]; P.d = +wd[2]; }
    const hh = num(/altezza\s*(?:di\s*)?(\d+(?:\.\d+)?)/); if (hh) P.h = hh;
    if (!P.w || !wd) { const ar = 1.3; const gross = P.area * 1.15 / P.floors; P.d = r05(Math.sqrt(gross / ar)); P.w = r05(gross / P.d); }
    return P;
  };
  GEN.applyEdit = (text, P) => {
    const t = text.toLowerCase().replace(/,(?=\d)/g, '.'); const N = { ...P }; const n = (t.match(/(\d+(?:\.\d+)?)/) || [])[1]; const v = n ? +n : 1; const log = [];
    if (/(allarga|amplia|aumenta|ingrandisc).*(soggiorno|zona giorno)/.test(t)) { N.w = r05(P.w + v); log.push(`Larghezza edificio ${P.w} → ${N.w} m (zona giorno più ampia)`); }
    else if (/(riduci|restringi|diminuisci).*(soggiorno|zona giorno)/.test(t)) { N.w = r05(Math.max(6, P.w - v)); log.push(`Larghezza ${P.w} → ${N.w} m`); }
    if (/profondit/.test(t) && n) { N.d = /(riduci|diminuisci)/.test(t) ? r05(P.d - v) : /a\s+\d/.test(t) ? v : r05(P.d + v); log.push(`Profondità ${P.d} → ${N.d} m`); }
    if (/larghezza/.test(t) && n && !/soggiorno/.test(t)) { N.w = /a\s+\d/.test(t) ? v : r05(P.w + v); log.push(`Larghezza ${P.w} → ${N.w} m`); }
    if (/aggiungi.*bagn/.test(t)) { N.baths = P.baths + 1; log.push(`Bagni ${P.baths} → ${N.baths}`); }
    if (/(togli|rimuovi|elimina).*bagn/.test(t)) { N.baths = Math.max(1, P.baths - 1); log.push(`Bagni ${P.baths} → ${N.baths}`); }
    if (/aggiungi.*camer/.test(t)) { N.bedrooms = P.bedrooms + 1; N.w = r05(P.w + 2.8); log.push(`Camere ${P.bedrooms} → ${N.bedrooms} (larghezza +2,8 m)`); }
    if (/(togli|rimuovi|elimina).*camer/.test(t)) { N.bedrooms = Math.max(1, P.bedrooms - 1); log.push(`Camere ${P.bedrooms} → ${N.bedrooms}`); }
    if (/cucina separata|separa.*cucina/.test(t)) { N.kitchen = 'separate'; log.push('Cucina separata dal soggiorno'); }
    if (/open space|cucina aperta|unisci.*cucina/.test(t)) { N.kitchen = 'open'; log.push('Cucina a vista (open space)'); }
    if (/altezza/.test(t) && n) { N.h = v; log.push(`Altezza muri ${P.h} → ${v} m`); }
    if (/(senza|togli).*arred/.test(t)) { N.furniture = false; log.push('Arredi rimossi'); }
    return { params: N, log };
  };

  /* ---------- tracciamento da immagine ---------- */
  GEN.trace = (img, opts) => {
    const { pxPerM, thr = 110, minLenM = .5, minThkM = .07, maxThkM = .6 } = opts;
    const c = document.createElement('canvas'); const sc = Math.min(1, 1600 / Math.max(img.width, img.height)); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height); const data = x.getImageData(0, 0, c.width, c.height).data; const Wd = c.width, Hd = c.height; const ppm = pxPerM * sc;
    const dark = new Uint8Array(Wd * Hd); for (let i = 0; i < Wd * Hd; i++) { const l = .299 * data[i * 4] + .587 * data[i * 4 + 1] + .114 * data[i * 4 + 2]; dark[i] = data[i * 4 + 3] > 20 && l < thr ? 1 : 0; }
    const minLen = minLenM * ppm, minThk = Math.max(2, minThkM * ppm), maxThk = maxThkM * ppm;
    const bands = (horiz) => { const A = horiz ? Hd : Wd, B = horiz ? Wd : Hd; const at = (a, b) => horiz ? dark[a * Wd + b] : dark[b * Wd + a]; let open = []; const done = [];
      for (let a = 0; a < A; a++) { const runs = []; let s = -1; for (let b = 0; b <= B; b++) { const v = b < B && at(a, b); if (v && s < 0) s = b; if (!v && s >= 0) { if (b - s >= minLen) runs.push([s, b - 1]); s = -1; } }
        const next = []; runs.forEach(r => { const m = open.find(o => !o.used && Math.min(o.b1, r[1]) - Math.max(o.b0, r[0]) > .7 * Math.min(o.b1 - o.b0, r[1] - r[0])); if (m) { m.used = true; next.push({ b0: Math.round((m.b0 * m.n + r[0]) / (m.n + 1)), b1: Math.round((m.b1 * m.n + r[1]) / (m.n + 1)), a0: m.a0, a1: a, n: m.n + 1 }); } else next.push({ b0: r[0], b1: r[1], a0: a, a1: a, n: 1 }); });
        open.filter(o => !o.used).forEach(o => done.push(o)); open = next.map(o => ({ ...o, used: false })); }
      done.push(...open); return done.map(o => ({ ...o, thk: o.a1 - o.a0 + 1 })); };
    const toM = (px, py) => [px / ppm, (Hd - py) / ppm];
    const walls = [];
    [true, false].forEach(horiz => { const bs = bands(horiz); const thick = bs.filter(b => b.thk >= minThk && b.thk <= maxThk); const thin = bs.filter(b => b.thk < minThk);
      thick.forEach(b => { const am = (b.a0 + b.a1) / 2; const p1 = horiz ? toM(b.b0, am) : toM(am, b.b0), p2 = horiz ? toM(b.b1, am) : toM(am, b.b1); walls.push({ x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], thk: b.thk / ppm, horiz }); });
      // coppie di linee sottili parallele → muro
      thin.sort((a, b) => a.a0 - b.a0); const used = new Set();
      thin.forEach((l1, i) => { if (used.has(i)) return; for (let j = i + 1; j < thin.length; j++) { if (used.has(j)) continue; const l2 = thin[j]; const gap = (l2.a0 + l2.a1) / 2 - (l1.a0 + l1.a1) / 2; if (gap > maxThk) break; if (gap < .07 * ppm) continue; const ov = Math.min(l1.b1, l2.b1) - Math.max(l1.b0, l2.b0); if (ov > .6 * Math.min(l1.b1 - l1.b0, l2.b1 - l2.b0)) { used.add(i); used.add(j); const am = ((l1.a0 + l1.a1) / 2 + (l2.a0 + l2.a1) / 2) / 2; const b0 = Math.max(l1.b0, l2.b0), b1 = Math.min(l1.b1, l2.b1); const p1 = horiz ? toM(b0, am) : toM(am, b0), p2 = horiz ? toM(b1, am) : toM(am, b1); walls.push({ x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], thk: gap / ppm, horiz }); break; } } }); });
    // pulizia: arrotonda, unisce collineari con varchi → aperture
    walls.forEach(w => { w.thk = Math.max(.08, Math.min(.5, r05(w.thk))); ['x1', 'y1', 'x2', 'y2'].forEach(k => w[k] = Math.round(w[k] * 100) / 100); });
    const openings = []; const merged = [];
    [true, false].forEach(horiz => { const ws = walls.filter(w => w.horiz === horiz).map(w => horiz ? { c: w.y1, a: Math.min(w.x1, w.x2), b: Math.max(w.x1, w.x2), thk: w.thk } : { c: w.x1, a: Math.min(w.y1, w.y2), b: Math.max(w.y1, w.y2), thk: w.thk }).sort((p, q) => p.c - q.c || p.a - q.a);
      const groups = []; ws.forEach(w => { const g = groups.find(g => Math.abs(g.c - w.c) < Math.max(g.thk, w.thk) / 2 && Math.abs(g.thk - w.thk) < .12); if (g) g.items.push(w); else groups.push({ c: w.c, thk: w.thk, items: [w] }); });
      groups.forEach(g => { g.items.sort((p, q) => p.a - q.a); let cur = { ...g.items[0], gaps: [] }; const flush = () => { merged.push(horiz ? { x1: cur.a, y1: g.c, x2: cur.b, y2: g.c, thk: g.thk, gaps: cur.gaps } : { x1: g.c, y1: cur.a, x2: g.c, y2: cur.b, thk: g.thk, gaps: cur.gaps }); };
        for (let k = 1; k < g.items.length; k++) { const n = g.items[k]; const gap = n.a - cur.b; if (gap < .15) cur.b = Math.max(cur.b, n.b); else if (gap >= .6 && gap <= 2.2) { cur.gaps.push([cur.b, n.a]); cur.b = Math.max(cur.b, n.b); } else { flush(); cur = { ...n, gaps: [] }; } }
        flush(); }); });
    return { walls: merged.filter(w => G.dist([w.x1, w.y1], [w.x2, w.y2]) >= minLenM), size: [Wd / ppm, Hd / ppm], canvas: c };
  };
  /** immagine di esempio di pianta scansionata (per prova del tracciamento) */
  GEN.sampleScan = () => { const plan = GEN.generate({ w: 11, d: 8.5, bedrooms: 2, baths: 1, seed: 5, furniture: false }); const ppm = 50; const c = document.createElement('canvas'); c.width = 13 * ppm; c.height = 10.5 * ppm; const x = c.getContext('2d'); x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, c.width, c.height);
    App.cad.setDrawing({ entities: plan.entities, layers: App.newDrawing().layers, blocks: {} });
    const T = p => [(p[0] + 1) * ppm, c.height - (p[1] + 1) * ppm];
    plan.entities.filter(e => e.type === 'wall').forEach(w => { const L = G.dist([w.x1, w.y1], [w.x2, w.y2]); const d = G.norm([w.x2 - w.x1, w.y2 - w.y1]), n = G.perp(d); const ops = App.cad.openingsOf(w).map(o => [o.t * L - o.width / 2, o.t * L + o.width / 2]).sort((a, b) => a[0] - b[0]); let s = -w.thk / 2; const pcs = []; ops.forEach(([a, b]) => { pcs.push([s, a]); s = b; }); pcs.push([s, L + w.thk / 2]);
      x.fillStyle = '#1b1b1b'; pcs.forEach(([a, b]) => { if (b <= a) return; const q = [[a, w.thk / 2], [b, w.thk / 2], [b, -w.thk / 2], [a, -w.thk / 2]].map(([t, k]) => T(G.add(G.add([w.x1, w.y1], G.mul(d, t)), G.mul(n, k)))); x.beginPath(); q.forEach((p, i) => i ? x.lineTo(...p) : x.moveTo(...p)); x.closePath(); x.fill(); }); });
    x.fillStyle = '#555'; x.font = '16px Georgia'; plan.entities.filter(e => e.type === 'room').forEach(r => { const cc = T(G.centroid(r.pts)); x.fillText(r.name, cc[0] - 30, cc[1]); });
    x.globalAlpha = .07; for (let i = 0; i < 4000; i++) { x.fillStyle = Math.random() > .5 ? '#000' : '#fff'; x.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2); }
    App.cad.use(App.project()); return { canvas: c, pxPerM: ppm };
  };

  /* ---------- UI modulo ---------- */
  let state = { params: null, variants: [], chosen: 0, pendingEdit: null };
  const thumb = (ents, w = 300, h = 220) => { const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; c.style.width = w + 'px'; c.style.height = h + 'px'; const x = c.getContext('2d'); x.scale(2, 2); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
    const pts = ents.filter(e => e.type === 'wall').flatMap(e => [[e.x1, e.y1], [e.x2, e.y2]]); if (!pts.length) return c; const bb = G.bbox(pts); const s = Math.min((w - 30) / (bb[2] - bb[0] + 1), (h - 30) / (bb[3] - bb[1] + 1)); const T = p => [15 + (p[0] - bb[0] + .5) * s, h - 15 - (p[1] - bb[1] + .5) * s];
    App.cad.setDrawing({ entities: ents, layers: App.newDrawing().layers, blocks: {} });
    const col = { 'Soggiorno-cucina': '#fde8d7', Soggiorno: '#fde8d7', Cucina: '#fff1c9', 'Camera doppia': '#dfe9fb', 'Camera singola': '#e6efff', Bagno: '#d9f2ec', Disimpegno: '#f1f3f6' };
    ents.filter(e => e.type === 'room').forEach(r => { x.fillStyle = col[r.rtype] || '#f3f3f3'; x.beginPath(); r.pts.forEach((p, i) => { const q = T(p); i ? x.lineTo(...q) : x.moveTo(...q); }); x.closePath(); x.fill(); const cc = T(G.centroid(r.pts)); x.fillStyle = '#14213d'; x.font = '600 9px Helvetica'; x.textAlign = 'center'; x.fillText(r.name, cc[0], cc[1]); x.font = '8px Helvetica'; x.fillStyle = '#5d6879'; x.fillText(App.fnum(Math.abs(G.area(r.pts)), 1) + ' m²', cc[0], cc[1] + 10); });
    x.strokeStyle = '#7a8597'; x.lineWidth = .6; ents.filter(e => e.type === 'insert').forEach(e => App.cad.segsOf(e).forEach(sg => { x.beginPath(); x.moveTo(...T(sg[0])); x.lineTo(...T(sg[1])); x.stroke(); }));
    ents.filter(e => e.type === 'wall').forEach(w => { const L = G.dist([w.x1, w.y1], [w.x2, w.y2]); const d = G.norm([w.x2 - w.x1, w.y2 - w.y1]), n = G.perp(d); const ops = App.cad.openingsOf(w).map(o => [o.t * L - o.width / 2, o.t * L + o.width / 2, o.type]).sort((a, b) => a[0] - b[0]); let s = -w.thk / 2; const pcs = []; ops.forEach(([a, b]) => { pcs.push([s, a]); s = b; }); pcs.push([s, L + w.thk / 2]);
      x.fillStyle = '#2b3243'; pcs.forEach(([a, b]) => { if (b <= a) return; const q = [[a, w.thk / 2], [b, w.thk / 2], [b, -w.thk / 2], [a, -w.thk / 2]].map(([t, k]) => T(G.add(G.add([w.x1, w.y1], G.mul(d, t)), G.mul(n, k)))); x.beginPath(); q.forEach((p, i) => i ? x.lineTo(...p) : x.moveTo(...p)); x.closePath(); x.fill(); });
      ops.filter(o => o[2] === 'window').forEach(([a, b]) => { x.strokeStyle = '#3b8bd0'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(...T(G.add([w.x1, w.y1], G.mul(d, a)))); x.lineTo(...T(G.add([w.x1, w.y1], G.mul(d, b)))); x.stroke(); }); });
    App.cad.use(App.project()); return c; };
  const ver = r => r.rtype === 'Camera doppia' ? r.area >= 14 : r.rtype === 'Camera singola' ? r.area >= 9 : r.rtype.startsWith('Soggiorno') ? r.area >= 14 : true;

  const Mod = {
    guest: false, needProject: true,
    mount(view, args) {
      if (!App.state.org.aiPolicy.genEnabled) { view.innerHTML = '<div class="empty">Il modulo di progettazione generativa è disattivato dalla policy AI dell\'organizzazione (Amministrazione).</div>'; return; }
      const tab = args[0] || 'prompt';
      const body = App.modShell(view, { id: 'gen', title: App.t('m.gen'), sub: 'Modello generativo interno · contenuti marcati “da verificare”', tabs: [{ id: 'prompt', label: 'Da prompt / lotto' }, { id: 'edit', label: 'Modifiche testuali' }, { id: 'trace', label: 'Tracciamento scansioni' }], activeTab: tab, onTab: t => { location.hash = '#/gen/' + t; } });
      this.body = body;
      if (tab === 'trace') this.trace(body); else if (tab === 'edit') this.edit(body); else this.prompt(body);
    },
    prompt(body) {
      const p = App.project(); const lot = p.drawing.entities.find(e => e.layer === 'LOTTO' && e.pts && e.closed);
      body.innerHTML = `<div class="page"><div style="display:grid;grid-template-columns:380px 1fr;gap:18px;align-items:start">
        <div class="card"><h4>Brief di progetto</h4>
          <label class="f"><span>Descrivi l'intervento (prompt)</span><textarea id="gPrompt" rows="4">Abitazione unifamiliare di 95 mq con 2 camere, 2 bagni e cucina a vista, un piano</textarea></label>
          <button class="btn sm" id="gParse" style="margin-top:8px">Interpreta prompt →</button>
          <div class="sec-t">Parametri</div>
          <div class="grid2"><label class="f"><span>Superficie (m²)</span><input type="number" id="gArea"></label><label class="f"><span>Camere</span><input type="number" id="gBed" min="1" max="5"></label>
          <label class="f"><span>Bagni</span><input type="number" id="gBath" min="1" max="3"></label><label class="f"><span>Cucina</span><select id="gKit"><option value="open">A vista</option><option value="separate">Separata</option></select></label>
          <label class="f"><span>Larghezza (m)</span><input type="number" step="0.05" id="gW"></label><label class="f"><span>Profondità (m)</span><input type="number" step="0.05" id="gD"></label>
          <label class="f"><span>Altezza muri (m)</span><input type="number" step="0.05" id="gH"></label><label class="f"><span>Arredi</span><select id="gF"><option value="1">Sì</option><option value="0">No</option></select></label></div>
          <div class="sec-t">Lotto e impronta</div>
          <div class="small">${lot ? `Lotto rilevato nel disegno (layer LOTTO): ${App.fnum(Math.abs(App.geom.area(lot.pts)))} m². L'impronta verrà posizionata rispettando la distanza dai confini.` : 'Nessun lotto nel disegno: disegna una polilinea chiusa sul layer LOTTO o importala dal modulo GIS.'}</div>
          <label class="f" style="margin-top:6px"><span>Distanza minima dai confini (m)</span><input type="number" id="gSet" value="5" step="0.5"></label>
          <div class="disclaimer">Stima crediti AI: <b id="gCost">6</b> crediti (3 varianti × 2) · disponibili ${App.state.org.credits}. In modalità locale il modello gira sul dispositivo; i dati non sono usati per addestramento.</div>
          <button class="btn primary" id="gGen" style="margin-top:10px;width:100%">${App.icon('spark', 16)} Genera 3 varianti</button>
        </div>
        <div id="gOut"><div class="card empty">Le varianti generate (piante, prospetti e 3D connessi) appariranno qui.</div></div></div></div>`;
      const set = P => { $('#gArea').value = P.area; $('#gBed').value = P.bedrooms; $('#gBath').value = P.baths; $('#gKit').value = P.kitchen; $('#gW').value = P.w; $('#gD').value = P.d; $('#gH').value = P.h; };
      const get = () => ({ area: +$('#gArea').value, bedrooms: Math.max(1, +$('#gBed').value | 0), baths: Math.max(1, +$('#gBath').value | 0), kitchen: $('#gKit').value, w: +$('#gW').value, d: +$('#gD').value, h: +$('#gH').value || 3, furniture: $('#gF').value === '1' });
      set(state.params || GEN.parsePrompt($('#gPrompt').value));
      $('#gParse').onclick = () => { set(GEN.parsePrompt($('#gPrompt').value)); App.toast('Parametri aggiornati dal prompt'); };
      $('#gArea').onchange = () => { const a = +$('#gArea').value; const gross = a * 1.15; const d = r05(Math.sqrt(gross / 1.3)); $('#gW').value = r05(gross / d); $('#gD').value = d; };
      $('#gGen').onclick = () => {
        if (App.state.org.credits < 6) { App.toast('Crediti AI insufficienti', 'err'); return; }
        const P = get(); let origin = [0, 0]; const setback = +$('#gSet').value || 0;
        if (lot) { const bb = App.geom.bbox(lot.pts); origin = [bb[0] + setback, bb[1] + setback]; const fits = [[0, 0], [P.w, 0], [P.w, P.d], [0, P.d]].every(q => { const pt = [origin[0] + q[0], origin[1] + q[1]]; return App.geom.pip(pt, lot.pts) && lot.pts.every((a, i) => App.geom.segDist(pt, a, lot.pts[(i + 1) % lot.pts.length]) >= setback - 1e-6); }); if (!fits) App.toast('Attenzione: l\'impronta non rispetta il lotto con la distanza impostata. Ridurre dimensioni o distanza.', 'warn'); }
        state.params = P; state.variants = [1, 2, 3].map(k => GEN.generate({ ...P, seed: k * 7 + (Date.now() % 5), origin }));
        state.variants[1].params.kitchen = state.variants[1].params.kitchen; App.state.org.credits -= 6; App.audit('ai-generate', `Generate 3 varianti (${P.area} m², ${P.bedrooms} camere)`); App.save();
        this.showVariants();
      };
      if (state.variants.length) this.showVariants();
    },
    showVariants() {
      const out = $('#gOut'); if (!out) return;
      out.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">${state.variants.map((v, i) => `<div class="card" style="padding:12px;${i === state.chosen ? 'border-color:var(--orange);box-shadow:0 0 0 3px rgba(238,122,63,.15)' : ''}" data-v="${i}"><div class="row between"><b>Variante ${String.fromCharCode(65 + i)}</b><span class="pill ai">AI · da verificare</span></div><div class="th" style="margin:8px 0"></div><div class="small">Sup. utile <b>${App.fnum(v.sup, 1)} m²</b> · Lordo ${App.fnum(v.params.w * v.params.d, 1)} m²</div><div class="tiny muted">${v.rooms.filter(r => r.rtype !== 'Disimpegno').map(r => `${r.name} ${App.fnum(r.area, 1)}${ver(r) ? '' : ' ⚠'}`).join(' · ')}</div><button class="btn sm ${i === state.chosen ? 'primary' : ''}" data-pick="${i}" style="margin-top:8px">${i === state.chosen ? 'Selezionata' : 'Seleziona'}</button></div>`).join('')}</div>
        <div class="card" style="margin-top:14px"><div class="row between"><h4 style="margin:0">Elaborati connessi – Variante ${String.fromCharCode(65 + state.chosen)}</h4><div class="row"><button class="btn" id="gIns">${App.icon('download', 15)} Inserisci nel progetto CAD</button></div></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px" id="gViews"></div><p class="small muted" style="margin:8px 0 0">Prospetti e assonometria sono derivati dal modello 3D della pianta e restano sincronizzati con essa nel CAD.</p></div>`;
      $$('[data-v] .th', out).forEach((t, i) => t.appendChild(thumb(state.variants[i].entities, 280, 190)));
      $$('[data-pick]', out).forEach(b => b.onclick = () => { state.chosen = +b.dataset.pick; this.showVariants(); });
      const v = state.variants[state.chosen]; const Dv = { entities: v.entities, layers: App.newDrawing().layers, blocks: {} };
      [['asso', 'Assonometria'], ['sud', 'Prospetto Sud'], ['est', 'Prospetto Est']].forEach(([k, l]) => { const c = App.cad3d.renderImage(Dv, 600, 400, k); c.style.width = '100%'; c.style.borderRadius = '8px'; const d = document.createElement('div'); d.innerHTML = `<div class="tiny muted" style="margin-bottom:4px">${l}</div>`; d.appendChild(c); $('#gViews').appendChild(d); });
      App.cad.use(App.project());
      $('#gIns').onclick = async () => {
        const p = App.project(); const has = p.drawing.entities.some(e => ['wall', 'room', 'door', 'window'].includes(e.type));
        let mode = 'add'; if (has) { const r = await App.modal({ title: 'Inserimento nel progetto', body: '<p>Il disegno contiene già elementi architettonici. Come vuoi procedere?</p>', actions: [{ label: App.t('cancel'), value: null }, { label: 'Affianca (a destra)', value: 'side' }, { label: 'Sostituisci elementi architettonici', primary: true, value: 'replace' }] }); if (!r) return; mode = r; }
        if (!App.can('edit')) { App.toast('Permesso negato', 'err'); return; }
        App.cad.use(p); App.cad.begin();
        if (mode === 'replace') p.drawing.entities = p.drawing.entities.filter(e => !['wall', 'room', 'door', 'window', 'insert', 'dim'].includes(e.type) || e.layer === 'LOTTO');
        let dx = 0; if (mode === 'side') { const pts = []; p.drawing.entities.forEach(e => { const b = App.cad.bboxOf(e); if (b) pts.push([b[2], b[3]]); }); dx = pts.length ? Math.max(...pts.map(q => q[0])) + 4 - Math.min(...v.entities.filter(e => 'x1' in e).map(e => Math.min(e.x1, e.x2))) : 0; }
        const idmap = {}; v.entities.forEach(e => idmap[e.id] = App.uid());
        v.entities.forEach(e => { const n = App.clone(e); n.id = idmap[e.id]; if (n.wall) n.wall = idmap[n.wall]; n.ai = true; n.author = App.user.id; if ('x1' in n) { n.x1 += dx; n.x2 += dx; } if (n.pts) n.pts = n.pts.map(q => [q[0] + dx, q[1]]); if (n.type === 'insert') n.x += dx; p.drawing.entities.push(n); });
        App.cad.commit('Generazione AI – variante ' + String.fromCharCode(65 + state.chosen));
        App.audit('ai-insert', `Inserita variante AI (${v.entities.length} elementi, da verificare)`, { aiTrace: { model: 'BeCity-GEN procedurale v1', params: v.params } });
        App.toast('Variante inserita: gli elementi sono marcati “da verificare” fino alla validazione (comando VALIDA).', 'ok'); location.hash = '#/cad';
      };
    },
    edit(body) {
      body.innerHTML = `<div class="page"><div class="card" style="max-width:960px"><h4>Modifiche testuali con anteprima delle differenze</h4>
        ${state.variants.length ? '' : '<div class="disclaimer">Genera prima una variante nella scheda “Da prompt / lotto”.</div>'}
        <div class="row"><input type="text" id="eTxt" placeholder="es. allarga il soggiorno di 1,5 m · aggiungi un bagno · cucina separata · profondità a 10"><button class="btn primary" id="eGo" ${state.variants.length ? '' : 'disabled'}>Anteprima</button></div>
        <div id="eOut" style="margin-top:14px"></div></div></div>`;
      $('#eGo').onclick = () => { const cur = state.variants[state.chosen]; const r = GEN.applyEdit($('#eTxt').value, cur.params); if (!r.log.length) { $('#eOut').innerHTML = '<div class="disclaimer">Richiesta non compresa. Esempi: “allarga il soggiorno di 1 m”, “aggiungi una camera”, “cucina separata”, “profondità a 10”.</div>'; return; }
        const nv = GEN.generate({ ...r.params }); const before = new Map(cur.rooms.map(x => [x.name, x.area])); const names = [...new Set([...cur.rooms.map(x => x.name), ...nv.rooms.map(x => x.name)])];
        $('#eOut').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><div><div class="tiny muted">Prima</div><div id="eA"></div></div><div><div class="tiny muted">Dopo</div><div id="eB"></div></div></div>
          <h4 style="margin-top:12px">Differenze</h4><ul>${r.log.map(l => `<li>${App.esc(l)}</li>`).join('')}</ul>
          <table class="tbl"><thead><tr><th>Ambiente</th><th class="num">Prima m²</th><th class="num">Dopo m²</th><th class="num">Δ</th></tr></thead><tbody>${names.map(n => { const a = before.get(n), b = (nv.rooms.find(x => x.name === n) || {}).area; return `<tr><td>${App.esc(n)}</td><td class="num">${a != null ? App.fnum(a, 1) : '—'}</td><td class="num">${b != null ? App.fnum(b, 1) : '—'}</td><td class="num ${(b || 0) - (a || 0) >= 0 ? 'ok' : 'err'}">${App.fnum((b || 0) - (a || 0), 1)}</td></tr>`; }).join('')}</tbody></table>
          <div class="row" style="margin-top:12px"><button class="btn primary" id="eOk">Conferma modifica</button><button class="btn" id="eNo">Scarta</button></div>`;
        $('#eA').appendChild(thumb(cur.entities, 420, 280)); $('#eB').appendChild(thumb(nv.entities, 420, 280));
        $('#eOk').onclick = () => { state.variants[state.chosen] = nv; App.audit('ai-edit', $('#eTxt').value); App.toast('Modifica applicata alla variante', 'ok'); location.hash = '#/gen/prompt'; };
        $('#eNo').onclick = () => { $('#eOut').innerHTML = ''; }; };
    },
    trace(body) {
      body.innerHTML = `<div class="page"><div style="display:grid;grid-template-columns:340px 1fr;gap:18px;align-items:start">
        <div class="card"><h4>Tracciamento AI da scansione</h4><p class="small muted">Converte scansioni o immagini di piante (PNG/JPG) in muri e aperture vettoriali. I risultati sono marcati “da verificare”.</p>
          <div class="row wrap"><button class="btn" id="tLoad">${App.icon('upload', 15)} Carica immagine</button><button class="btn" id="tSample">Usa esempio</button></div>
          <div class="sec-t">Scala</div><label class="f"><span>Larghezza reale dell'immagine (m)</span><input type="number" id="tWm" step="0.1"></label><div class="tiny faint" id="tPx"></div>
          <label class="f" style="margin-top:8px"><span>Soglia scuro <b id="tThrV">110</b></span><input type="range" id="tThr" min="40" max="220" value="110"></label>
          <label class="f"><span>Lunghezza minima muro (m)</span><input type="number" id="tMin" value="0.5" step="0.1"></label>
          <button class="btn primary" id="tRun" style="margin-top:10px;width:100%" disabled>${App.icon('spark', 15)} Traccia</button>
          <div id="tRes" class="small" style="margin-top:10px"></div>
          <button class="btn" id="tIns" style="margin-top:8px;width:100%" disabled>Inserisci nel CAD</button>
          <div class="tiny faint" style="margin-top:8px">PDF: convertire prima la pagina in immagine (stampa → salva come PNG). Il rilevamento stanze è manuale (comando STANZA).</div></div>
        <div class="card" style="padding:8px"><canvas id="tCv" style="width:100%;background:#f6f7f9;border-radius:8px"></canvas></div></div></div>`;
      let img = null, res = null, ppm = null; const cv = $('#tCv');
      const show = () => { if (!img) return; cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0); if (res) { const s = cv.width / (res.size[0]); x.lineWidth = 3; res.walls.forEach(w => { x.strokeStyle = 'rgba(238,122,63,.9)'; x.beginPath(); x.moveTo(w.x1 * s, cv.height - w.y1 * s); x.lineTo(w.x2 * s, cv.height - w.y2 * s); x.stroke(); x.strokeStyle = 'rgba(61,111,224,.9)'; (w.gaps || []).forEach(([a, b]) => { const hz = Math.abs(w.y1 - w.y2) < 1e-6; x.beginPath(); if (hz) { x.moveTo(a * s, cv.height - w.y1 * s); x.lineTo(b * s, cv.height - w.y1 * s); } else { x.moveTo(w.x1 * s, cv.height - a * s); x.lineTo(w.x1 * s, cv.height - b * s); } x.stroke(); }); }); } };
      const setImg = (im, pxm) => { img = im; res = null; ppm = pxm || null; $('#tWm').value = pxm ? (im.width / pxm).toFixed(2) : (im.width / 100).toFixed(2); $('#tPx').textContent = `${im.width}×${im.height} px`; $('#tRun').disabled = false; $('#tIns').disabled = true; show(); };
      $('#tLoad').onclick = async () => { const [f] = await App.pickFiles({ accept: 'image/png,image/jpeg,image/webp,image/bmp' }); if (!f) return; const im = new Image(); im.onload = () => setImg(im); im.src = await App.readDataURL(f); };
      $('#tSample').onclick = () => { const s = GEN.sampleScan(); const im = new Image(); im.onload = () => setImg(im, s.pxPerM); im.src = s.canvas.toDataURL(); };
      $('#tThr').oninput = e => $('#tThrV').textContent = e.target.value;
      $('#tRun').onclick = () => { const wm = +$('#tWm').value; if (!(wm > 0)) { App.toast('Indica la larghezza reale', 'warn'); return; } res = GEN.trace(img, { pxPerM: img.width / wm, thr: +$('#tThr').value, minLenM: +$('#tMin').value }); const nOp = res.walls.reduce((a, w) => a + (w.gaps || []).length, 0); $('#tRes').innerHTML = `<b>${res.walls.length}</b> muri e <b>${nOp}</b> aperture rilevati.`; $('#tIns').disabled = !res.walls.length; show(); App.audit('ai-trace', `Tracciamento: ${res.walls.length} muri`); };
      $('#tIns').onclick = () => { if (!App.can('edit')) { App.toast('Permesso negato', 'err'); return; } const p = App.project(); App.cad.use(p); App.cad.begin();
        res.walls.forEach(w => { const e = { id: App.uid(), type: 'wall', x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, thk: w.thk, h: 3, layer: 'MURI', material: w.thk >= .25 ? 'Laterizio' : 'Cartongesso', ai: true }; p.drawing.entities.push(e); const L = G.dist([w.x1, w.y1], [w.x2, w.y2]); const hz = Math.abs(w.y1 - w.y2) < 1e-6; const st = hz ? Math.min(w.x1, w.x2) : Math.min(w.y1, w.y2); const rev = hz ? w.x1 > w.x2 : w.y1 > w.y2;
          (w.gaps || []).forEach(([a, b]) => { let t = ((a + b) / 2 - st) / L; if (rev) t = 1 - t; const width = b - a; p.drawing.entities.push({ id: App.uid(), type: width < 1.05 ? 'door' : 'window', wall: e.id, t, width: r05(width), side: 1, flip: false, h: width < 1.05 ? 2.1 : 1.4, sill: width < 1.05 ? 0 : .9, layer: 'APERTURE', ai: true }); }); });
        App.cad.commit('Tracciamento AI da scansione'); App.toast('Muri inseriti come “da verificare”', 'ok'); location.hash = '#/cad'; };
    }
  };
  // il modulo generativo non è più un'applicazione autonoma: le funzioni restano disponibili alle altre applicazioni
  App.genUI = Mod;
})();
