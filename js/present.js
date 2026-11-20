/* BeCity – Presentazione e output: tavole in scala, render, link di condivisione, proposte */
'use strict';
(function () {
  const G = App.geom;
  const PR = App.present = {};
  const FMT = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] };
  const MATC = { Gres: '#e6e1d8', Parquet: '#e3c7a0', Marmo: '#f1eee9', Resina: '#dde3e8', Cotto: '#e2a785' };
  /** costruisce l'SVG della tavola */
  PR.sheetSVG = (p, o) => {
    App.cad.use(p); const D = p.drawing; const [Wm, Hm] = FMT[o.fmt] || FMT.A3; const k = 1000 / o.scale; // mm per metro
    const vis = e => { const l = D.layers.find(x => x.name === e.layer); return !l || (l.visible && !l.frozen); };
    const ents = D.entities.filter(vis); const pts = []; ents.forEach(e => { const b = App.cad.bboxOf(e); if (b) pts.push([b[0], b[1]], [b[2], b[3]]); });
    const bb = pts.length ? G.bbox(pts) : [0, 0, 10, 10]; const frame = [12, 12, Wm - 24, Hm - 24]; const tbW = 120, tbH = 42;
    const planArea = [frame[0] + 8, frame[1] + 14, (o.render ? frame[2] * .58 : frame[2] - 16), frame[3] - tbH - 24];
    const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2; const ox = planArea[0] + planArea[2] / 2, oy = planArea[1] + planArea[3] / 2;
    const X = x => (ox + (x - cx) * k).toFixed(2), Y = y => (oy - (y - cy) * k).toFixed(2);
    const fits = (bb[2] - bb[0]) * k <= planArea[2] && (bb[3] - bb[1]) * k <= planArea[3];
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wm}mm" height="${Hm}mm" viewBox="0 0 ${Wm} ${Hm}" font-family="Helvetica, Arial, sans-serif"><defs><filter id="sh" x="-5%" y="-5%" width="115%" height="115%"><feDropShadow dx=".6" dy=".6" stdDeviation=".5" flood-color="#000" flood-opacity=".35"/></filter><pattern id="hatch" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.2" stroke="#6b7280" stroke-width=".18"/></pattern><clipPath id="pc"><rect x="${planArea[0]}" y="${planArea[1]}" width="${planArea[2]}" height="${planArea[3]}"/></clipPath></defs><rect width="${Wm}" height="${Hm}" fill="#fff"/>`;
    s += `<rect x="${frame[0]}" y="${frame[1]}" width="${frame[2]}" height="${frame[3]}" fill="none" stroke="#14213d" stroke-width=".5"/>`;
    s += `<text x="${planArea[0]}" y="${frame[1] + 9}" font-size="5" font-weight="700" fill="#14213d">${App.esc(o.title)}</text><g clip-path="url(#pc)">`;
    // stanze con materiali
    ents.filter(e => e.type === 'room').forEach(r => { s += `<polygon points="${r.pts.map(q => X(q[0]) + ',' + Y(q[1])).join(' ')}" fill="${o.materials ? (MATC[r.floor] || '#eee') : '#fff'}" stroke="none"/>`; if (o.materials && r.floor === 'Parquet') { const bx = G.bbox(r.pts); for (let y = bx[1]; y < bx[3]; y += .15) s += `<line x1="${X(bx[0])}" y1="${Y(y)}" x2="${X(bx[2])}" y2="${Y(y)}" stroke="#c9a77c" stroke-width=".08"/>`; } });
    // muri con ombra e retino
    const walls = ents.filter(e => e.type === 'wall'); const wpoly = w => { const L = G.dist([w.x1, w.y1], [w.x2, w.y2]); const d = G.norm([w.x2 - w.x1, w.y2 - w.y1]), n = G.perp(d); const ops = App.cad.openingsOf(w).map(op => [op.t * L - op.width / 2, op.t * L + op.width / 2]).sort((a, b) => a[0] - b[0]); const ext = [0, 1].map(i => { const p = i ? [w.x2, w.y2] : [w.x1, w.y1]; return walls.some(o2 => o2 !== w && G.segDist(p, [o2.x1, o2.y1], [o2.x2, o2.y2]) < o2.thk / 2 + 1e-6) ? w.thk / 2 : 0; }); let st = -ext[0]; const pcs = []; ops.forEach(([a, b]) => { if (a > st) pcs.push([st, a]); st = Math.max(st, b); }); pcs.push([st, L + ext[1]]); return pcs.filter(([a, b]) => b > a).map(([a, b]) => [[a, w.thk / 2], [b, w.thk / 2], [b, -w.thk / 2], [a, -w.thk / 2]].map(([t, h]) => G.add(G.add([w.x1, w.y1], G.mul(d, t)), G.mul(n, h)))); };
    const wp = walls.flatMap(wpoly).map(pc => `<polygon points="${pc.map(q => X(q[0]) + ',' + Y(q[1])).join(' ')}"/>`).join('');
    s += `<g ${o.shadows ? 'filter="url(#sh)"' : ''} fill="#2b3243" stroke="#2b3243" stroke-width=".05">${wp}</g>`;
    if (k >= 8) s += `<g fill="url(#hatch)" opacity=".45">${wp}</g>`;
    // altre entità
    const line = (a, b, col = '#3a4356', w = .18) => `<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="${col}" stroke-width="${w}"/>`;
    ents.forEach(e => { if (e.type === 'insert' && o.furniture) App.cad.segsOf(e).forEach(sg => s += line(sg[0], sg[1], '#7a8597', .12));
      if (e.type === 'door' || e.type === 'window') { const g = App.cad.openingGeom(e); if (!g) return; const h = g.thk / 2; if (e.type === 'window') { s += line(G.add(g.p1, G.mul(g.n, h)), G.add(g.p2, G.mul(g.n, h)), '#3b8bd0', .2) + line(G.sub(g.p1, G.mul(g.n, h)), G.sub(g.p2, G.mul(g.n, h)), '#3b8bd0', .2) + line(g.p1, g.p2, '#3b8bd0', .3); } else { const sd = e.side || 1, hinge = e.flip ? g.p2 : g.p1, hp = G.add(hinge, G.mul(g.n, sd * h)), leaf = G.add(hp, G.mul(g.n, sd * e.width)); const other = G.add(e.flip ? g.p1 : g.p2, G.mul(g.n, sd * h)); s += line(hp, leaf, '#3a4356', .25) + `<path d="M${X(leaf[0])},${Y(leaf[1])} A${(e.width * k).toFixed(2)},${(e.width * k).toFixed(2)} 0 0 ${((sd > 0) !== !!e.flip) ? 0 : 1} ${X(other[0])},${Y(other[1])}" fill="none" stroke="#9aa3b2" stroke-width=".12" stroke-dasharray=".8 .6"/>`; } }
      if ((e.type === 'line' || e.type === 'pline' || e.type === 'circle' || e.type === 'arc') ) App.cad.segsOf(e).forEach(sg => s += line(sg[0], sg[1], e.layer === 'LOTTO' ? '#ee7a3f' : '#3a4356', .15));
      if (e.type === 'dim' && o.dims) { const a = [e.x1, e.y1], b = [e.x2, e.y2], n = G.perp(G.norm(G.sub(b, a))); const A = G.add(a, G.mul(n, e.off)), B = G.add(b, G.mul(n, e.off)); const ang = -Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI; const m = G.lerp(A, B, .5); s += line(a, A, '#df5179', .1) + line(b, B, '#df5179', .1) + line(A, B, '#df5179', .15) + `<text x="${X(m[0])}" y="${Y(m[1])}" dy="-.8" font-size="2.4" text-anchor="middle" fill="#df5179" transform="rotate(${(ang > 90 || ang < -90 ? ang + 180 : ang).toFixed(1)} ${X(m[0])} ${Y(m[1])})">${App.fnum(G.dist(a, b))}</text>`; }
      if (e.type === 'text') s += `<text x="${X(e.x)}" y="${Y(e.y)}" font-size="${(e.h * k).toFixed(2)}" fill="#14213d">${App.esc(e.text)}</text>`; });
    if (o.labels) ents.filter(e => e.type === 'room').forEach(r => { const c = G.centroid(r.pts); s += `<text x="${X(c[0])}" y="${Y(c[1])}" font-size="2.6" font-weight="700" text-anchor="middle" fill="#14213d">${App.esc(r.name)}</text><text x="${X(c[0])}" y="${(+Y(c[1]) + 3.2).toFixed(2)}" font-size="2.2" text-anchor="middle" fill="#5d6879">${App.fnum(App.cad.area(r))} m²</text>`; });
    s += '</g>';
    if (o.render) { const rx = planArea[0] + planArea[2] + 8, rw = frame[0] + frame[2] - rx - 8; const rh = rw * .66; const img = o.renderImg; s += `<image href="${img}" x="${rx}" y="${planArea[1]}" width="${rw}" height="${rh}" preserveAspectRatio="xMidYMid slice"/><rect x="${rx}" y="${planArea[1]}" width="${rw}" height="${rh}" fill="none" stroke="#c9d0db" stroke-width=".3"/><text x="${rx}" y="${planArea[1] + rh + 5}" font-size="3" fill="#5d6879">Vista assonometrica</text>`; if (o.elevImg) { const ey = planArea[1] + rh + 10; const eh = Math.min(rh * .6, frame[1] + frame[3] - tbH - 14 - ey); if (eh > 20) s += `<image href="${o.elevImg}" x="${rx}" y="${ey}" width="${rw}" height="${eh}" preserveAspectRatio="xMidYMid meet"/><text x="${rx}" y="${ey + eh + 4}" font-size="3" fill="#5d6879">Prospetto Sud</text>`; } }
    // nord, scala grafica
    const nx = frame[0] + 16, ny = frame[1] + frame[3] - 22; s += `<g transform="translate(${nx},${ny})"><circle r="6" fill="none" stroke="#14213d" stroke-width=".3"/><path d="M0,-6 L2.4,3 L0,1.2 L-2.4,3Z" fill="#14213d"/><text y="-7.5" font-size="3" text-anchor="middle" font-weight="700">N</text></g>`;
    const sbm = [1, 2, 5, 10, 20, 50].find(m => m * k >= 25) || 50; const sx = frame[0] + 30, sy = ny + 4; for (let i = 0; i < 5; i++) s += `<rect x="${sx + i * sbm * k / 5}" y="${sy}" width="${sbm * k / 5}" height="1.5" fill="${i % 2 ? '#fff' : '#14213d'}" stroke="#14213d" stroke-width=".2"/>`; s += `<text x="${sx}" y="${sy - 1.5}" font-size="2.5">0</text><text x="${sx + sbm * k}" y="${sy - 1.5}" font-size="2.5" text-anchor="middle">${sbm} m</text>`;
    // cartiglio
    const tx = frame[0] + frame[2] - tbW, ty = frame[1] + frame[3] - tbH; s += `<g font-size="2.8" fill="#14213d"><rect x="${tx}" y="${ty}" width="${tbW}" height="${tbH}" fill="#fff" stroke="#14213d" stroke-width=".4"/><line x1="${tx}" y1="${ty + 12}" x2="${tx + tbW}" y2="${ty + 12}" stroke="#14213d" stroke-width=".25"/><line x1="${tx}" y1="${ty + 30}" x2="${tx + tbW}" y2="${ty + 30}" stroke="#14213d" stroke-width=".25"/><line x1="${tx + tbW * .62}" y1="${ty + 30}" x2="${tx + tbW * .62}" y2="${ty + tbH}" stroke="#14213d" stroke-width=".25"/>
      <text x="${tx + 3}" y="${ty + 5}" font-size="2.2" fill="#5d6879">PROGETTO</text><text x="${tx + 3}" y="${ty + 10}" font-size="4" font-weight="700">${App.esc(p.name)}</text>
      <text x="${tx + 3}" y="${ty + 17}" font-size="2.2" fill="#5d6879">COMMITTENTE · UBICAZIONE</text><text x="${tx + 3}" y="${ty + 21.5}">${App.esc(p.client || '—')}</text><text x="${tx + 3}" y="${ty + 26}">${App.esc((p.comune ? 'Comune di ' + p.comune : '') + (p.address ? ' – ' + p.address : ''))}</text>
      <text x="${tx + 3}" y="${ty + 35}" font-size="2.2" fill="#5d6879">TAVOLA</text><text x="${tx + 3}" y="${ty + 40}" font-size="3.4" font-weight="700">${App.esc(o.num)} – ${App.esc(o.subtitle)}</text>
      <text x="${tx + tbW * .62 + 3}" y="${ty + 35}" font-size="2.2" fill="#5d6879">SCALA · FORMATO · DATA</text><text x="${tx + tbW * .62 + 3}" y="${ty + 40}">1:${o.scale} · ${o.fmt} · ${new Date().toLocaleDateString('it-IT')}</text></g>
      <text x="${frame[0] + 2}" y="${Hm - 6}" font-size="2.2" fill="#8a94a4">${App.esc(App.state.org.name)} – ${App.esc(App.user ? App.user.name : '')} · BeCity${D.entities.some(e => e.ai) ? ' · contiene elementi generati da AI non validati' : ''}</text>`;
    if (!fits) s += `<text x="${planArea[0]}" y="${planArea[1] + 4}" font-size="3" fill="#d23c3c">Il disegno eccede l'area alla scala 1:${o.scale}</text>`;
    return s + '</svg>';
  };
  PR.autoScale = p => { App.cad.use(p); const pts = []; p.drawing.entities.forEach(e => { const b = App.cad.bboxOf(e); if (b) pts.push([b[0], b[1]], [b[2], b[3]]); }); if (!pts.length) return 100; const bb = G.bbox(pts); const w = bb[2] - bb[0], h = bb[3] - bb[1]; return [50, 100, 200, 500].find(s => w * 1000 / s <= 220 && h * 1000 / s <= 200) || 500; };
  const svgToPng = (svg, w, cb) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = w * img.height / img.width; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(cb); }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); };
  const printSVG = (svg, fmt, title) => { const [w, h] = FMT[fmt]; const win = window.open('', '_blank'); if (!win) { App.toast('Consenti i popup per stampare', 'warn'); return; } win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${App.esc(title)}</title><style>@page{size:${w}mm ${h}mm;margin:0}html,body{margin:0}svg{display:block}</style></head><body>${svg}<script>setTimeout(()=>print(),400)<\/script></body></html>`); win.document.close(); };

  const Mod = {
    guest: false, needProject: true,
    mount(view, args) {
      const tab = args[0] || 'tavole';
      const body = App.modShell(view, { id: 'present', title: 'BeCity ' + App.t('m.present'), sub: 'Tavole, render e report per clienti e stakeholder', tabs: [{ id: 'tavole', label: 'Tavole' }, { id: 'render', label: 'Render' }, { id: 'share', label: 'Condivisione' }, { id: 'proposta', label: 'Proposta e cronoprogramma' }], activeTab: tab, onTab: t => location.hash = '#/present/' + t });
      ({ tavole: this.tavole, render: this.render, share: this.share, proposta: this.proposta }[tab] || this.tavole).call(this, body);
    },
    tavole(body) {
      const p = App.project(); const o = Object.assign({ fmt: 'A3', scale: PR.autoScale(p), title: 'Pianta piano terra', subtitle: 'Pianta arredata', num: 'A.01', materials: true, shadows: true, furniture: true, dims: true, labels: true, render: true }, p.sheetOpts || {});
      body.innerHTML = `<aside class="side left" style="width:290px"><div class="side-body col" style="gap:10px">
        <div class="sec-t">Impostazioni tavola</div><div class="grid2"><label class="f"><span>Formato</span><select data-o="fmt">${Object.keys(FMT).map(f => `<option ${o.fmt === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label><label class="f"><span>Scala 1:</span><select data-o="scale">${[50, 100, 200, 500].map(s => `<option ${+o.scale === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
        <label class="f"><span>Titolo</span><input data-o="title" value="${App.esc(o.title)}"></label><div class="grid2"><label class="f"><span>N. tavola</span><input data-o="num" value="${App.esc(o.num)}"></label><label class="f"><span>Sottotitolo</span><input data-o="subtitle" value="${App.esc(o.subtitle)}"></label></div>
        ${[['materials', 'Materiali dei pavimenti'], ['shadows', 'Ombre'], ['furniture', 'Arredi'], ['dims', 'Quote'], ['labels', 'Etichette stanze'], ['render', 'Viste 3D e prospetto']].map(([k, l]) => `<label class="chk"><input type="checkbox" data-o="${k}" ${o[k] ? 'checked' : ''}> ${l}</label>`).join('')}
        <div class="sec-t">Esporta</div><button class="btn primary" id="sPdf">${App.icon('print', 15)} PDF (stampa in scala)</button><button class="btn" id="sSvg">SVG vettoriale</button><button class="btn" id="sPng">PNG 300 dpi</button>
        <p class="tiny faint">Per il PDF scegli “Salva come PDF” e scala 100% nella finestra di stampa: le misure restano in scala.</p></div></aside><div class="sheet-host" id="sHost"></div>`;
      let svg = '';
      const upd = () => { $$('[data-o]').forEach(i => o[i.dataset.o] = i.type === 'checkbox' ? i.checked : i.dataset.o === 'scale' ? +i.value : i.value); p.sheetOpts = o; App.touch();
        if (o.render) { o.renderImg = App.cad3d.renderImage(p.drawing, 900, 600, 'asso', { shadows: true }).toDataURL('image/jpeg', .85); o.elevImg = App.cad3d.renderImage(p.drawing, 900, 420, 'sud', { ground: false, sky: '#ffffff', bg: '#ffffff', dist: .5 }).toDataURL('image/jpeg', .85); } App.cad.use(p);
        svg = PR.sheetSVG(p, o); const [w, h] = FMT[o.fmt]; const sc = Math.min(1, ($('#sHost').clientWidth - 60) / (w * 3.78)); $('#sHost').innerHTML = svg.replace(/width="\d+mm" height="\d+mm"/, `width="${w * 3.78 * sc}" height="${h * 3.78 * sc}"`); delete o.renderImg; delete o.elevImg; };
      $$('[data-o]').forEach(i => i.onchange = upd); setTimeout(upd, 30);
      $('#sPdf').onclick = () => { printSVG(svg, o.fmt, o.title); App.audit('export', 'Tavola PDF ' + o.num); };
      $('#sSvg').onclick = () => App.download(App.slug(o.num + '_' + o.title) + '.svg', svg, 'image/svg+xml');
      $('#sPng').onclick = () => svgToPng(svg, Math.round(FMT[o.fmt][0] / 25.4 * 300), b => App.download(App.slug(o.num + '_' + o.title) + '.png', b));
    },
    render(body) {
      const p = App.project();
      body.innerHTML = `<aside class="side left" style="width:280px"><div class="side-body col" style="gap:10px"><div class="sec-t">Camera</div><select id="rV"><option value="persp">Prospettiva esterna</option><option value="asso">Assonometria</option><option value="volo">Volo d'uccello</option><option value="sud">Prospetto Sud</option><option value="nord">Prospetto Nord</option><option value="est">Prospetto Est</option><option value="ovest">Prospetto Ovest</option><option value="interno">Interno (camera a quota occhi)</option></select>
        <label class="f"><span>Ora del giorno (sole) <b id="rHv">15</b>:00</span><input type="range" id="rH" min="7" max="19" value="15"></label><label class="chk"><input type="checkbox" id="rS" checked> Ombre portate</label><label class="chk"><input type="checkbox" id="rE" checked> Spigoli</label>
        <label class="f"><span>Sfondo</span><select id="rB"><option value="#eef2f7">Cielo chiaro</option><option value="#f6efe4">Tramonto</option><option value="#ffffff">Bianco</option></select></label>
        <div class="sec-t">Esporta</div><button class="btn primary" id="rPng">PNG alta risoluzione (2400 px)</button><button class="btn" id="rJpg">JPG per presentazioni</button><p class="tiny faint">Render generato dal modello 3D del disegno (muri, aperture, solidi) con il renderer interno; fotorealismo e varianti di interni sono previsti con il servizio AI su GPU.</p></div></aside>
        <div class="page" style="display:flex;align-items:center;justify-content:center"><canvas id="rCv" style="width:100%;max-width:1200px;border-radius:12px;box-shadow:var(--sh)"></canvas></div>`;
      const make = (w, h) => { const v = $('#rV').value, hr = +$('#rH').value; const az = (hr - 6) / 12 * Math.PI + Math.PI; const el = Math.sin((hr - 6) / 12 * Math.PI) * .9 + .1; const sun = [Math.cos(az) * .7, Math.sin(az) * .7, el];
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const mesh = App.cad3d.buildMesh(p.drawing); const R = App.cad3d.renderer(cv, () => mesh, { dpr: 1, axes: false, bg: $('#rB').value, sky: $('#rB').value === '#f6efe4' ? '#ffd9b0' : '#ffffff' }); R.fit();
        if (v === 'interno') { const room = p.drawing.entities.find(e => e.type === 'room' && /Soggiorno/.test(e.rtype || e.name)) || p.drawing.entities.find(e => e.type === 'room'); if (room) { const c = G.centroid(room.pts); R.target = [c[0], c[1], 1.5]; R.dist = 2.2; R.pitch = .05; R.yaw = -Math.PI / 2; R.persp = true; R.fov = 75 * Math.PI / 180; R.zCut = 2.69; } else R.preset('persp'); } else R.preset(v);
        R.sun = sun; R.shadows = $('#rS').checked; R.edges = $('#rE').checked; R.draw(); App.cad.use(p); return cv; };
      const show = () => { $('#rHv').textContent = $('#rH').value; const c = make(1600, 1000); const t = $('#rCv'); t.width = c.width; t.height = c.height; t.getContext('2d').drawImage(c, 0, 0); };
      ['rV', 'rH', 'rS', 'rE', 'rB'].forEach(id => $('#' + id).addEventListener('input', show)); show();
      $('#rPng').onclick = () => make(2400, 1500).toBlob(b => App.download(App.slug(p.name) + '_render.png', b));
      $('#rJpg').onclick = () => make(1920, 1080).toBlob(b => App.download(App.slug(p.name) + '_render.jpg', b), 'image/jpeg', .9);
    },
    share(body) {
      const p = App.project();
      const list = () => App.state.shares.filter(s => s.project === p.id);
      body.innerHTML = `<div class="page"><div class="card" style="max-width:900px"><div class="row between"><h4 style="margin:0">Link di presentazione per il cliente</h4><button class="btn primary" id="shNew">${App.icon('share', 15)} Nuovo link</button></div><p class="small muted">Il link apre una vista in sola lettura (tavola e render) senza licenza. In modalità offline il link funziona su questo dispositivo/browser; con il server della piattaforma è condivisibile all'esterno.</p><div id="shL"></div></div></div>`;
      const render = () => { $('#shL').innerHTML = list().length ? `<table class="tbl"><thead><tr><th>Etichetta</th><th>Link</th><th>Scadenza</th><th>Stato</th><th>Aperture</th><th></th></tr></thead><tbody>${list().map(s => { const exp = new Date(s.expires) < new Date(); const st = s.revoked ? '<span class="pill err">revocato</span>' : exp ? '<span class="pill warn">scaduto</span>' : '<span class="pill ok">attivo</span>'; return `<tr><td>${App.esc(s.label)}</td><td class="mono tiny">#/view/${s.id}</td><td class="tiny">${new Date(s.expires).toLocaleDateString('it-IT')}</td><td>${st}</td><td class="num">${s.views || 0}</td><td><button class="btn sm ghost" data-o="${s.id}">Apri</button><button class="btn sm ghost" data-c="${s.id}">Copia</button>${s.revoked ? '' : `<button class="btn sm ghost danger" data-r="${s.id}">Revoca</button>`}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty small">Nessun link creato</div>';
        $$('[data-o]').forEach(b => b.onclick = () => window.open(location.href.split('#')[0] + '#/view/' + b.dataset.o, '_blank'));
        $$('[data-c]').forEach(b => b.onclick = () => { const u = location.href.split('#')[0] + '#/view/' + b.dataset.c; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => App.toast('Link copiato'), () => App.toast(u)); });
        $$('[data-r]').forEach(b => b.onclick = () => { const s = App.state.shares.find(x => x.id === b.dataset.r); s.revoked = true; App.audit('share-revoke', s.label); App.save(); render(); }); };
      $('#shNew').onclick = async () => { const r = await App.form('Nuovo link di condivisione', [{ name: 'label', label: 'Etichetta', value: 'Presentazione al committente' }, { name: 'days', label: 'Validità (giorni)', type: 'number', value: 14 }], 'Crea link'); if (!r) return; App.state.shares.push({ id: App.uid() + App.uid(), project: p.id, label: r.label, expires: new Date(Date.now() + Math.max(1, r.days || 14) * 864e5).toISOString(), created: App.now(), by: App.user.id, revoked: false, views: 0 }); App.audit('share-create', r.label); App.save(); render(); };
      render();
    },
    proposta(body) {
      const p = App.project(); const pr = p.proposal = p.proposal || { items: [{ fase: 'Rilievo e stato di fatto', ore: 16, tariffa: 60, start: 0, dur: 2 }, { fase: 'Progetto preliminare', ore: 40, tariffa: 65, start: 2, dur: 3 }, { fase: 'Pratica edilizia', ore: 24, tariffa: 65, start: 5, dur: 2 }, { fase: 'Progetto esecutivo', ore: 60, tariffa: 70, start: 7, dur: 4 }, { fase: 'Direzione lavori', ore: 80, tariffa: 70, start: 11, dur: 16 }], iva: 22, cassa: 4, note: 'Onorario a corpo; spese incluse.' };
      const render = () => { const imp = pr.items.reduce((a, i) => a + i.ore * i.tariffa, 0), cassa = imp * pr.cassa / 100, iva = (imp + cassa) * pr.iva / 100, weeks = Math.max(...pr.items.map(i => i.start + i.dur), 1);
        body.innerHTML = `<div class="page"><div class="card" style="max-width:1100px"><div class="row between"><h4 style="margin:0">Proposta di onorario – ${App.esc(p.name)}</h4><div class="row"><button class="btn sm" id="ppAdd">+ Fase</button><button class="btn sm primary" id="ppDoc">Esporta DOCX</button></div></div>
          <table class="tbl" style="margin-top:10px"><thead><tr><th>Fase</th><th class="num">Ore</th><th class="num">€/h</th><th class="num">Importo</th><th class="num">Inizio (sett.)</th><th class="num">Durata</th><th style="width:40%">Cronoprogramma</th><th></th></tr></thead><tbody>${pr.items.map((i, k) => `<tr><td><input data-k="${k}" data-f="fase" value="${App.esc(i.fase)}"></td><td><input type="number" data-k="${k}" data-f="ore" value="${i.ore}" style="width:70px"></td><td><input type="number" data-k="${k}" data-f="tariffa" value="${i.tariffa}" style="width:70px"></td><td class="num">${App.fnum(i.ore * i.tariffa)} €</td><td><input type="number" data-k="${k}" data-f="start" value="${i.start}" style="width:60px"></td><td><input type="number" data-k="${k}" data-f="dur" value="${i.dur}" style="width:60px"></td><td><div style="position:relative;height:16px;background:var(--bg2);border-radius:4px"><div style="position:absolute;left:${i.start / weeks * 100}%;width:${i.dur / weeks * 100}%;top:0;bottom:0;background:var(--sky);border-radius:4px"></div></div></td><td><button class="btn sm ghost" data-del="${k}">✕</button></td></tr>`).join('')}</tbody></table>
          <div class="row" style="justify-content:flex-end;gap:24px;margin-top:12px"><span>Imponibile <b>${App.fnum(imp)} €</b></span><span>Cassa ${pr.cassa}% <b>${App.fnum(cassa)} €</b></span><span>IVA ${pr.iva}% <b>${App.fnum(iva)} €</b></span><span style="font-size:16px">Totale <b>${App.fnum(imp + cassa + iva)} €</b></span></div>
          <label class="f" style="margin-top:10px"><span>Note</span><textarea id="ppN">${App.esc(pr.note)}</textarea></label><div class="tiny faint">Durata complessiva: ${weeks} settimane.</div></div></div>`;
        $$('[data-f]').forEach(i => i.onchange = () => { const it = pr.items[+i.dataset.k]; it[i.dataset.f] = i.type === 'number' ? +i.value : i.value; App.touch(); render(); });
        $$('[data-del]').forEach(b => b.onclick = () => { pr.items.splice(+b.dataset.del, 1); App.touch(); render(); });
        $('#ppAdd').onclick = () => { pr.items.push({ fase: 'Nuova fase', ore: 8, tariffa: 60, start: weeks, dur: 1 }); App.touch(); render(); };
        $('#ppN').onchange = e => { pr.note = e.target.value; App.touch(); };
        $('#ppDoc').onclick = () => App.download('Proposta_' + App.slug(p.name) + '.docx', App.docx.make([{ t: 'h1', text: 'Proposta di onorario' }, { t: 'p', text: `Progetto: ${p.name}${p.comune ? ' – Comune di ' + p.comune : ''}` }, { t: 'p', text: `Committente: ${p.client || '—'}` }, { t: 'table', rows: [['Fase', 'Ore', '€/h', 'Importo €', 'Settimane'], ...pr.items.map(i => [i.fase, i.ore, i.tariffa, App.fnum(i.ore * i.tariffa), `${i.start + 1}–${i.start + i.dur}`])] }, { t: 'table', rows: [['Voce', 'Importo €'], ['Imponibile', App.fnum(imp)], [`Cassa previdenziale ${pr.cassa}%`, App.fnum(cassa)], [`IVA ${pr.iva}%`, App.fnum(iva)], ['Totale', App.fnum(imp + cassa + iva)]] }, { t: 'p', text: pr.note }, { t: 'p', text: `${App.state.org.name} – ${App.user.name} – ${new Date().toLocaleDateString('it-IT')}` }])); };
      render();
    }
  };
  App.register('present', Mod);
  /* vista pubblica del link */
  App.register('view', {
    auth: false,
    mount(view, args) {
      const s = App.state.shares.find(x => x.id === args[0]); document.body.classList.add('in-module');
      if (!s || s.revoked || new Date(s.expires) < new Date()) { view.innerHTML = `<div class="empty"><h2>Link non valido</h2><p>${!s ? 'Il link non esiste.' : s.revoked ? 'Il link è stato revocato.' : 'Il link è scaduto.'}</p></div>`; return; }
      const p = App.state.projects.find(x => x.id === s.project); if (!p) { view.innerHTML = '<div class="empty">Progetto non disponibile</div>'; return; }
      s.views = (s.views || 0) + 1; App.save();
      const o = Object.assign({ fmt: 'A3', scale: PR.autoScale(p), title: 'Pianta', subtitle: '', num: 'A.01', materials: true, shadows: true, furniture: true, dims: true, labels: true, render: false }, p.sheetOpts || {}, { render: false });
      const r1 = App.cad3d.renderImage(p.drawing, 1400, 850, 'persp'); App.cad.use(p);
      view.innerHTML = `<div class="page" style="max-width:1300px;margin:0 auto"><div class="eyebrow">Presentazione condivisa · sola visualizzazione</div><h1 style="font-weight:400;margin:6px 0">${App.esc(p.name)}</h1><p class="muted">${App.esc(s.label)} · valido fino al ${new Date(s.expires).toLocaleDateString('it-IT')}</p><div class="card" id="v1" style="padding:8px"></div><div class="card" style="overflow:auto;text-align:center">${PR.sheetSVG(p, o).replace(/width="\d+mm" height="\d+mm"/, 'width="100%"')}</div></div>`;
      r1.style.width = '100%'; r1.style.borderRadius = '10px'; $('#v1').appendChild(r1);
    }
  });
})();
