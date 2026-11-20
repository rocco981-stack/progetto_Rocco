/* BeCity – Home: hero, applicazioni con illustrazioni tecniche, progetti recenti, dati dimostrativi */
'use strict';
(function () {
  /* ---------- illustrazioni al tratto delle card (SVG generati, animabili) ---------- */
  const iso = (x, y, z, s = 9, ox = 80, oy = 62) => [ox + (x - y) * .866 * s, oy + (x + y) * .5 * s - z * s];
  const P = pts => 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(' ')).join('L');
  const ART = {
    cad() { // reticolo isometrico + edificio in fil di ferro + pianta quotata
      const o = [];
      for (let i = 0; i <= 6; i++) { o.push(P([iso(i, 0, 0), iso(i, 6, 0)]), P([iso(0, i, 0), iso(6, i, 0)])); }
      const box = (x0, y0, x1, y1, z) => { const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]; o.push(P(c.map(q => iso(q[0], q[1], z)))); c.slice(0, 4).forEach(q => o.push(P([iso(q[0], q[1], 0), iso(q[0], q[1], z)]))); for (let k = 1; k < 4; k++) o.push(P(c.map(q => iso(q[0], q[1], z * k / 4)))); };
      box(1, 1, 5, 4, 4.4); box(1, 4, 3, 5.5, 2.4);
      o.push('M10 104h44M10 101v6M54 101v6M30 92h24v-12h-24z', 'M120 78v34M117 81l3-4 3 4M117 109l3 4 3-4');
      return o.join('');
    },
    gis() { // superficie ondulata + isoipse
      const o = [];
      for (let k = 0; k < 16; k++) { let d = ''; for (let x = 0; x <= 160; x += 4) { const y = 22 + k * 3.2 + Math.sin(x / 22 + k * .35) * (6 + k * .5) + Math.cos(x / 9 + k) * 1.2; d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(1); } o.push(d); }
      for (let r = 1; r <= 5; r++) { let d = ''; for (let a = 0; a <= 64; a++) { const t = a / 64 * Math.PI * 2; const rr = r * 7 * (1 + .18 * Math.sin(3 * t + r)); d += (a ? 'L' : 'M') + (52 + rr * 1.5 * Math.cos(t)).toFixed(1) + ' ' + (96 + rr * .6 * Math.sin(t)).toFixed(1); } o.push(d + 'Z'); }
      return o.join('');
    },
    bim() { // telaio strutturale a tre impalcati
      const o = [], X = [0, 2, 4, 6], Y = [0, 2.5, 5], Z = [0, 2.6, 5.2, 7.8];
      X.forEach(x => Y.forEach(y => o.push(P([iso(x, y, 0, 7.5, 80, 70), iso(x, y, 7.8, 7.5, 80, 70)]))));
      Z.forEach(z => { X.forEach(x => o.push(P([iso(x, 0, z, 7.5, 80, 70), iso(x, 5, z, 7.5, 80, 70)]))); Y.forEach(y => o.push(P([iso(0, y, z, 7.5, 80, 70), iso(6, y, z, 7.5, 80, 70)]))); });
      for (let x = 0; x < 6; x += 2) o.push(P([iso(x, 0, 0, 7.5, 80, 70), iso(x + 2, 0, 2.6, 7.5, 80, 70)]), P([iso(x, 0, 2.6, 7.5, 80, 70), iso(x + 2, 0, 0, 7.5, 80, 70)]));
      return o.join('');
    },
    present() { // tavola con prospetto e cartiglio
      const o = ['M30 6h112v108H30z', 'M36 12h100v96H36z', 'M96 88h40v20H96zM96 95h40M116 88v20'];
      o.push('M46 80h44M50 80V36h36v44M50 48h36M50 60h36M50 70h36');
      for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) o.push(`M${54 + c * 8} ${39 + r * 12}h5v6h-5z`);
      o.push('M66 80v-8h6v8', 'M100 22h30M100 28h22M100 34h26', 'M104 50a10 10 0 1 0 20 0a10 10 0 1 0-20 0M114 40v20M104 50h20');
      return o.join('');
    },
    acc() { // registro contabile, istogramma SAL e curva di spesa
      const o = ['M28 10h92v86H28z', 'M28 22h92M52 10v86M100 10v86'];
      for (let y = 32; y < 92; y += 10) o.push(`M30 ${y}h88`);
      [[112, 84, 14], [124, 70, 28], [136, 58, 40], [148, 44, 54]].forEach(([x, y, h]) => o.push(`M${x} 112V${y}h8v${h + (112 - y - h)}`));
      o.push('M108 106C122 100 132 80 158 40', 'M150 40h8v8', 'M62 104a7 7 0 1 0 0.01 0M58 101h6M58 105h6');
      return o.join('');
    },
    norm() { // fascicolo di documenti con verifica
      const o = [];
      [[52, 18, -8], [62, 12, -4], [72, 8, 0]].forEach(([x, y, r]) => { o.push(`<g transform="rotate(${r} ${x + 30} ${y + 45})"><path d="M${x} ${y}h48l12 12v74H${x}zM${x + 48} ${y}v12h12"/>${[22, 30, 38, 46, 54, 62, 70].map(dy => `<path d="M${x + 8} ${y + dy}h${dy % 16 ? 34 : 26}"/>`).join('')}</g>`); });
      o.push('M118 96a10 10 0 1 0 20 0a10 10 0 1 0-20 0', 'M123 96l4 4 7-8', 'M80 30l3 3 6-6M80 46l3 3 6-6M80 62l3 3 6-6');
      return o.map(s => s.startsWith('<g') ? s : `<path d="${s}"/>`).join('');
    }
  };
  const art = id => { const raw = ART[id] ? ART[id]() : ''; const body = raw.startsWith('<') ? raw : raw.split(/(?=M)/).map(d => `<path d="${d}"/>`).join(''); return `<svg class="art art-${id}" viewBox="0 0 160 120" aria-hidden="true">${body}</svg>`; };
  App.homeArt = art;

  /* ---------- apri progetto ---------- */
  App.openProjectDialog = async () => {
    const list = App.visibleProjects().slice().sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
    const rows = list.map(p => `<div class="op-row${App.state.currentProject === p.id ? ' cur' : ''}"><div class="op-ico">${App.icon('building', 20)}</div><div class="grow"><b>${App.esc(p.name)}</b><div class="tiny muted">${App.esc([p.comune, p.phase].filter(Boolean).join(' · '))} · aggiornato ${App.fdate(p.updated)}</div></div>
      <div class="op-apps">${App.MODS.map(m => `<button class="op-app" data-op="${p.id}" data-m="${m.id}" title="Apri in ${App.esc(App.t('m.' + m.id))}">${App.appIcon(m.id, 30)}</button>`).join('')}</div></div>`).join('') || '<div class="muted">Nessun progetto</div>';
    const r = await App.modal({ title: 'Apri progetto', size: 'wide', body: `<div class="op-list">${rows}</div>`,
      actions: [{ label: App.t('close'), value: null }, { label: 'Importa file progetto…', value: 'imp' }, { label: 'Tutti i progetti', primary: true, value: 'all' }],
      onOpen: (back, close) => $$('[data-op]', back).forEach(b => b.onclick = () => close({ p: b.dataset.op, m: b.dataset.m })) });
    if (!r) return;
    if (r === 'imp') return App.collab.importProject();
    if (r === 'all') { location.hash = '#/projects'; return; }
    App.setProject(r.p); location.hash = '#/' + r.m;
  };
  App.newProjectDialog = () => { location.hash = '#/projects'; setTimeout(() => { const b = $('#pNew'); if (b) b.click(); }, 80); };

  /* ---------- effetti dinamici ---------- */
  const countUp = el => { const to = +el.dataset.n, suf = el.dataset.suf || '', t0 = performance.now(), d = 1100; const step = t => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e).toLocaleString('it-IT') + suf; if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  App.reveal = root => {
    const els = $$('[data-reveal]', root);
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); $$('[data-n]', en.target).forEach(countUp); io.unobserve(en.target); } }), { threshold: .12 });
    els.forEach(e => io.observe(e));
  };

  const Home = {
    auth: false,
    mount(view) {
      const vp = App.visibleProjects().slice().sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
      const nEnt = App.state.projects.reduce((a, p) => a + p.drawing.entities.length + ((p.bim && p.bim.elements.length) || 0), 0);
      view.innerHTML = `<div class="home">
        <section class="hero" id="hero"><div class="hero-img" aria-hidden="true"><i></i></div><div class="hero-inner">
          <div class="eyebrow h-anim" style="--d:0">${App.t('heroEyebrow')}</div>
          <h1 class="h-anim" style="--d:1">${App.t('heroTitle')}</h1>
          <p class="lead h-anim" style="--d:2">${App.t('heroLead')}</p>
          <div class="cta h-anim" style="--d:3"><button class="btn btn-lg blue" id="hOpen">${App.icon('folder', 18)} Apri progetto</button><button class="btn btn-lg btn-outline-w" id="hNew">${App.icon('plus', 18)} ${App.t('newProject')}</button></div>
          <div class="hero-stats h-anim" style="--d:4" data-reveal><div><b data-n="${App.MODS.length}">0</b><span>applicazioni integrate</span></div><div><b data-n="${App.state.projects.length}">0</b><span>progetti</span></div><div><b data-n="${nEnt}">0</b><span>elementi modellati</span></div><div><b data-n="20" data-suf="+">0</b><span>formati di scambio</span></div></div>
        </div></section>
        <section class="section apps-sec"><div data-reveal class="rv apps-head"><div class="eyebrow">BeCity</div><h2>${App.t('appsTitle')}</h2><p class="sub">${App.t('appsSub')}</p></div>
          <div class="apps">${App.MODS.map((m, i) => `<button class="app-tile rv" data-reveal style="--i:${i}" data-go="${m.id}">
              <div class="tile-img"><img src="img/apps/${m.id}.jpg" alt="" loading="lazy" decoding="async"></div>
              <div class="tile-main"><div class="k">${App.t('m.' + m.id + '.k')}</div><h3>${App.t('m.' + m.id)}</h3>
              <p>${App.t('m.' + m.id + '.d')}</p>
              <div class="tile-foot"><div class="ref-row">${m.refs.map(r => `<span>${App.esc(r)}</span>`).join('')}</div><span class="go">${App.t('open')} ${App.icon('arrow', 16)}</span></div></div></button>`).join('')}</div></section>
        <section class="strip"><div class="section"><div class="row between rv" data-reveal><div><div class="eyebrow">${App.t('nav.projects')}</div><h2>${App.t('recent')}</h2></div><div class="row"><button class="btn" id="hOpen2">${App.icon('folder', 16)} Apri progetto</button><a class="btn" href="#/projects">Tutti i progetti</a></div></div>
          <div class="proj-list" style="margin-top:22px">${vp.slice(0, 6).map((p, i) => `<div class="proj-item rv" data-reveal style="--i:${i}" data-p="${p.id}"><div class="pi-ico">${App.icon('building', 22)}</div><div class="grow"><b>${App.esc(p.name)}</b><div class="small muted">${App.esc([p.comune, p.phase].filter(Boolean).join(' · '))}</div><div class="tiny faint">Aggiornato ${App.fdate(p.updated)}</div></div>${App.state.currentProject === p.id ? '<span class="pill blue">attivo</span>' : ''}</div>`).join('') || '<div class="muted">Nessun progetto</div>'}</div></div></section>
        <section class="section"><div class="features">
          ${[['layers', 'f1'], ['doc', 'f2'], ['shield', 'f3'], ['globe', 'f4']].map(([ic, k], i) => `<div class="feat rv" data-reveal style="--i:${i}"><div class="fi">${App.icon(ic, 24)}</div><b>${App.t(k)}</b><span>${App.t(k + 's')}</span></div>`).join('')}</div></section>
        <footer class="home-foot"><span>© 2026 BeCity · v${App.version} · ${App.t('rights')}</span><span><a href="#/support/privacy">${App.t('privacy')}</a><a href="#/support/termini">${App.t('terms')}</a><a href="#/support/accessibilita">${App.t('a11y')}</a><a href="#/support">Supporto</a></span></footer>
      </div>`;
      $$('[data-go]', view).forEach(b => b.onclick = () => { location.hash = '#/' + b.dataset.go; });
      $$('[data-p]', view).forEach(e => e.onclick = () => { App.setProject(e.dataset.p); location.hash = '#/cad'; });
      $('#hOpen', view).onclick = App.openProjectDialog; $('#hOpen2', view).onclick = App.openProjectDialog;
      $('#hNew', view).onclick = App.newProjectDialog;
      // parallasse dell'immagine e luce che segue il puntatore
      const hero = $('#hero', view), img = $('.hero-img', hero);
      hero.addEventListener('pointermove', e => { const r = hero.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; img.style.setProperty('--px', (x * -18).toFixed(1) + 'px'); img.style.setProperty('--py', (y * -12).toFixed(1) + 'px'); hero.style.setProperty('--mx', (e.clientX - r.left) + 'px'); hero.style.setProperty('--my', (e.clientY - r.top) + 'px'); });
      // inclinazione 3D delle card
      $$('.app-tile', view).forEach(t => { t.addEventListener('pointermove', e => { const r = t.getBoundingClientRect(); t.style.setProperty('--rx', (((e.clientY - r.top) / r.height - .5) * -5).toFixed(2) + 'deg'); t.style.setProperty('--ry', (((e.clientX - r.left) / r.width - .5) * 6).toFixed(2) + 'deg'); }); t.addEventListener('pointerleave', () => { t.style.removeProperty('--rx'); t.style.removeProperty('--ry'); }); });
      App.reveal(view);
    }
  };
  App.register('home', Home);
  App.home = Home;

  /* ---------- dati dimostrativi ---------- */
  App.seedDemo = () => {
    const p = App.newProject({ name: 'Residenza Via dei Mille', phase: 'Progetto preliminare', comune: 'Bari', regione: 'Puglia', crs: 'EPSG:7792', folder: 'Residenziale', client: 'Committente Demo', address: 'Via dei Mille (indirizzo dimostrativo)', origin: { lon: 16.8655, lat: 41.1093 },
      members: [{ user: 'u1', role: 'owner' }, { user: 'u6', role: 'editor' }, { user: 'u2', role: 'gis' }, { user: 'u3', role: 'reviewer' }, { user: 'u4', role: 'consultant', expires: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) }, { user: 'u5', role: 'viewer' }] });
    try {
      const plan = App.gen.generate({ w: 12.4, d: 9.6, bedrooms: 2, baths: 1, seed: 3, style: 'giorno-notte' });
      p.drawing.entities = plan.entities.map(e => Object.assign(e, { ai: false }));
      p.drawing.entities.push({ id: App.uid(), type: 'pline', layer: 'LOTTO', pts: [[-6, -7], [22, -7], [22, 17], [-6, 17]], closed: true });
      p.drawing.entities.push({ id: App.uid(), type: 'text', layer: 'TESTI', x: -5.5, y: 17.6, h: 0.6, text: 'Lotto – Foglio 12, Particella 345 (dati dimostrativi)', rot: 0 });
    } catch (e) { console.warn('seed plan', e); }
    // layer GIS dimostrativi attorno all'origine del progetto
    const o = p.origin, mlat = 111320, mlon = 111320 * Math.cos(o.lat * Math.PI / 180);
    const ll = (dx, dy) => [+(o.lon + dx / mlon).toFixed(7), +(o.lat + dy / mlat).toFixed(7)];
    const poly = pts => ({ type: 'Polygon', coordinates: [[...pts.map(q => ll(q[0], q[1])), ll(pts[0][0], pts[0][1])]] });
    const parts = []; let n = 340;
    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) { const x0 = i * 30 - 6, y0 = j * 26 - 7; parts.push({ id: App.uid(), geometry: poly([[x0, y0], [x0 + 28, y0], [x0 + 28, y0 + 24], [x0, y0 + 24]]), properties: { foglio: 12, particella: n++, qualita: j === 1 ? 'Seminativo' : 'Ente urbano', superficie: 672 } }); }
    p.gis.layers.push(
      { id: App.uid(), name: 'Particelle catastali (demo)', type: 'vector', geomType: 'Polygon', visible: true, opacity: 1, features: parts, style: { mode: 'single', color: '#8a6d3b', fill: '#f5ecd9', fillOpacity: .25, width: 1, label: 'particella' }, license: 'Dati fittizi dimostrativi', attribution: 'Catasto demo', srcCrs: 'EPSG:4326', meta: { title: 'Particelle catastali dimostrative' } },
      { id: App.uid(), name: 'Vincolo paesaggistico art. 142 (demo)', type: 'vector', geomType: 'Polygon', visible: true, opacity: 1, vincolo: true, vincoloTipo: 'Paesaggistico – D.Lgs. 42/2004 art. 142', features: [{ id: App.uid(), geometry: poly([[14, -30], [80, -30], [80, 40], [30, 45], [14, 20]]), properties: { tipo: 'Fascia 150 m corso d\'acqua', norma: 'D.Lgs. 42/2004 art. 142 c.1 lett. c)', fonte_id: 'dlgs42-142' } }], style: { mode: 'single', color: '#1f9e85', fill: '#1f9e85', fillOpacity: .18, width: 1.5 }, license: 'Dati fittizi dimostrativi', attribution: 'Vincoli demo', srcCrs: 'EPSG:4326' },
      { id: App.uid(), name: 'Fascia rispetto stradale (demo)', type: 'vector', geomType: 'Polygon', visible: true, opacity: 1, vincolo: true, vincoloTipo: 'Fascia di rispetto stradale – D.P.R. 495/1992 art. 26', features: [{ id: App.uid(), geometry: poly([[-80, -40], [80, -40], [80, -18], [-80, -18]]), properties: { tipo: 'Strada tipo F – 20 m', norma: 'D.P.R. 495/1992 art. 26', fonte_id: 'cds-26' } }], style: { mode: 'single', color: '#df5179', fill: '#df5179', fillOpacity: .14, width: 1.2 }, license: 'Dati fittizi dimostrativi', srcCrs: 'EPSG:4326' },
      { id: App.uid(), name: 'Area PAI pericolosità media (demo)', type: 'vector', geomType: 'Polygon', visible: false, opacity: 1, vincolo: true, vincoloTipo: 'PAI – pericolosità idraulica', features: [{ id: App.uid(), geometry: poly([[60, 30], [120, 30], [120, 90], [60, 90]]), properties: { classe: 'MP', norma: 'PAI – NTA', fonte_id: 'pai' } }], style: { mode: 'single', color: '#3b8bd0', fill: '#3b8bd0', fillOpacity: .2, width: 1 }, license: 'Dati fittizi dimostrativi', srcCrs: 'EPSG:4326' },
      { id: App.uid(), name: 'Strade (demo)', type: 'vector', geomType: 'LineString', visible: true, opacity: 1, features: [{ id: App.uid(), geometry: { type: 'LineString', coordinates: [ll(-90, -29), ll(90, -29)] }, properties: { nome: 'Strada comunale demo', classe: 'F' } }, { id: App.uid(), geometry: { type: 'LineString', coordinates: [ll(-36, -29), ll(-36, 60)] }, properties: { nome: 'Via laterale demo', classe: 'F' } }], style: { mode: 'single', color: '#5d6879', width: 3 }, license: 'Dati fittizi dimostrativi', srcCrs: 'EPSG:4326' },
      { id: App.uid(), name: 'Pozzi e sorgenti (demo)', type: 'vector', geomType: 'Point', visible: true, opacity: 1, features: [[40, 10, 'P1', 35], [-50, 30, 'P2', 52], [70, -10, 'P3', 18]].map(([x, y, nm, q]) => ({ id: App.uid(), geometry: { type: 'Point', coordinates: ll(x, y) }, properties: { nome: nm, profondita_m: q } })), style: { mode: 'single', color: '#3d6fe0', width: 1 }, license: 'Dati fittizi dimostrativi', srcCrs: 'EPSG:4326' }
    );
    p.snapshots.push({ id: App.uid(), label: 'v0 – impianto iniziale', author: 'u1', at: App.now(), data: App.clone(p.drawing.entities) });
    p.history.push({ id: App.uid(), at: App.now(), author: 'u1', label: 'Creazione progetto dimostrativo', changes: [] });
    const p2 = App.newProject({ name: 'Variante PRG – Ambito Nord', phase: 'Studio di fattibilità', comune: 'Matera', regione: 'Basilicata', crs: 'EPSG:7792', folder: 'Pianificazione', origin: { lon: 16.6043, lat: 40.6664 }, members: [{ user: 'u1', role: 'owner' }, { user: 'u2', role: 'gis' }, { user: 'u3', role: 'reviewer' }] });
    p2.drawing.entities.push({ id: App.uid(), type: 'pline', layer: 'LOTTO', pts: [[0, 0], [60, 0], [70, 40], [10, 50]], closed: true }, { id: App.uid(), type: 'text', layer: 'TESTI', x: 5, y: 20, h: 2, text: 'Ambito di trasformazione', rot: 0 });
    App.state.currentProject = p.id;
    App.state.audit = []; App.audit('seed', 'Creati dati dimostrativi');
    App.saveNow();
  };
})();
