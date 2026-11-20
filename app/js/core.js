/* BeCity – core: stato, storage locale, i18n, router, UI comuni */
'use strict';
const App = window.App = { version: '3.2.0', modules: {}, routes: {}, state: null, user: null, bus: {}, undoMem: {} };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
App.$ = $; App.$$ = $$; App.esc = esc;
App.uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
App.now = () => new Date().toISOString();
App.fdate = iso => iso ? new Date(iso).toLocaleString(App.lang() === 'en' ? 'en-GB' : 'it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '';
App.fnum = (n, d = 2) => (isFinite(n) ? Number(n) : 0).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
App.clone = o => JSON.parse(JSON.stringify(o));
App.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
App.colors = ['#3d6fe0', '#1f9e85', '#7363d6', '#ee7a3f', '#df5179', '#3b8bd0', '#c58a12', '#5a7a2e'];
App.initials = n => String(n || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
App.avatar = (u, size) => `<span class="avatar" style="background:${u?.color || '#8a94a4'}${size ? `;width:${size}px;height:${size}px` : ''}" title="${esc(u?.name)}">${esc(App.initials(u?.name))}</span>`;

/* ---------------- event bus ---------------- */
App.on = (ev, fn) => { (App.bus[ev] = App.bus[ev] || []).push(fn); return () => App.bus[ev] = App.bus[ev].filter(f => f !== fn); };
App.emit = (ev, d) => (App.bus[ev] || []).slice().forEach(f => { try { f(d); } catch (e) { console.error(e); } });

/* ---------------- i18n ---------------- */
App.dict = {
  it: {
    'nav.apps': 'Applicazioni', 'nav.projects': 'Progetti', 'nav.resources': 'Risorse', 'nav.support': 'Supporto',
    heroEyebrow: 'BeCity · Architettura, città e territorio', heroTitle: 'Progetta la città. Dall\'edificio al territorio.', heroLead: 'CAD, BIM, GIS, presentazione e normativa in un unico ambiente tecnico che lavora sul tuo computer, anche senza connessione.',
    appsTitle: 'Applicazioni', appsSub: 'Sei strumenti professionali che condividono lo stesso progetto.', open: 'Apri', recent: 'Progetti recenti', newProject: 'Nuovo progetto',
    'm.cad': 'CAD', 'm.cad.k': 'Disegno tecnico 2D/3D', 'm.cad.d': 'Disegno di precisione con riga di comando, layer, blocchi, quote e retini. Apre e salva DWG e DXF.',
    'm.gis': 'GIS', 'm.gis.k': 'Territorio e mappatura', 'm.gis.d': 'Dati cartografici, raster e DTM, analisi spaziali, piani di volo, volumi e nuvole di punti.',
    'm.bim': 'BIM', 'm.bim.k': 'Modellazione dell\'edificio', 'm.bim.d': 'Modello 3D per elementi costruttivi: livelli, muri, solai, coperture, abachi e IFC.',
    'm.acc': 'Contabilità', 'm.acc.k': 'Computo e contabilità', 'm.acc.d': 'Computi metrici con i prezzari regionali, quadro economico, capitolato, cronoprogramma, direzione e contabilità dei lavori.',
    'm.present': 'Presentazione', 'm.present.k': 'Tavole e render', 'm.present.d': 'Tavole in scala con cartiglio, render del modello e materiali per il committente.',
    'm.norm': 'Normativa', 'm.norm.k': 'Norme e conformità', 'm.norm.d': 'Assistente normativo con fonti, titolo edilizio, analisi delle pratiche e verifica del progetto.',
    f1: 'Un solo progetto', f1s: 'Pianta, modello, mappa e tavole leggono gli stessi dati.', f2: 'Formati aperti', f2s: 'DWG, DXF, IFC, GeoPackage, GeoTIFF, Shapefile, PostGIS.', f3: 'Sul tuo computer', f3s: 'Avvio con BeCity.exe, nessun account, dati in locale.', f4: 'Scala urbana', f4s: 'Dalla stanza al quartiere, con i sistemi di riferimento italiani.',
    rights: 'Tutti i diritti riservati', privacy: 'Privacy', terms: 'Termini di utilizzo', a11y: 'Accessibilità',
    project: 'Progetto', save: 'Salva', cancel: 'Annulla', close: 'Chiudi', del: 'Elimina', add: 'Aggiungi', export: 'Esporta', import: 'Importa', ok: 'OK',
    layers: 'Layer', props: 'Proprietà', blocks: 'Blocchi', command: 'Comando', ready: 'Pronto', admin: 'Impostazioni', search: 'Cerca progetti, file, norme, comandi…'
  },
  en: {
    'nav.apps': 'Applications', 'nav.projects': 'Projects', 'nav.resources': 'Resources', 'nav.support': 'Support',
    heroEyebrow: 'BeCity · Architecture, city and territory', heroTitle: 'Design the city. From building to territory.', heroLead: 'CAD, BIM, GIS, presentation and building codes in one technical environment that runs on your computer, even offline.',
    appsTitle: 'Applications', appsSub: 'Six professional tools sharing the same project.', open: 'Open', recent: 'Recent projects', newProject: 'New project',
    'm.cad': 'CAD', 'm.cad.k': '2D/3D drafting', 'm.cad.d': 'Precision drafting with command line, layers, blocks, dimensions and hatches. Opens and saves DWG and DXF.',
    'm.gis': 'GIS', 'm.gis.k': 'Territory and mapping', 'm.gis.d': 'Map data, rasters and DTMs, spatial analysis, flight planning, volumes and point clouds.',
    'm.bim': 'BIM', 'm.bim.k': 'Building modelling', 'm.bim.d': 'Element-based 3D model: levels, walls, floors, roofs, schedules and IFC.',
    'm.acc': 'Cost & Accounting', 'm.acc.k': 'Bills of quantities', 'm.acc.d': 'Bills of quantities with regional price lists, cost plan, specifications, schedule, site supervision and works accounting.',
    'm.present': 'Presentation', 'm.present.k': 'Sheets and renders', 'm.present.d': 'Scaled sheets with title block, model renders and client material.',
    'm.norm': 'Codes', 'm.norm.k': 'Codes and compliance', 'm.norm.d': 'Code assistant with sources, permit type, document analysis and design checks.',
    f1: 'One project', f1s: 'Plan, model, map and sheets read the same data.', f2: 'Open formats', f2s: 'DWG, DXF, IFC, GeoPackage, GeoTIFF, Shapefile, PostGIS.', f3: 'On your computer', f3s: 'Start with BeCity.exe, no account, local data.', f4: 'Urban scale', f4s: 'From room to district, with Italian reference systems.',
    rights: 'All rights reserved', privacy: 'Privacy', terms: 'Terms of use', a11y: 'Accessibility',
    project: 'Project', save: 'Save', cancel: 'Cancel', close: 'Close', del: 'Delete', add: 'Add', export: 'Export', import: 'Import', ok: 'OK',
    layers: 'Layers', props: 'Properties', blocks: 'Blocks', command: 'Command', ready: 'Ready', admin: 'Settings', search: 'Search projects, files, codes, commands…'
  }
};
App.lang = () => (App.state && App.state.settings.lang) || 'it';
App.t = k => (App.dict[App.lang()] && App.dict[App.lang()][k]) || App.dict.it[k] || k;
App.applyI18n = (root = document) => { $$('[data-i18n]', root).forEach(e => e.textContent = App.t(e.dataset.i18n)); document.documentElement.lang = App.lang(); const l = $('#langLabel'); if (l) l.textContent = App.lang().toUpperCase(); };

/* ---------------- storage ---------------- */
const KEY = 'becity.data.v1', SKEY = 'becity.session';
App.load = () => {
  try { App.state = JSON.parse(localStorage.getItem(KEY)); } catch (e) { App.state = null; }
  if (!App.state || !App.state.version) { App.state = App.seed(); App.saveNow(); }
};
App.saveNow = () => {
  try { localStorage.setItem(KEY, JSON.stringify(App.state)); App.emit('saved'); }
  catch (e) { App.toast('Spazio di archiviazione locale esaurito: esporta e rimuovi dati pesanti (raster, mesh).', 'err'); }
};
App.save = App.debounce(App.saveNow, 350);
App.storageUsage = () => { let n = 0; for (const k in localStorage) if (localStorage.hasOwnProperty(k)) n += (localStorage[k].length + k.length) * 2; return n; };

App.seed = () => {
  const users = [
    { id: 'u1', name: 'Progettista', email: 'studio@becity.local', role: 'admin', color: '#0a6cff', quota: 500 },
    { id: 'u2', name: 'Marco Verdi', email: 'marco.verdi@studio-demo.local', role: 'gis', color: '#1f9e85', quota: 200 },
    { id: 'u3', name: 'Laura Neri', email: 'laura.neri@studio-demo.local', role: 'reviewer', color: '#7363d6', quota: 50 },
    { id: 'u4', name: 'Paolo Russo', email: 'paolo.russo@consulenti.local', role: 'consultant', color: '#ee7a3f', quota: 50 },
    { id: 'u5', name: 'Cliente Demo', email: 'cliente@committente.local', role: 'viewer', color: '#df5179', quota: 0 },
    { id: 'u6', name: 'Andrea Gallo', email: 'andrea.gallo@studio-demo.local', role: 'editor', color: '#3b8bd0', quota: 200 }
  ];
  return {
    version: 1,
    org: { name: 'Studio', plan: 'BeCity Professional (locale)', aiPolicy: { aiEnabled: true, genEnabled: true, normEnabled: true, training: false, residency: 'Locale (dispositivo)' }, credits: 250 },
    users, projects: [], folders: ['Residenziale', 'Pianificazione', 'Archivio'],
    currentProject: null, audit: [], notifications: [], shares: [], contacts: [],
    settings: { lang: 'it', aliases: {}, autosave: true },
    corpusUser: [], feedback: [], customRules: null, templates: []
  };
};

/* ---------------- session / auth ---------------- */
App.session = () => { try { return JSON.parse(localStorage.getItem(SKEY) || sessionStorage.getItem(SKEY)); } catch (e) { return null; } };
App.login = (userId, remember, method) => {
  const s = JSON.stringify({ userId, method, at: App.now() });
  localStorage.removeItem(SKEY); sessionStorage.removeItem(SKEY);
  (remember ? localStorage : sessionStorage).setItem(SKEY, s);
  App.user = userId === 'guest' ? App.guestUser() : App.state.users.find(u => u.id === userId);
  App.audit('login', `Accesso (${method})`);
  App.renderTopbar(); App.emit('login', App.user);
};
App.logout = () => { App.audit('logout', 'Uscita'); localStorage.removeItem(SKEY); sessionStorage.removeItem(SKEY); App.user = null; App.renderTopbar(); location.hash = '#/home'; App.route(); };
App.guestUser = () => ({ id: 'guest', name: 'Ospite', role: 'guest', color: '#8a94a4', guest: true });
App.isGuest = () => App.user && App.user.guest;
App.roleLabel = r => ({ admin: 'Amministratore tenant', editor: 'Progettista editor', gis: 'Tecnico GIS', reviewer: 'Revisore / partner', consultant: 'Consulente esterno', viewer: 'Cliente / committente', guest: 'Ospite CAD Core', owner: 'Proprietario' }[r] || r);
App.projectRole = (p = App.project()) => {
  if (!App.user) return null; if (App.user.guest) return 'editor';
  if (App.user.role === 'admin') return 'owner';
  const m = p && (p.members || []).find(m => m.user === App.user.id);
  if (!m) return null;
  if (m.expires && new Date(m.expires) < new Date()) return 'expired';
  return m.role;
};
App.can = (what, p = App.project()) => {
  const r = App.projectRole(p);
  const M = { edit: ['owner', 'editor', 'gis', 'consultant'], editGis: ['owner', 'editor', 'gis'], comment: ['owner', 'editor', 'gis', 'reviewer', 'consultant'], approve: ['owner', 'reviewer'], view: ['owner', 'editor', 'gis', 'reviewer', 'consultant', 'viewer'], admin: ['owner'] };
  return (M[what] || []).includes(r);
};

/* ---------------- audit (hash chain, append-only) ---------------- */
App.hash = s => { let h1 = 0x811c9dc5, h2 = 0x01000193; for (let i = 0; i < s.length; i++) { h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 16777619) >>> 0; h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822507) >>> 0; } return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')); };
App.audit = (action, detail, extra) => {
  if (!App.state) return;
  const prev = App.state.audit.length ? App.state.audit[App.state.audit.length - 1].hash : '0';
  const e = { id: App.uid(), at: App.now(), user: App.user ? App.user.name : 'sistema', action, detail, project: App.state.currentProject, ...(extra || {}) };
  e.hash = App.hash(prev + JSON.stringify(e));
  App.state.audit.push(e);
  if (App.state.audit.length > 3000) App.state.audit.splice(0, App.state.audit.length - 3000);
  App.save();
};
App.verifyAudit = () => {
  const a = App.state.audit; let prev = a.length && a[0] ? null : '0';
  for (let i = 1; i < a.length; i++) { const { hash, ...rest } = a[i]; if (App.hash(a[i - 1].hash + JSON.stringify(rest)) !== hash) return { ok: false, at: i }; }
  return { ok: true, n: a.length };
};

/* ---------------- notifications ---------------- */
App.notify = (userId, text, link) => {
  App.state.notifications.unshift({ id: App.uid(), user: userId, text, link, at: App.now(), read: false });
  App.state.notifications = App.state.notifications.slice(0, 200); App.save(); App.renderNotif();
};
App.renderNotif = () => {
  if (!App.user) return; const n = App.state.notifications.filter(x => x.user === App.user.id && !x.read).length;
  const b = $('#notifCount'); b.textContent = n; b.classList.toggle('hidden', !n);
};

/* ---------------- projects ---------------- */
App.project = () => App.state && App.state.projects.find(p => p.id === App.state.currentProject);
App.setProject = id => { App.state.currentProject = id; App.save(); App.emit('project', App.project()); };
App.visibleProjects = () => {
  if (!App.user) return []; if (App.user.guest) return App.state.projects.filter(p => p.guest);
  return App.state.projects.filter(p => !p.guest && (App.user.role === 'admin' || (p.members || []).some(m => m.user === App.user.id)));
};
App.newProject = (o = {}) => {
  const p = Object.assign({
    id: App.uid(), name: 'Nuovo progetto', phase: 'Preliminare', comune: '', regione: '', crs: 'EPSG:7792', folder: '', created: App.now(), updated: App.now(),
    origin: { lon: 16.8719, lat: 41.1171 }, client: '', address: '', tags: [],
    members: App.user && !App.user.guest ? [{ user: App.user.id, role: 'owner' }] : [],
    drawing: App.newDrawing(), gis: { layers: [] }, docs: [], comments: [], snapshots: [], history: [], checks: [], sheets: [], proposal: null, chats: []
  }, o);
  App.state.projects.push(p); App.save(); return p;
};
App.newDrawing = () => ({
  units: 'm', entities: [], blocks: {},
  layers: [
    { name: '0', color: '#1d2433', visible: true, frozen: false, locked: false, ltype: 'continuous', lw: 1 },
    { name: 'MURI', color: '#283044', visible: true, frozen: false, locked: false, ltype: 'continuous', lw: 2 },
    { name: 'APERTURE', color: '#3d6fe0', visible: true, frozen: false, locked: false, ltype: 'continuous', lw: 1 },
    { name: 'STANZE', color: '#1f9e85', visible: true, frozen: false, locked: false, ltype: 'continuous', lw: 1 },
    { name: 'ARREDI', color: '#7a8597', visible: true, frozen: false, locked: false, ltype: 'continuous', lw: 1 },
    { name: 'QUOTE', color: '#df5179', visible: true, frozen: false, locked: false, ltype: 'continuous', lw: 1 },
    { name: 'TESTI', color: '#14213d', visible: true, frozen: false, locked: false, ltype: 'continuous', lw: 1 },
    { name: 'LOTTO', color: '#ee7a3f', visible: true, frozen: false, locked: false, ltype: 'dashed', lw: 1 },
    { name: 'SOLIDI', color: '#7363d6', visible: true, frozen: false, locked: false, ltype: 'continuous', lw: 1 }
  ], current: '0'
});
App.touch = (p = App.project()) => { if (p) { p.updated = App.now(); App.save(); } };

/* ---------------- UI helpers ---------------- */
App.toast = (msg, type = '') => {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, type === 'err' ? 5200 : 3000);
};
App.modal = ({ title, body, actions = [{ label: App.t('close'), value: null }], size = '', onOpen } = {}) => new Promise(resolve => {
  const back = document.createElement('div'); back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true"><div class="modal-h"><h3>${esc(title)}</h3><button class="btn ghost sm" data-x aria-label="Chiudi">✕</button></div><div class="modal-b"></div><div class="modal-f"></div></div>`;
  const b = $('.modal-b', back); if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  const f = $('.modal-f', back);
  const close = v => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
  actions.forEach(a => { const bt = document.createElement('button'); bt.className = 'btn ' + (a.cls || (a.primary ? 'primary' : '')); bt.textContent = a.label; bt.onclick = () => { if (a.validate && !a.validate(back)) return; close(typeof a.value === 'function' ? a.value(back) : a.value); }; f.appendChild(bt); });
  if (!actions.length) f.remove();
  $('[data-x]', back).onclick = () => close(null);
  back.addEventListener('mousedown', e => { if (e.target === back) close(null); });
  const onKey = e => { if (e.key === 'Escape') close(null); if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && actions.some(a => a.primary)) { const p = actions.find(a => a.primary); if (p.validate && !p.validate(back)) return; e.preventDefault(); close(typeof p.value === 'function' ? p.value(back) : p.value); } };
  document.addEventListener('keydown', onKey);
  $('#modalRoot').appendChild(back);
  const fi = $('input,select,textarea', b); if (fi) setTimeout(() => fi.focus(), 30);
  if (onOpen) onOpen(back, close);
});
App.form = async (title, fields, okLabel = App.t('ok'), size) => {
  const body = fields.map(f => {
    const id = 'f_' + f.name;
    if (f.type === 'select') return `<label class="f"><span>${esc(f.label)}</span><select id="${id}">${f.options.map(o => { const v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o; return `<option value="${esc(v)}" ${String(v) === String(f.value) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select></label>`;
    if (f.type === 'textarea') return `<label class="f"><span>${esc(f.label)}</span><textarea id="${id}" rows="${f.rows || 4}">${esc(f.value || '')}</textarea></label>`;
    if (f.type === 'checkbox') return `<label class="chk"><input type="checkbox" id="${id}" ${f.value ? 'checked' : ''}> ${esc(f.label)}</label>`;
    if (f.type === 'html') return f.html;
    return `<label class="f"><span>${esc(f.label)}</span><input id="${id}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.step ? `step="${f.step}"` : ''} placeholder="${esc(f.placeholder || '')}"></label>`;
  }).join('');
  return App.modal({
    title, size, body: `<div class="col" style="gap:12px">${body}</div>`,
    actions: [{ label: App.t('cancel'), value: null }, {
      label: okLabel, primary: true, value: back => {
        const o = {}; fields.forEach(f => { if (f.type === 'html') return; const e = $('#f_' + f.name, back); o[f.name] = f.type === 'checkbox' ? e.checked : f.type === 'number' ? parseFloat(String(e.value).replace(',', '.')) : e.value; }); return o;
      }
    }]
  });
};
App.confirm = (title, text, label = 'Conferma') => App.modal({ title, body: `<p style="margin:0">${text}</p>`, actions: [{ label: App.t('cancel'), value: false }, { label, primary: true, value: true }] });
App.ctxMenu = (x, y, items) => {
  $$('.ctxmenu').forEach(e => e.remove());
  const m = document.createElement('div'); m.className = 'ctxmenu';
  items.forEach(it => { if (it === '-') { m.appendChild(document.createElement('hr')); return; } const b = document.createElement('button'); b.innerHTML = it.label; if (it.disabled) b.disabled = true; b.onclick = () => { m.remove(); it.action(); }; m.appendChild(b); });
  document.body.appendChild(m);
  const r = m.getBoundingClientRect(); m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  setTimeout(() => document.addEventListener('mousedown', function f(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', f); } }), 0);
};
App.download = (name, data, mime = 'application/octet-stream') => {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  App.audit('export', name);
};
App.pickFiles = ({ accept = '', multiple = false } = {}) => new Promise(res => {
  const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple; i.style.display = 'none';
  i.onchange = () => { res(Array.from(i.files)); i.remove(); }; document.body.appendChild(i); i.click();
});
App.readText = f => new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsText(f); });
App.readBuf = f => new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsArrayBuffer(f); });
App.readDataURL = f => new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsDataURL(f); });
App.slug = s => String(s || 'file').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'file';
App.icon = (name, size = 18) => {
  const P = {
    cube: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
    home: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    acc: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 6h8v3.5H8zM8.5 13.2h.01M12 13.2h.01M15.5 13.2h.01M8.5 17h.01M12 17h.01M15.5 17h.01"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7 13h3M7 16.5h3M13 13h4M13 16.5h4"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    minus: '<path d="M5 12h14"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    catalog: '<path d="M4 5h6l2 2h8v12H4z"/><path d="M4 10h16"/>',
    basemap: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    filter: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
    locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    scene: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/>',
    doc: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8.5 12h7M8.5 15.5h7M8.5 8.5H11"/>',
    spark: '<path d="M4 15c3 0 4-1 5-4s2-7 3-7 2 4 3 7 2 4 5 4"/><path d="M12 13v8"/>',
    users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20c.6-3.6 3.3-5.6 6.5-5.6s5.9 2 6.5 5.6"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.3c2.6.2 4.5 2 5 5"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    snow: '<path d="M12 2v20M4 6l16 12M20 6 4 18"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    line: '<path d="M4 20 20 4"/><circle cx="4" cy="20" r="1.6"/><circle cx="20" cy="4" r="1.6"/>', pline: '<path d="M3 18 9 7l6 8 6-10"/>',
    rect: '<rect x="4" y="6" width="16" height="12"/>', circle: '<circle cx="12" cy="12" r="8"/>', arc: '<path d="M4 18a9 9 0 0 1 16 0"/>',
    text: '<path d="M5 6h14M12 6v13M9 19h6"/>', dim: '<path d="M4 8v8M20 8v8M4 12h16M7 10l-3 2 3 2M17 10l3 2-3 2"/>',
    wall: '<rect x="3" y="9" width="18" height="6"/><path d="M7 9v6M11 9v6M15 9v6M19 9v6" opacity=".5"/>',
    door: '<path d="M5 20V8M5 8a12 12 0 0 1 12 12M5 20h14"/>', window: '<rect x="3" y="9" width="18" height="6"/><path d="M3 12h18"/>',
    room: '<path d="M4 4h16v16H4z"/><path d="M8 12h8" stroke-dasharray="2 2"/>', move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>', mirror: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 6 3 18h6zM15 6l6 12h-6z"/>',
    offset: '<path d="M4 16 10 6h10"/><path d="M4 20l8-11h8"/>', trim: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    erase: '<path d="m7 21-4-4 11-11 7 7-8 8zM10 21h11"/>', undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="m21 21-5-5"/>', hand: '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V3.5a1.5 1.5 0 0 1 3 0V11M14 11V5a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2.5-4.5a1.5 1.5 0 0 1 2.5-1.6L8 13"/>',
    select: '<path d="m4 3 7 17 2-7 7-2z"/>', block: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/><path d="M11 7.5h5.5V13"/>',
    box3d: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>', ruler: '<path d="m3 17 14-14 4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
    comment: '<path d="M4 5h16v11H9l-5 4z"/>', download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>', upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>', point: '<circle cx="12" cy="12" r="3.5"/>', poly: '<path d="M5 18 4 8l8-5 8 6-3 9z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', table: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 15h18M9 4v16"/>',
    check: '<path d="m5 12 5 5 9-10"/>', bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>', leaf: '<path d="M5 19c0-9 6-14 15-15-1 9-6 15-15 15z"/><path d="M5 19 13 11"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>', print: '<path d="M6 9V3h12v6M6 18H4v-8h16v8h-2M8 14h8v7H8z"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.9 7.6-4.4M8.2 13.1l7.6 4.4"/>',
    camera: '<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="3.5"/>', history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    folder: '<path d="M3 6h6l2 2h10v11H3z"/>', send: '<path d="m4 12 16-8-6 16-2.5-6.5z"/>', image: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="9" cy="10" r="2"/><path d="m21 17-6-6-9 9"/>',
    measure: '<path d="M3 21 21 3"/><path d="M3 15v6h6M21 9V3h-6"/>', select2: '<rect x="4" y="4" width="16" height="16" stroke-dasharray="3 2"/>',
    building: '<path d="M4 21V5l8-3v19M12 9l8 3v9M2 21h20M7 8h2M7 12h2M7 16h2M15 14h2M15 17h2"/>',
    cad: '<path d="M3 21 21 3"/><path d="M3 9h6V3"/><circle cx="15" cy="15" r="5"/><path d="M15 10v10M10 15h10" opacity=".55"/>',
    bim: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/><path d="M7.5 9.5v9M16.5 9.5v9" opacity=".6"/>',
    gis: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/><circle cx="12" cy="11" r="1.6"/>',
    present: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/><path d="m7 13 3-3 2 2 5-5"/>',
    norm: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="m8.5 14 2.2 2.2L15.5 11.5"/>',
    drone: '<circle cx="5" cy="5" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/>',
    hatch: '<rect x="4" y="4" width="16" height="16"/><path d="M4 12 12 4M4 20 20 4M12 20l8-8"/>',
    array: '<rect x="3" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><rect x="15" y="15" width="6" height="6"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/>', polygon: '<path d="m12 3 8.5 6.2-3.2 10H6.7L3.5 9.2z"/>', spline: '<path d="M3 17c3-9 6-9 9-3s6 6 9-6"/>',
    mtext: '<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>', leader: '<path d="M4 20 13 9h7"/><path d="m4 20 1-4 3 2z"/>', join: '<path d="M4 12h6M14 12h6"/><circle cx="12" cy="12" r="2"/>',
    break: '<path d="M3 12h7M14 12h7M10 8l4 8"/>', chamfer: '<path d="M4 20V10l6-6h10"/>', stretch: '<path d="M3 8h10v8H3z"/><path d="M13 12h8M18 9l3 3-3 3"/>',
    match: '<path d="M4 20 14 10"/><path d="m14 4 6 6-4 4-6-6z"/>',
    grid: '<path d="M4 4h16v16H4zM4 12h16M12 4v16"/>', curtain: '<rect x="4" y="3" width="16" height="18"/><path d="M4 9h16M4 15h16M9.3 3v18M14.7 3v18"/>',
    rail: '<path d="M3 9h18M3 15h18M6 9v6M10 9v6M14 9v6M18 9v6"/>', tag: '<path d="M3 12 12 3h9v9l-9 9z"/><circle cx="16" cy="8" r="1.5"/>',
    volume: '<path d="M3 17 8 9l4 5 3-3 6 6z"/><path d="M3 20h18"/>', cloud: '<circle cx="6" cy="14" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="14" cy="13" r="1"/><circle cx="18" cy="9" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/><circle cx="12" cy="6" r="1"/>',
    profile: '<path d="M3 18 8 11l4 3 4-7 5 6"/><path d="M3 21h18"/>'
  };
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
};
App.iconPath = name => { const m = App.icon(name).match(/aria-hidden="true">([\s\S]*)<\/svg>$/); return m ? m[1] : ''; };

/* ---------------- icone applicazione (stile squircle con ombreggiatura) ---------------- */
App.ICON_GRAD = { cad: ['#3b8cff', '#0047c2', 'cad'], bim: ['#ffa040', '#e45a00', 'bim'], gis: ['#2fd38a', '#008a55', 'gis'], norm: ['#9d7bff', '#4b2bcf', 'norm'], present: ['#3fd0ff', '#0079b8', 'present'], acc: ['#ff6b86', '#c2123f', 'acc'], folder: ['#8a8a8a', '#3a3a3a', 'folder'], settings: ['#8a8a8a', '#3a3a3a', 'settings'], layers: ['#8a8a8a', '#3a3a3a', 'layers'] };
App.appIcon = (id, size = 46) => {
  const g = App.ICON_GRAD[id] || App.ICON_GRAD.settings; const u = 'ai' + id + size;
  return `<span class="app-ico" style="width:${size}px;height:${size}px"><svg viewBox="0 0 60 60" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset="1" stop-color="${g[1]}"/></linearGradient><linearGradient id="${u}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient><filter id="${u}s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#000" flood-opacity=".28"/></filter></defs><path d="M30 1.5C9 1.5 1.5 9 1.5 30S9 58.5 30 58.5 58.5 51 58.5 30 51 1.5 30 1.5Z" fill="url(#${u}g)"/><path d="M30 1.5C9 1.5 1.5 9 1.5 30S9 58.5 30 58.5 58.5 51 58.5 30 51 1.5 30 1.5Z" fill="url(#${u}h)"/><g transform="translate(14 14) scale(1.333)" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" filter="url(#${u}s)">${App.iconPath(g[2])}</g></svg></span>`;
};

/* ---------------- module registry & router ---------------- */
App.MODS = [
  { id: 'cad', icon: 'cad', refs: ['Riga di comando', 'DWG · DXF', 'Layer e blocchi'] },
  { id: 'gis', icon: 'gis', refs: ['Processing', 'GeoPackage · PostGIS', 'Piani di volo'] },
  { id: 'bim', icon: 'bim', refs: ['Livelli e tipi', 'Spingi/tira', 'IFC4'] },
  { id: 'present', icon: 'present', refs: ['Tavole in scala', 'Render', 'PDF'] },
  { id: 'norm', icon: 'norm', refs: ['Fonti citate', 'Titolo edilizio', 'Conformità'] },
  { id: 'acc', icon: 'acc', refs: ['Computo metrico', 'Prezzari regionali', 'SAL · QE'] }
];
App.register = (name, mod) => { App.routes[name] = mod; };
App.current = null;
App.route = () => {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [name, ...args] = h.split('/');
  let mod = App.routes[name] || App.routes.home;
  const target = App.routes[name] ? name : 'home';
  void target;
  if (App.current && App.current.unmount) { try { App.current.unmount(); } catch (e) { console.error(e); } }
  const view = $('#view'); view.innerHTML = ''; view.className = '';
  document.body.classList.toggle('in-module', mod !== App.routes.home);
  $$('.mainnav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#/' + name));
  App.current = mod;
  if (mod.needProject && !App.project()) { const vp = App.visibleProjects(); if (vp[0]) App.setProject(vp[0].id); }
  try { mod.mount(view, args); } catch (e) { console.error(e); view.innerHTML = `<div class="empty">Errore nel modulo: ${esc(e.message)}</div>`; }
  App.applyI18n();
  view.classList.remove('view-in'); void view.offsetWidth; view.classList.add('view-in');
};
App.modShell = (view, { id, title, sub, tabs, activeTab, onTab, extra = '' }) => {
  const m = App.MODS.find(x => x.id === id) || { icon: ({ projects: 'folder', admin: 'settings', resources: 'layers' })[id] || 'settings' };
  const vp = App.visibleProjects(); const p = App.project();
  view.innerHTML = `<section class="module"><div class="modbar">
    ${App.appIcon(App.MODS.some(x => x.id === id) ? id : m.icon, 38)}
    <div><h2>${esc(title)}</h2><div class="sub">${esc(sub || '')}</div></div>
    ${tabs ? `<div class="tabs" role="tablist">${tabs.map(t => `<button data-tab="${t.id}" class="${t.id === activeTab ? 'active' : ''}">${esc(t.label)}</button>`).join('')}</div>` : ''}
    <div class="projsel">${extra}<span class="small muted">${App.t('project')}</span>
      <select id="projSel">${vp.map(x => `<option value="${x.id}" ${p && x.id === p.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <span class="pill" title="Ruolo nel progetto">${esc(App.roleLabel(App.projectRole()) || '')}</span>
    </div></div><div class="modbody"></div></section>`;
  $('#projSel', view).onchange = e => { App.setProject(e.target.value); App.route(); };
  if (tabs) $$('.tabs button', view).forEach(b => b.onclick = () => { $$('.tabs button', view).forEach(x => x.classList.toggle('active', x === b)); onTab(b.dataset.tab); });
  return $('.modbody', view);
};

/* ---------------- top bar ---------------- */
App.renderTopbar = () => {
  const chip = $('#userChip'); if (!chip || !App.user) return;
  chip.innerHTML = `${App.avatar(App.user, 26)}<span class="small">${esc(App.user.name)}</span>`;
  App.renderNotif();
};
App.userMenu = () => {
  const r = $('#userChip').getBoundingClientRect();
  App.ctxMenu(r.left - 120, r.bottom + 6, [
    { label: App.icon('settings', 16) + ' Impostazioni', action: () => location.hash = '#/admin' },
    { label: App.icon('folder', 16) + ' Progetti', action: () => location.hash = '#/projects' },
    '-',
    { label: App.icon('download', 16) + ' Backup completo dei dati', action: App.backup },
    { label: App.icon('upload', 16) + ' Ripristina backup', action: App.restore },
    '-',
    { label: App.icon('x', 16) + ' Chiudi BeCity', action: App.quit }
  ]);
};
App.quit = async () => { if (!await App.confirm('Chiudi BeCity', 'I dati sono già salvati sul computer. Chiudere l\'applicazione?', 'Chiudi')) return; App.saveNow(); try { await fetch('api/quit', { method: 'POST' }); } catch (e) { } window.close(); setTimeout(() => { document.body.innerHTML = '<div class="empty" style="padding-top:20vh"><h2>BeCity è stato chiuso</h2><p>Puoi chiudere questa finestra.</p></div>'; }, 300); };
App.backup = () => App.download(`becity_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(App.state), 'application/json');
App.restore = async () => {
  const [f] = await App.pickFiles({ accept: '.json' }); if (!f) return;
  try { const s = JSON.parse(await App.readText(f)); if (!s.version || !s.projects) throw new Error('formato non valido');
    if (!await App.confirm('Ripristina backup', 'Tutti i dati locali correnti saranno sostituiti. Continuare?')) return;
    App.state = s; App.saveNow(); App.toast('Backup ripristinato', 'ok'); App.route();
  } catch (e) { App.toast('Backup non valido: ' + e.message, 'err'); }
};
App.showNotif = () => {
  $$('.notif-pop').forEach(e => e.remove());
  const list = App.state.notifications.filter(n => n.user === App.user.id);
  const d = document.createElement('div'); d.className = 'notif-pop';
  d.innerHTML = `<div class="row between" style="padding:10px 14px;border-bottom:1px solid var(--line)"><b>Notifiche</b><button class="btn sm ghost" data-r>Segna tutte lette</button></div>` +
    (list.length ? list.map(n => `<div class="n ${n.read ? '' : 'unread'}" data-l="${esc(n.link || '')}">${esc(n.text)}<div class="tiny faint">${App.fdate(n.at)}</div></div>`).join('') : '<div class="empty">Nessuna notifica</div>');
  document.body.appendChild(d);
  $('[data-r]', d).onclick = () => { list.forEach(n => n.read = true); App.save(); App.renderNotif(); d.remove(); };
  $$('.n', d).forEach(n => n.onclick = () => { if (n.dataset.l) location.hash = n.dataset.l; d.remove(); });
  setTimeout(() => document.addEventListener('mousedown', function f(e) { if (!d.contains(e.target) && !$('#notifBtn').contains(e.target)) { d.remove(); document.removeEventListener('mousedown', f); } }), 0);
};
App.contact = async () => {
  const r = await App.form('Contattaci', [
    { name: 'name', label: 'Nome e cognome', value: App.user && !App.user.guest ? App.user.name : '' },
    { name: 'email', label: 'Email', type: 'email', value: App.user && App.user.email || '' },
    { name: 'topic', label: 'Argomento', type: 'select', options: ['Informazioni commerciali', 'Supporto tecnico', 'Segnalazione errore normativo', 'Privacy / GDPR'] },
    { name: 'msg', label: 'Messaggio', type: 'textarea', rows: 5 }
  ], 'Registra richiesta');
  if (!r) return;
  App.state.contacts.push({ ...r, at: App.now() }); App.save();
  App.toast('Richiesta registrata localmente. Sarà inviata alla prossima sincronizzazione (modalità offline).', 'ok');
};

/* ---------------- command palette (⌘K) ---------------- */
App.palette = () => {
  if ($('.palette')) return;
  const d = document.createElement('div'); d.className = 'palette';
  d.innerHTML = `<div class="palette-box"><input type="search" placeholder="${esc(App.t('search'))}" aria-label="Cerca"><div class="palette-res"></div></div>`;
  document.body.appendChild(d);
  const inp = $('input', d), res = $('.palette-res', d); let items = [], idx = 0;
  const tools = [
    ...App.MODS.map(m => ({ g: 'Strumenti', t: App.t('m.' + m.id), s: App.t('m.' + m.id + '.k'), go: () => location.hash = '#/' + m.id })),
    { g: 'Strumenti', t: 'Titolo edilizio (wizard)', s: 'Normativa', go: () => location.hash = '#/norm/titolo' },
    { g: 'Strumenti', t: 'Verifica di conformità', s: 'Normativa', go: () => location.hash = '#/norm/conformita' },
    { g: 'Strumenti', t: 'Analisi fascicolo', s: 'Documentale', go: () => location.hash = '#/norm/documenti' },
    { g: 'Strumenti', t: 'Apri disegno DWG/DXF', s: 'CAD', go: () => { location.hash = '#/cad'; setTimeout(() => window.CAD && CAD.openFile && CAD.openFile(true), 400); } },
    { g: 'Strumenti', t: 'Pianta da brief (comando PIANTADABRIEF)', s: 'CAD', go: () => location.hash = '#/cad' },
    { g: 'Strumenti', t: 'Esporta IFC4', s: 'BIM', go: () => location.hash = '#/bim' },
    { g: 'Strumenti', t: 'Piano di volo drone', s: 'GIS · Mappatura drone', go: () => location.hash = '#/gis' },
    { g: 'Strumenti', t: 'Nuvola di punti LAS → DSM/DTM', s: 'GIS · Mappatura drone', go: () => location.hash = '#/gis' },
    { g: 'Strumenti', t: 'Tavole e render', s: 'Presentazione', go: () => location.hash = '#/present' },
    { g: 'Strumenti', t: 'Computo metrico estimativo', s: 'Contabilità', go: () => location.hash = '#/acc/comp' },
    { g: 'Strumenti', t: 'Quadro economico', s: 'Contabilità', go: () => location.hash = '#/acc/qe' },
    { g: 'Strumenti', t: 'Prezzari regionali', s: 'Contabilità', go: () => location.hash = '#/acc/prz' },
    { g: 'Strumenti', t: 'Stato di avanzamento lavori (SAL)', s: 'Contabilità', go: () => location.hash = '#/acc/salv' },
    { g: 'Strumenti', t: 'Impostazioni', s: 'Utenti, policy, audit, backup', go: () => location.hash = '#/admin' },
    { g: 'Strumenti', t: 'Matrice requisiti implementati', s: 'Supporto', go: () => location.hash = '#/support' }
  ];
  const build = q => {
    q = q.toLowerCase().trim(); const out = [];
    const m = s => !q || String(s).toLowerCase().includes(q);
    App.visibleProjects().forEach(p => { if (m(p.name) || m(p.comune)) out.push({ g: 'Progetti', t: p.name, s: [p.comune, p.phase].filter(Boolean).join(' · '), go: () => { App.setProject(p.id); location.hash = '#/collab/progetti'; App.route(); } });
      (p.docs || []).forEach(dc => { if (q && m(dc.name)) out.push({ g: 'File', t: dc.name, s: p.name, go: () => { App.setProject(p.id); location.hash = '#/norm/documenti'; App.route(); } }); });
      (p.gis.layers || []).forEach(l => { if (q && m(l.name)) out.push({ g: 'File', t: l.name, s: 'Dataset GIS · ' + p.name, go: () => { App.setProject(p.id); location.hash = '#/gis'; App.route(); } }); });
    });
    if (window.CORPUS) App.corpusAll().forEach(c => { if (q && (m(c.titolo) || m(c.atto) || m(c.tags))) out.push({ g: 'Norme', t: `${c.atto} – ${c.articolo}`, s: c.titolo, go: () => { location.hash = '#/norm/fonti/' + c.id; } }); });
    tools.forEach(t => { if (m(t.t) || m(t.s)) out.push(t); });
    return out.slice(0, 40);
  };
  const render = () => {
    items = build(inp.value); idx = Math.min(idx, items.length - 1); let g = '';
    res.innerHTML = items.map((it, i) => { const head = it.g !== g ? `<div class="grp">${esc(g = it.g)}</div>` : ''; return head + `<div class="it ${i === idx ? 'active' : ''}" data-i="${i}"><b style="font-weight:500">${esc(it.t)}</b><span class="small muted">${esc(it.s || '')}</span></div>`; }).join('') || '<div class="empty">Nessun risultato</div>';
    $$('.it', res).forEach(e => e.onclick = () => { close(); items[+e.dataset.i].go(); });
  };
  const close = () => d.remove();
  inp.oninput = () => { idx = 0; render(); };
  inp.onkeydown = e => { if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); render(); e.preventDefault(); } if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); render(); e.preventDefault(); } if (e.key === 'Enter' && items[idx]) { close(); if (!App.user) { App.toast('Accedi per continuare', 'warn'); return; } items[idx].go(); } if (e.key === 'Escape') close(); };
  d.onmousedown = e => { if (e.target === d) close(); };
  render(); inp.focus();
};

/* ---------------- binary helpers ---------------- */
App.crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
App.crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = App.crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
App.utf8 = s => new TextEncoder().encode(s);
App.zip = {
  make(files) {
    const parts = [], central = []; let off = 0;
    const dt = new Date(); const dtime = (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1); const ddate = ((dt.getFullYear() - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
    for (const f of files) {
      const name = App.utf8(f.name), data = typeof f.data === 'string' ? App.utf8(f.data) : f.data, crc = App.crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, dtime, true); lh.setUint16(12, ddate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dtime, true); ch.setUint16(14, ddate, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    }
    const csize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  },
  async read(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf); let e = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Archivio ZIP non valido');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {};
    for (let i = 0; i < n; i++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true); const start = lo + 30 + lnl + lxl; const raw = u8.subarray(start, start + csize);
      if (name.endsWith('/')) continue;
      out[name] = method === 0 ? raw.slice() : method === 8 ? await App.inflateRaw(raw) : null;
    }
    return out;
  }
};
App.inflateRaw = async u8 => {
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser senza DecompressionStream: aggiornare il browser');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
};
App.inflate = async u8 => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());

/* ---------------- broadcast (collaborazione tra schede) ---------------- */
App.tabId = App.uid();
App.bc = (() => { try { return new BroadcastChannel('becity'); } catch (e) { return null; } })();
App.send = (type, data) => { const msg = { type, data, from: App.tabId, user: App.user ? { id: App.user.id, name: App.user.name, color: App.user.color } : null, project: App.state && App.state.currentProject, at: Date.now() }; if (App.bc) App.bc.postMessage(msg); };
if (App.bc) App.bc.onmessage = e => App.emit('remote:' + e.data.type, e.data);
window.addEventListener('storage', e => { if (e.key === KEY && e.newValue) { try { const s = JSON.parse(e.newValue); App.state = s; App.emit('external-state'); } catch (_) { } } });

/* ---------------- start ---------------- */
App.start = async () => {
  const B = window.__boot || {}; const bm = (t, step) => { B.step = step || t; const m = document.getElementById('bootMsg'); if (m) m.textContent = t; };
  const v = document.getElementById('bootVer'); if (v) v.textContent = 'versione ' + App.version;
  App.safeMode = /[?&]safe=1/.test(location.search);
  bm('Apertura dell\'archivio locale…', 'apertura dell\'archivio locale'); await App.store.init();
  bm(App.store.mode === 'disk' ? 'Caricamento dei progetti dal disco…' : 'Caricamento dei progetti…', 'caricamento dei progetti'); await App.load();
  bm('Preparazione dell\'interfaccia…', 'preparazione dell\'interfaccia');
  [App.bootError, App.bootWarn, App.store.recovered && App.store.recovered.length ? 'Alcuni file danneggiati sono stati ripristinati dalla copia di sicurezza: ' + App.store.recovered.join(', ') : ''].filter(Boolean).forEach((m, i) => setTimeout(() => App.toast(m, 'warn'), 900 + i * 400));
  if (!App.state.projects.length && App.seedDemo) { try { App.seedDemo(); } catch (e) { console.error('dati dimostrativi', e); } }
  App.user = App.state.users.find(u => u.role === 'admin') || App.state.users[0];
  if (!App.state.currentProject && App.state.projects[0]) App.state.currentProject = App.state.projects[0].id;
  App.renderTopbar(); App.applyI18n();
  $('#langBtn').onclick = () => { App.state.settings.lang = App.lang() === 'it' ? 'en' : 'it'; App.save(); App.route(); };
  $('#searchBtn').onclick = App.palette;
  $('#userChip').onclick = App.userMenu;
  $('#notifBtn').onclick = App.showNotif;
  window.addEventListener('hashchange', App.route);
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); App.palette(); } });
  // collegamento con BeCity.exe: mantiene attivo il server locale finché la finestra è aperta
  const beat = () => fetch('api/heartbeat', { method: 'POST' }).then(r => r.ok && r.json()).then(j => { App.launcher = !!(j && j.ok); }).catch(() => { App.launcher = false; });
  if (location.protocol.startsWith('http') && document.querySelector('meta[name="becity-token"]') && document.querySelector('meta[name="becity-token"]').content) { beat(); setInterval(beat, 15000); }
  window.addEventListener('error', ev => { if (ev.message && App.store.mode === 'disk') fetch('api/log', { method: 'POST', body: 'ERRORE ' + ev.message + ' ' + (ev.filename || '').split('/').pop() + ':' + ev.lineno }).catch(() => { }); });
  window.addEventListener('beforeunload', () => App.saveNow(true));
  window.addEventListener('dragover', e => { if (!e.target.closest || !e.target.closest('[data-drop]')) e.preventDefault(); });
  window.addEventListener('drop', e => { if (!e.target.closest || !e.target.closest('[data-drop]')) e.preventDefault(); });
  bm('Apertura della schermata iniziale…', 'apertura della schermata iniziale');
  try { App.route(); } catch (e) { console.error(e); location.hash = '#/home'; App.route(); }
  if (App.safeMode) { const tb = document.querySelector('.topbar'); if (tb) tb.insertAdjacentHTML('beforeend', '<span class="pill warn" title="I dati salvati non sono stati caricati">Modalità sicura</span>'); }
  B.done = true;
  const boot = document.getElementById('boot'); if (boot && !boot.classList.contains('fail')) { boot.classList.add('done'); setTimeout(() => boot.remove(), 500); }
};
