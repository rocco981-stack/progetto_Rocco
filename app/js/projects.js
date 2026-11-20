/* BeCity – Gestione progetti: cronologia modifiche, import/export progetto, elenco progetti */
'use strict';
(function () {
  const C = App.collab = {};
  /** registra le modifiche al disegno (cronologia attribuita, usata da undo/audit) */
  C.record = (p, label, changes) => {
    if (!p || !changes || !changes.length) return;
    p.history = p.history || [];
    p.history.push({ id: App.uid(), at: App.now(), author: App.user ? App.user.id : null, label, n: changes.length });
    if (p.history.length > 500) p.history.splice(0, p.history.length - 500);
    App.touch(p);
  };
  C.applyRemote = () => { };
  C.exportProject = (p = App.project()) => { const o = App.clone(p); delete o.members; App.download(App.slug(p.name) + '.becity.json', JSON.stringify({ format: 'becity-project', version: 1, project: o }), 'application/json'); };
  C.importProject = async () => {
    const [f] = await App.pickFiles({ accept: '.json' }); if (!f) return;
    try { const j = JSON.parse(await App.readText(f)); const src = j.project || j; if (!src.drawing) throw new Error('formato non riconosciuto');
      const p = App.newProject(Object.assign({}, src, { id: App.uid(), name: src.name + ' (importato)', guest: App.isGuest(), members: App.isGuest() ? [] : [{ user: App.user.id, role: 'owner' }], created: App.now() }));
      App.setProject(p.id); App.toast('Progetto importato', 'ok'); App.route();
    } catch (e) { App.toast('File non valido: ' + e.message, 'err'); }
  };

  /* ---------- pagina Progetti (navigazione) ---------- */
  const thumb = p => { const ents = p.drawing.entities; const pts = []; App.cad.use(p); ents.forEach(e => { const b = App.cad.bboxOf(e); if (b) pts.push([b[0], b[1]], [b[2], b[3]]); }); App.cad.use(App.project() || p);
    if (!pts.length) return `<span class="faint">${App.icon('cube', 34)}</span>`; const bb = App.geom.bbox(pts); const s = Math.min(240 / (bb[2] - bb[0] || 1), 100 / (bb[3] - bb[1] || 1)) * .9;
    App.cad.use(p); const lines = ents.flatMap(e => App.cad.segsOf(e)).slice(0, 1500).map(sg => `<line x1="${((sg[0][0] - bb[0]) * s).toFixed(1)}" y1="${(100 - (sg[0][1] - bb[1]) * s).toFixed(1)}" x2="${((sg[1][0] - bb[0]) * s).toFixed(1)}" y2="${(100 - (sg[1][1] - bb[1]) * s).toFixed(1)}"/>`).join(''); App.cad.use(App.project() || p);
    return `<svg viewBox="-5 -5 250 110" width="100%" height="110"><g stroke="#3a4356" stroke-width=".8">${lines}</g></svg>`; };
  App.register('projects', {
    guest: false,
    mount(view) {
      const body = App.modShell(view, { id: 'projects', title: App.t('nav.projects'), sub: 'Progetti, cartelle e modelli' });
      const render = () => { const q = ($('#pQ') && $('#pQ').value || '').toLowerCase(); const fo = $('#pF') ? $('#pF').value : '';
        const list = App.visibleProjects().filter(p => (!q || (p.name + p.comune + p.client).toLowerCase().includes(q)) && (!fo || p.folder === fo));
        $('#pGrid').innerHTML = list.map(p => `<div class="proj-card" data-p="${p.id}"><div class="thumb">${thumb(p)}</div><b>${App.esc(p.name)}</b><div class="tiny muted">${App.esc([p.comune, p.regione].filter(Boolean).join(', ') || 'Comune n.d.')} · ${App.esc(p.phase)}</div><div class="row"><span class="pill">${App.esc(p.folder || 'Senza cartella')}</span><span class="grow"></span><span class="tiny faint">${App.fdate(p.updated)}</span></div></div>`).join('') || '<div class="empty">Nessun progetto</div>';
        $$('[data-p]').forEach(c => { c.onclick = () => { App.setProject(c.dataset.p); location.hash = '#/cad'; }; c.oncontextmenu = e => { e.preventDefault(); const p = App.state.projects.find(x => x.id === c.dataset.p);
          App.ctxMenu(e.clientX, e.clientY, [{ label: 'Apri nel CAD', action: () => c.onclick() }, { label: 'Proprietà…', action: () => edit(p) }, { label: 'Duplica', action: () => { const n = App.clone(p); n.id = App.uid(); n.name += ' (copia)'; n.created = n.updated = App.now(); App.state.projects.push(n); App.save(); render(); } }, { label: 'Salva come modello', action: () => { App.state.templates.push({ id: App.uid(), name: p.name, drawing: App.clone(p.drawing) }); App.save(); App.toast('Modello salvato', 'ok'); } }, { label: 'Esporta (.becity.json)', action: () => C.exportProject(p) }, '-', { label: App.icon('trash', 14) + ' Elimina', disabled: !App.can('admin', p), action: async () => { if (await App.confirm('Elimina progetto', `Eliminare definitivamente “${App.esc(p.name)}”?`)) { App.state.projects = App.state.projects.filter(x => x !== p); if (App.state.currentProject === p.id) App.state.currentProject = null; App.save(); render(); } } }]); }; });
      };
      const edit = async (p) => { const r = await App.form(p ? 'Proprietà progetto' : 'Nuovo progetto', [{ name: 'name', label: 'Nome', value: p ? p.name : 'Nuovo progetto' }, { name: 'phase', label: 'Fase', type: 'select', options: ['Studio di fattibilità', 'Progetto preliminare', 'Progetto definitivo', 'Progetto esecutivo', 'Direzione lavori', 'Collaudo'], value: p && p.phase }, { name: 'comune', label: 'Comune', value: p ? p.comune : '' }, { name: 'regione', label: 'Regione', value: p ? p.regione : '' }, { name: 'client', label: 'Committente', value: p ? p.client : '' }, { name: 'folder', label: 'Cartella', type: 'select', options: ['', ...App.state.folders], value: p && p.folder }, { name: 'crs', label: 'CRS', type: 'select', options: App.crs.list().map(c => ({ value: c.code, label: c.code + ' – ' + c.name })), value: p ? p.crs : 'EPSG:7792' }, ...(p ? [] : [{ name: 'tpl', label: 'Modello di progetto', type: 'select', options: [{ value: '', label: 'Vuoto' }, ...App.state.templates.map(t => ({ value: t.id, label: t.name }))] }])], p ? App.t('save') : 'Crea');
        if (!r) return; if (p) { Object.assign(p, r); App.touch(p); } else { const n = App.newProject(r); const t = App.state.templates.find(x => x.id === r.tpl); if (t) n.drawing = App.clone(t.drawing); App.setProject(n.id); } render(); };
      body.innerHTML = `<div class="page"><div class="row wrap" style="margin-bottom:14px"><input type="search" id="pQ" placeholder="Cerca progetti…" style="max-width:320px"><select id="pF" style="width:auto"><option value="">Tutte le cartelle</option>${App.state.folders.map(f => `<option>${App.esc(f)}</option>`).join('')}</select><span class="grow"></span><button class="btn" id="pImp">${App.icon('upload', 15)} Importa</button><button class="btn" id="pFold">${App.icon('folder', 15)} Nuova cartella</button><button class="btn primary" id="pNew">${App.icon('plus', 15)} Nuovo progetto</button></div><div class="proj-grid" id="pGrid"></div></div>`;
      $('#pQ').oninput = render; $('#pF').onchange = render; $('#pNew').onclick = () => edit(null); $('#pImp').onclick = C.importProject;
      $('#pFold').onclick = async () => { const r = await App.form('Nuova cartella', [{ name: 'n', label: 'Nome' }]); if (r && r.n) { App.state.folders.push(r.n); App.save(); App.route(); } };
      render();
    }
  });

})();
