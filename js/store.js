/* BeCity – archivio dei dati.
   Con BeCity.exe i dati sono salvati su disco (Documenti\BeCity: stato, progetti, file, prezzari),
   senza il limite di circa 5 MB della memoria del browser. Senza il programma di avvio si usa il browser. */
'use strict';
(function () {
  /* ---------- gettone di sessione per l'API locale ---------- */
  const meta = document.querySelector('meta[name="becity-token"]'); const TOKEN = meta ? meta.content : '';
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const u = typeof input === 'string' ? input : input && input.url || '';
    if (TOKEN && /^(\/)?api\//.test(u)) { init = Object.assign({}, init); const h = new Headers(init.headers || {}); h.set('X-BeCity-Token', TOKEN); init.headers = h; }
    return nativeFetch(input, init);
  };

  /* ---------- IndexedDB (modalità browser) ---------- */
  App.idb = (dbName, store = 'kv') => {
    let db = null;
    const open = () => db || (db = new Promise((res, rej) => { const r = indexedDB.open(dbName, 1); r.onupgradeneeded = () => r.result.createObjectStore(store); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const run = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('operazione annullata')); }); };
    return { get: k => run('readonly', s => s.get(k)), set: (k, v) => run('readwrite', s => s.put(v, k)), del: k => run('readwrite', s => s.delete(k)), keys: () => run('readonly', s => s.getAllKeys()) };
  };

  /* ---------- archivio su disco (BeCity.exe) ---------- */
  const S = App.store = { mode: 'browser', dir: '', size: 0 };
  const url = (ns, k) => `api/store/${ns}/${encodeURIComponent(k)}`;
  const tfetch = (u, o = {}, ms = 15000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(u, Object.assign({}, o, { signal: c.signal })).finally(() => clearTimeout(t)); };
  /* archivio nel database interno del browser (WebApp o avvio senza programma desktop): nessun limite di 5 MB */
  const AR = App.idb('becity.archivio', 'f');
  const idbGet = async (ns, k, type) => { const v = await AR.get(ns + '/' + k); if (v == null) return null; if (type === 'bin') return v instanceof Uint8Array ? v : new TextEncoder().encode(v); const t = typeof v === 'string' ? v : new TextDecoder().decode(v); return type === 'json' ? JSON.parse(t) : t; };
  const idbPut = async (ns, k, data) => { let v = data; if (data instanceof Blob) v = new Uint8Array(await data.arrayBuffer()); else if (data instanceof ArrayBuffer) v = new Uint8Array(data); else if (!(typeof data === 'string' || data instanceof Uint8Array)) v = JSON.stringify(data); await AR.set(ns + '/' + k, v); };
  const idbList = async ns => (await AR.keys()).filter(k => String(k).startsWith(ns + '/')).map(k => ({ key: String(k).slice(ns.length + 1) }));
  S.init = async () => {
    const useIdb = async () => { try { if (window.indexedDB) { await AR.keys(); S.mode = 'idb'; if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { }); } } catch (e) { S.mode = 'browser'; } return S.mode; };
    if (!location.protocol.startsWith('http') || !TOKEN) return useIdb();
    try { const r = await tfetch('api/store-info', {}, 8000); if (r.ok) { const j = await r.json(); if (j.ok) { S.mode = 'disk'; S.dir = j.dir; S.size = j.size; App.server = j; } } } catch (e) { /* modalità browser */ }
    return S.mode === 'disk' ? S.mode : useIdb();
  };
  S.get = async (ns, k, type = 'json') => {
    if (S.mode === 'idb') return idbGet(ns, k, type);
    const r = await tfetch(url(ns, k), {}, 60000); if (r.status === 404) return null; if (!r.ok) throw new Error('lettura ' + ns + '/' + k + ': ' + r.status);
    if (type === 'bin') return new Uint8Array(await r.arrayBuffer()); const txt = await r.text(); if (type !== 'json') return txt;
    try { return JSON.parse(txt); } catch (e) { // file danneggiato: si usa la copia di sicurezza .bak
      const b = await tfetch(url(ns, k) + '?bak=1', {}, 60000); if (b.ok) { try { const v = JSON.parse(await b.text()); S.recovered = (S.recovered || []).concat(ns + '/' + k); return v; } catch (e2) { } }
      throw new Error(`il file ${ns}/${k} è danneggiato e non ha una copia di sicurezza valida`);
    }
  };
  S.put = async (ns, k, data, keepalive) => { if (S.mode === 'idb') return idbPut(ns, k, data); const body = typeof data === 'string' || data instanceof Uint8Array || data instanceof Blob || data instanceof ArrayBuffer ? data : JSON.stringify(data); const r = await tfetch(url(ns, k), { method: 'PUT', body, keepalive: !!keepalive && (body.length || body.size || body.byteLength || 0) < 60000 }); const txt = await r.text().catch(() => ''); if (!r.ok) { let m = r.status; try { m = JSON.parse(txt).error; } catch (e) { } throw new Error('scrittura ' + ns + '/' + k + ': ' + m); } };
  S.del = async (ns, k) => { if (S.mode === 'idb') return AR.del(ns + '/' + k); const r = await tfetch(url(ns, k), { method: 'DELETE' }); await r.text().catch(() => ''); };
  S.list = async ns => { if (S.mode === 'idb') return idbList(ns); const r = await tfetch(`api/store/${ns}/`, {}, 15000); return r.ok ? r.json() : []; };
  S.info = async () => { if (S.mode !== 'disk') return null; try { const j = await (await fetch('api/store-info')).json(); S.size = j.size; return j; } catch (e) { return null; } };
  S.openDir = () => fetch('api/open-data-dir', { method: 'POST' }).then(r => r.text()).catch(() => { });
  /** archivio chiave/valore per dati voluminosi (prezzari) */
  S.persistent = () => S.mode === 'disk' || S.mode === 'idb';
  S.kv = ns => { const idb = App.idb('becity.' + ns, ns === 'prezzari' ? 'p' : 'kv'); return { get: async k => { if (!S.persistent()) return idb.get(k); const v = await S.get(ns, k + '.json'); if (v != null) return v; try { const old = await idb.get(k); if (old != null) { await S.put(ns, k + '.json', old); return old; } } catch (e) { } return null; }, set: (k, v) => S.persistent() ? S.put(ns, k + '.json', v) : idb.set(k, v), del: k => S.persistent() ? S.del(ns, k + '.json') : idb.del(k) }; };

  /* ---------- file allegati (IFC importati, ecc.) ---------- */
  const fidb = App.idb('becity.files', 'f');
  App.files = {
    async put(rec) { const { data, ...meta } = rec; if (S.persistent()) { await S.put('file', rec.id + '.bin', data instanceof Uint8Array ? data : new Uint8Array(data)); await S.put('file', rec.id + '.json', meta); } else await fidb.set(rec.id, rec); return rec.id; },
    async get(id) { if (S.persistent()) { const meta = await S.get('file', id + '.json'); if (!meta) return null; const data = await S.get('file', id + '.bin', 'bin'); return Object.assign(meta, { data }); } return fidb.get(id); },
    async del(id) { if (S.persistent()) { await S.del('file', id + '.bin'); await S.del('file', id + '.json'); } else await fidb.del(id); }
  };

  /* ---------- stato dell'applicazione ---------- */
  const KEY = 'becity.data.v1'; const last = { meta: null, proj: {} }; let saving = null, again = false, warned = false;
  const split = st => { const { projects, ...rest } = st; return { meta: JSON.stringify(Object.assign({}, rest, { projectIds: projects.map(p => p.id) })), projects }; };
  App.load = async () => {
    let st = null;
    if (S.persistent()) {
      try {
        const has = (await S.list('stato')).some(x => x.key === 'stato.json'); const m = has ? await S.get('stato', 'stato.json') : null;
        if (m) { const bad = []; const ps = await Promise.all((Array.isArray(m.projectIds) ? m.projectIds : []).map(id => S.get('progetti', id + '.json').catch(e => { bad.push(id); return null; }))); delete m.projectIds; st = Object.assign(m, { projects: ps.filter(Boolean) }); if (bad.length) App.bootWarn = `${bad.length} progetti non leggibili sono stati esclusi (i file restano nella cartella dei dati).`; }
        else { try { st = JSON.parse(localStorage.getItem(KEY)); if (st && st.version) S.migrated = true; } catch (e) { st = null; } }
      } catch (e) { App.bootError = 'Archivio su disco non leggibile: ' + e.message; }
    } else { try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) { st = null; } }
    if (App.safeMode) { st = null; App.bootWarn = 'Modalità sicura: i dati salvati non sono stati caricati e nessuna modifica viene scritta su disco.'; }
    App.state = App.normalizeState(st && typeof st === 'object' && st.version ? st : App.seed());
    if (S.persistent() && !App.safeMode) { last.meta = null; last.proj = {}; App.saveNow().then(() => { if (S.migrated) { try { localStorage.removeItem(KEY); } catch (e) { } } }); }
  };
  const saveDisk = async (flush) => {
    const { meta, projects } = split(App.state); const tasks = [];
    if (meta !== last.meta) tasks.push(S.put('stato', 'stato.json', meta, flush).then(() => { last.meta = meta; }));
    const ids = new Set();
    projects.forEach(p => { ids.add(p.id); const js = JSON.stringify(p); if (js !== last.proj[p.id]) tasks.push(S.put('progetti', p.id + '.json', js, flush).then(() => { last.proj[p.id] = js; })); });
    Object.keys(last.proj).filter(id => !ids.has(id)).forEach(id => { tasks.push(S.del('progetti', id + '.json').then(() => { delete last.proj[id]; })); });
    await Promise.all(tasks);
  };
  App.saveNow = async (flush) => {
    if (!App.state || App.safeMode) return;
    if (!S.persistent()) {
      try { localStorage.setItem(KEY, JSON.stringify(App.state)); App.emit('saved'); }
      catch (e) { App.toast('Memoria del browser esaurita (circa 5 MB): avvia BeCity con BeCity.exe per salvare i dati su disco senza limiti, oppure esporta e rimuovi i dati più pesanti.', 'err'); }
      return;
    }
    if (saving) { again = true; return saving; }
    saving = (async () => { try { await saveDisk(flush); warned = false; App.emit('saved'); } catch (e) { if (!warned) { warned = true; App.toast('Salvataggio su disco non riuscito: ' + e.message, 'err'); } } })();
    await saving; saving = null; if (again) { again = false; return App.saveNow(); }
  };
  App.save = App.debounce(() => App.saveNow(), 600);
  App.storageUsage = () => S.persistent() ? S.size || ((last.meta || '').length + Object.values(last.proj).reduce((s, x) => s + x.length, 0)) : (() => { let n = 0; for (const k in localStorage) if (Object.prototype.hasOwnProperty.call(localStorage, k)) n += (localStorage[k].length + k.length) * 2; return n; })();
  /** ripara strutture incomplete (dati di versioni precedenti o file modificati) */
  App.normalizeState = st => {
    const d = App.seed(); const arr = (o, k) => { if (!Array.isArray(o[k])) o[k] = []; };
    ['users', 'projects', 'folders', 'audit', 'notifications', 'shares', 'contacts', 'templates'].forEach(k => arr(st, k));
    if (!st.users.length) st.users = d.users;
    st.org = Object.assign({}, d.org, st.org || {}); st.org.aiPolicy = Object.assign({}, d.org.aiPolicy, (st.org || {}).aiPolicy || {});
    st.settings = Object.assign({}, d.settings, st.settings || {});
    Object.keys(d).forEach(k => { if (st[k] === undefined) st[k] = d[k]; });
    st.projects = st.projects.filter(p => p && typeof p === 'object' && p.id).map(p => {
      p.name = p.name || 'Progetto'; p.drawing = p.drawing && typeof p.drawing === 'object' ? p.drawing : App.newDrawing();
      const nd = App.newDrawing(); Object.keys(nd).forEach(k => { if (p.drawing[k] === undefined) p.drawing[k] = nd[k]; }); if (!Array.isArray(p.drawing.entities)) p.drawing.entities = []; if (!Array.isArray(p.drawing.layers) || !p.drawing.layers.length) p.drawing.layers = nd.layers;
      p.gis = p.gis && typeof p.gis === 'object' ? p.gis : { layers: [] }; if (!Array.isArray(p.gis.layers)) p.gis.layers = [];
      p.gis.layers = p.gis.layers.filter(l => l && l.id).map(l => { if (l.type === 'vector' && !Array.isArray(l.features)) l.features = []; return l; });
      ['members', 'tags', 'docs', 'comments', 'snapshots', 'history', 'checks', 'sheets', 'chats'].forEach(k => arr(p, k));
      p.origin = p.origin && isFinite(p.origin.lon) && isFinite(p.origin.lat) ? p.origin : { lon: 16.8719, lat: 41.1171 }; p.crs = p.crs || 'EPSG:7792';
      if (p.bim && (typeof p.bim !== 'object' || !Array.isArray(p.bim.elements))) delete p.bim;
      return p;
    });
    if (!st.projects.some(p => p.id === st.currentProject)) st.currentProject = st.projects[0] ? st.projects[0].id : null;
    if (!st.version) st.version = 1; return st;
  };
  App.resetData = async () => {
    if (S.persistent()) { for (const ns of ['stato', 'progetti']) { const l = await S.list(ns); for (const it of l) await S.del(ns, it.key); } }
    try { localStorage.removeItem(KEY); } catch (e) { }
    location.hash = '#/home'; location.reload();
  };
})();

/* ---------- espressioni sicure (formule del computo, calcolatore di campi GIS): nessun codice eseguito ---------- */
(function () {
  const FN = { abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, sqrt: Math.sqrt, min: Math.min, max: Math.max, pow: Math.pow, log: Math.log, log10: Math.log10, exp: Math.exp, sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan, atan2: Math.atan2, trunc: Math.trunc, sign: Math.sign, upper: s => String(s ?? '').toUpperCase(), lower: s => String(s ?? '').toLowerCase(), len: s => String(s ?? '').length, concat: (...a) => a.join(''), str: v => String(v ?? ''), num: v => +v };
  const CONST = { PI: Math.PI, E: Math.E, true: true, false: false, null: null };
  function lex(src) {
    const t = []; let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) { const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/); if (!m) throw new Error('numero non valido'); t.push({ k: 'n', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if (c === '"' || c === "'") { let j = i + 1, s = ''; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; s += src[j++]; } if (j >= src.length) throw new Error('stringa non chiusa'); t.push({ k: 's', v: s }); i = j + 1; continue; }
      if (/[A-Za-z_$]/.test(c)) { const m = src.slice(i).match(/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)?/)[0]; t.push({ k: 'id', v: m.replace(/^Math\./, '') }); i += m.length; continue; }
      const op = ['===', '!==', '**', '<=', '>=', '==', '!=', '&&', '||'].find(o => src.startsWith(o, i)) || (/[-+*/%^<>!?:(),]/.test(c) ? c : null);
      if (!op) throw new Error('carattere non consentito: ' + c); t.push({ k: 'op', v: op }); i += op.length;
    }
    return t;
  }
  const BP = { '?': 1, '||': 2, '&&': 3, '==': 4, '!=': 4, '===': 4, '!==': 4, '<': 5, '>': 5, '<=': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7, '^': 8, '**': 8 };
  function compile(src) {
    const t = lex(String(src)); let p = 0;
    const peek = () => t[p], next = () => t[p++], expect = v => { const x = next(); if (!x || x.v !== v) throw new Error(`atteso "${v}"`); };
    function prefix() {
      const x = next(); if (!x) throw new Error('espressione incompleta');
      if (x.k === 'n' || x.k === 's') return () => x.v;
      if (x.k === 'id') {
        if (peek() && peek().v === '(') { next(); const args = []; if (peek() && peek().v !== ')') { do { args.push(expr(0)); } while (peek() && peek().v === ',' && next()); } expect(')'); const f = FN[x.v]; if (!f) throw new Error('funzione sconosciuta: ' + x.v); return v => f(...args.map(a => a(v))); }
        if (x.v in CONST) return () => CONST[x.v];
        return v => { if (!(x.v in v)) throw new Error('campo sconosciuto: ' + x.v); return v[x.v]; };
      }
      if (x.v === '(') { const e = expr(0); expect(')'); return e; }
      if (x.v === '-') { const e = expr(7.5); return v => -e(v); } if (x.v === '+') { const e = expr(7.5); return v => +e(v); } if (x.v === '!') { const e = expr(7.5); return v => !e(v); }
      throw new Error('simbolo inatteso: ' + x.v);
    }
    function expr(rbp) {
      let left = prefix();
      while (peek() && peek().k === 'op' && (BP[peek().v] || 0) > rbp) {
        const op = next().v;
        if (op === '?') { const a = expr(0); expect(':'); const b = expr(0); const c = left; left = v => c(v) ? a(v) : b(v); continue; }
        const right = expr(op === '^' || op === '**' ? BP[op] - 1 : BP[op]); const l = left;
        left = ({ '+': v => l(v) + right(v), '-': v => l(v) - right(v), '*': v => l(v) * right(v), '/': v => l(v) / right(v), '%': v => l(v) % right(v), '^': v => Math.pow(l(v), right(v)), '**': v => Math.pow(l(v), right(v)), '<': v => l(v) < right(v), '>': v => l(v) > right(v), '<=': v => l(v) <= right(v), '>=': v => l(v) >= right(v), '==': v => l(v) == right(v), '!=': v => l(v) != right(v), '===': v => l(v) === right(v), '!==': v => l(v) !== right(v), '&&': v => l(v) && right(v), '||': v => l(v) || right(v) })[op];
      }
      return left;
    }
    const f = expr(0); if (p < t.length) throw new Error('simbolo inatteso: ' + t[p].v); return f;
  }
  App.expr = { compile, eval: (src, vars = {}) => compile(src)(vars) };
})();
