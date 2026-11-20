/* BeCity – Contabilità: prezzari, elenco prezzi e analisi, computo metrico estimativo, quadro economico,
   capitolato speciale, cronoprogramma, direzione lavori, contabilità (libretto, registro, SAL, stato finale).
   Riferimenti: D.Lgs. 36/2023 (codice dei contratti pubblici) e relativi allegati. Interfaccia ispirata ai software di computo. */
'use strict';
(function () {
  const esc = App.esc, r2 = v => Math.round((+v || 0) * 100) / 100, eur = v => '€ ' + App.fnum(v, 2), nf = (v, d = 2) => App.fnum(v, d);
  const A = App.acc = {};

  /* =================== archivio prezzari (IndexedDB) =================== */
  const KV = { get: k => App.store.kv('prezzari').get(k), set: (k, v) => App.store.kv('prezzari').set(k, v), del: k => App.store.kv('prezzari').del(k) };
  A.KV = KV;
  const REGIONI = ['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche', 'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana', 'Umbria', 'Valle d\'Aosta', 'Veneto', 'Provincia autonoma di Trento', 'Provincia autonoma di Bolzano'];
  A.REGIONI = REGIONI;
  A.list = () => { const s = App.state; s.prezzari = s.prezzari || []; return [{ id: 'demo', nome: App.accDemo.nome, regione: 'Dimostrativo', anno: App.accDemo.anno, n: demoVoci().length, demo: true }, ...s.prezzari]; };
  const cache = {};
  function demoVoci() { return cache.demo || (cache.demo = App.accDemo.cap.flatMap(([cc, ct, vs]) => vs.map(([c, d, u, p, mo]) => ({ c, d, de: d, u, p, mo, cap: cc + ' – ' + ct, sic: cc === 'SIC' })))); }
  A.voci = async id => { if (!id || id === 'demo') return demoVoci(); if (cache[id]) return cache[id]; return (cache[id] = (await KV.get(id)) || []); };

  /* ---------- lettura dei formati dei prezzari ---------- */
  const num = s => { if (s == null || s === '') return NaN; if (typeof s === 'number') return s; s = String(s).trim().replace(/[€\s]/g, ''); if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, ''); return parseFloat(s.replace(',', '.')); };
  const capOf = c => { const p = String(c).split(/[.\-/ ]/).filter(Boolean); return p.length > 1 ? p.slice(0, Math.min(2, p.length - 1)).join('.') : String(c).slice(0, 3); };
  const normMo = v => !isFinite(v) || v < 0 ? 0 : v > 0 && v <= 1 ? r2(v * 100) : r2(v);
  function parseXML(txt) {
    const doc = new DOMParser().parseFromString(txt, 'application/xml'); if (doc.querySelector('parsererror')) throw new Error('XML non valido');
    const all = [...doc.getElementsByTagName('*')], ln = e => e.localName.toLowerCase();
    const attr = (e, re) => { for (const a of e.attributes) if (re.test(a.name)) return a.value; return ''; };
    const ep = all.filter(e => ln(e) === 'epitem');
    if (ep.length) { // XPWE (formato di scambio dei software di computo)
      return ep.map(e => { const t = n => { const c = [...e.children].find(x => ln(x) === n); return c ? c.textContent.trim() : ''; }; const c = t('tariffa'); return { c, d: t('desridotta') || t('desestesa').slice(0, 200), de: t('desestesa') || t('desridotta'), u: t('unmisura'), p: num(t('prezzo1')), mo: normMo(num(t('incmdo'))), sic: num(t('incsic')) >= 100, cap: capOf(c), xid: e.getAttribute('ID') }; }).filter(v => (v.c || v.d) && isFinite(v.p));
    }
    // SIX (Standard di Interscambio XML dei prezzari) e XML generici
    const units = {}; all.filter(e => /unitadimisura|unitamisura|udm/.test(ln(e)) && e.attributes.length).forEach(e => { const id = attr(e, /id$/i); const sym = attr(e, /simbolo|sigla|codice|descr/i) || (e.firstElementChild ? (e.firstElementChild.getAttribute('breve') || e.firstElementChild.textContent) : e.textContent).trim(); if (id) units[id] = sym; });
    const groups = {}; all.filter(e => /^gruppo|^capitolo|^categoria/.test(ln(e))).forEach(e => { const id = attr(e, /id$/i) || attr(e, /codice/i); const de = [...e.children].find(k => /descrizione/i.test(k.localName)); if (id) groups[id] = (de ? de.getAttribute('breve') || de.textContent : attr(e, /desc/i)).trim(); });
    const prods = all.filter(e => /^(prodotto|voce|articolo|item|prezzo)$/.test(ln(e)) && [...e.children].length);
    return prods.map(e => {
      const kids = [...e.getElementsByTagName('*')];
      const de1 = kids.find(k => /descrizione/i.test(k.localName)); const breve = de1 ? (de1.getAttribute('breve') || de1.textContent).trim() : attr(e, /^desc/i);
      const estesa = de1 ? (de1.getAttribute('estesa') || breve) : breve;
      const qEl = kids.find(k => /quotazione|prezzo|importo/i.test(k.localName)); const p = num(qEl ? (qEl.getAttribute('valore') ?? qEl.textContent) : attr(e, /prezzo|valore/i));
      const uid = attr(e, /unita|udm|^um$/i); const uEl = kids.find(k => /^(um|udm|unitamisura|unitadimisura)$/i.test(k.localName)); const u = units[uid] || uid || (uEl ? uEl.textContent.trim() : '');
      const moEl = kids.find(k => /manodopera|mdo/i.test(k.localName)); const mo = normMo(num(moEl ? (moEl.getAttribute('valore') ?? moEl.textContent) : attr(e, /manodopera|mdo/i)));
      const c = (attr(e, /^(prdid|codice|cod|tariffa|id)$/i) || (kids.find(k => /^(codice|tariffa|cod)$/i.test(k.localName)) || {}).textContent || '').trim();
      const gid = attr(e, /grp|gruppo|capitolo/i); return { c, d: (breve || estesa).slice(0, 300), de: estesa || breve, u, p, mo, cap: groups[gid] || capOf(c) };
    }).filter(v => v.c && isFinite(v.p));
  }
  /* ---------- testo: decodifica con riconoscimento della codifica (UTF-8, UTF-16, Windows-1252) ---------- */
  const decodeText = buf => {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2));
    if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''); } catch (e) { return new TextDecoder('windows-1252').decode(u8); }
  };
  const xmlDec = s => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  /* ---------- CSV (RFC 4180: campi tra virgolette anche su più righe) ---------- */
  function csvParse(text) {
    const head = text.slice(0, 20000); const cnt = ch => { let n = 0, q = false; for (const c of head) { if (c === '"') q = !q; else if (c === ch && !q) n++; } return n; };
    const sep = [';', '\t', ',', '|'].map(c => [c, cnt(c)]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
      if (c === '"' && cur.trim() === '') { q = true; cur = ''; } else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; } else cur += c;
    }
    row.push(cur); if (row.some(x => x.trim() !== '')) rows.push(row);
    return rows;
  }
  /* ---------- XLSX ---------- */
  async function xlsxRows(buf) {
    const z = await App.zip.read(buf); const dec = u => u ? new TextDecoder().decode(u) : '';
    const ss = [...dec(z['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => xmlDec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));
    const sheets = Object.keys(z).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)); if (!sheets.length) throw new Error('nessun foglio di lavoro nel file');
    const col = r => { let n = 0; for (const ch of r.match(/^[A-Z]+/)[0]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
    const readSheet = k => [...dec(z[k]).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(m => { const row = []; for (const c of m[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) { const a = c[1], inner = c[2] || ''; const ref = (a.match(/r="([A-Z]+)\d+"/) || [])[1]; const t = (a.match(/t="(\w+)"/) || [])[1]; const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1]; const is = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''); const val = t === 's' ? ss[+v] : t === 'inlineStr' ? xmlDec(is) : xmlDec(v ?? ''); row[ref ? col(ref) : row.length] = val ?? ''; } for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = ''; return row; });
    // il foglio con più voci riconosciute
    let best = [], bestN = -1; for (const k of sheets) { const rows = readSheet(k); const n = parseRows(rows).length; if (n > bestN) { best = rows; bestN = n; } }
    return best;
  }
  /* ---------- righe tabellari → voci (intestazione riconosciuta o colonne dedotte dai contenuti) ---------- */
  const isCode = s => /^[A-Za-z0-9]{1,8}([.\-/ ][A-Za-z0-9]{1,8}){1,7}[a-z]?$/.test(String(s).trim()) && /\d/.test(s);
  function parseRows(rows, forced) {
    if (!rows.length) return [];
    if (forced) return rowsToVoci(rows, forced, forced.start || 0);
    const lc = r => r.map(c => String(c ?? '').toLowerCase().trim());
    const hdr = rows.slice(0, 40).findIndex(r => { const h = lc(r); return h.some(c => /descri|designaz|declaratoria/.test(c)) && h.some(c => /prezz|importo|euro|€|costo/.test(c)); });
    let ix = null, start = 0;
    if (hdr >= 0) {
      const h = lc(rows[hdr]); const f = (...res) => { for (const re of res) { const i = h.findIndex(c => re.test(c)); if (i >= 0) return i; } return -1; };
      ix = { c: f(/^codice|^cod\.?$|tariffa|^articolo|^art\.?$|^voce$|^n\.? ?art|^codice voce/, /codic|cod\./), d: f(/descrizione estesa|descrizione completa/, /descri|designaz|declaratoria/), db: f(/descrizione breve|descrizione sintetica|descrizione ridotta/), u: f(/^u\.? ?m\.?$|unit|misura|^um$|^udm/), p: f(/^prezzo|prezzo unit|prezzo €|prezzo \(/, /prezz/, /importo|euro|€|costo/), mo: f(/manodop|mano d|\bmdo\b|% ?m\.?o|incid/) };
      if (ix.mo === ix.p) ix.mo = -1; start = hdr + 1;
    } else {
      // nessuna intestazione: deduce le colonne dai valori delle prime righe
      const sample = rows.slice(0, 200), nc = Math.max(...sample.map(r => r.length)); const score = (fn) => Array.from({ length: nc }, (_, j) => sample.filter(r => fn(r[j])).length);
      const sc = score(isCode), sd = score(v => String(v ?? '').length > 25), sp = score(v => isFinite(num(v)) && String(v).trim() !== '' && !isCode(v)), su = score(v => /^(m|m²|m2|mq|m³|m3|mc|kg|t|q|h|ora|cad|n|nr|l|corpo|a corpo|cm|km|ha)\.?$/i.test(String(v ?? '').trim()));
      const arg = a => a.indexOf(Math.max(...a)); const c = arg(sc), d = arg(sd); const pCands = sp.map((n, j) => j === c ? -1 : n); ix = { c, d, db: -1, u: arg(su), p: pCands.lastIndexOf(Math.max(...pCands)) >= 0 ? pCands.indexOf(Math.max(...pCands)) : -1, mo: -1 };
      // il prezzo è di solito la prima colonna numerica dopo l'unità di misura
      const after = pCands.map((n, j) => j > ix.u && n > sample.length * .3 ? j : -1).filter(j => j >= 0); if (after.length) { ix.p = after[0]; if (after[1] !== undefined) ix.mo = after[1]; }
    }
    if (ix.c < 0 || ix.p < 0) return [];
    const res = rowsToVoci(rows, ix, start); res.ix = ix; res.start = start; return res;
  }
  A.guessColumns = rows => { const v = parseRows(rows); return v.ix ? Object.assign({ start: v.start }, v.ix) : { c: 0, d: 1, db: -1, u: 2, p: 3, mo: -1, start: 0 }; };
  function rowsToVoci(rows, ix, start) {
    if (ix.c < 0 || ix.p < 0) return [];
    const caps = []; const out = [];
    for (const r of rows.slice(start)) {
      const g = i => i >= 0 ? String(r[i] ?? '').trim() : '';
      const c = g(ix.c), de = g(ix.d) || g(ix.db), db = g(ix.db), praw = g(ix.p), p = num(praw);
      if (!c && !de) continue;
      if (c && de && (!praw || !isFinite(p))) { // riga di capitolo / sottocapitolo
        const lvl = c.split(/[.\-/ ]/).length; while (caps.length && caps[caps.length - 1].lvl >= lvl) caps.pop(); caps.push({ lvl, t: c + ' – ' + de.split('\n')[0].slice(0, 120) }); continue;
      }
      if (!c && de && out.length && !isFinite(p)) { const last = out[out.length - 1]; last.de += '\n' + de; continue; } // descrizione su più righe
      if (!c || !isFinite(p)) continue;
      let mo = normMo(num(g(ix.mo).replace('%', '')));
      const d0 = (db || de.split('\n')[0]).replace(/\s+/g, ' ');
      out.push({ c, d: d0.length > 220 ? d0.slice(0, 217) + '…' : d0, de: de || db, u: g(ix.u), p: Math.round(p * 10000) / 10000, mo, cap: caps.length ? caps.map(x => x.t).slice(-2).join(' › ') : capOf(c) });
    }
    return out;
  }
  /* ---------- controllo di leggibilità: un prezzario non si importa se il testo non è leggibile ---------- */
  const readable = s => { s = String(s || ''); if (!s) return false; let bad = 0; for (const ch of s) { const c = ch.codePointAt(0); if (c < 32 && c !== 10 && c !== 13 && c !== 9 || c === 0xFFFD || c >= 0x7F && c < 0xA0 || c > 0x2FFF && c < 0xF900) bad++; } const letters = (s.match(/[A-Za-zÀ-ÿ]/g) || []).length; return bad / s.length < 0.02 && letters / s.length > 0.4; };
  const validVoci = v => { if (!Array.isArray(v) || !v.length) return false; const smp = v.slice(0, 400); const ok = smp.filter(x => /^[\x20-\x7E]{1,40}$/.test(x.c) && readable(x.d) && isFinite(x.p)).length; return ok / smp.length >= 0.8; };
  A.validVoci = validVoci;
  /* ---------- DCF (prezzari in formato dei software di computo) ---------- */
  /* ---------- DCF dei software di computo: file system a blocchi "AAMVHFSS" con flussi compressi "AACS" ----------
     Struttura (ricavata dall'analisi dei file): intestazione con superblocco "AASFSSGN" (dimensione del blocco),
     blocchi di 4096 byte ciascuno con 32 byte di intestazione propria; ogni file interno ha un blocco indice con
     l'elenco dei blocchi dati; i dati iniziano con "AACS" e contengono pezzi compressi zlib; il contenuto è XML
     (CollectionEP = elenco prezzi, DatiGenerali = capitoli e dati del prezzario). */
  const u32 = (u8, o) => (u8[o] | u8[o + 1] << 8 | u8[o + 2] << 16 | u8[o + 3] << 24) >>> 0;
  const zinflate = async bytes => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const attrs = str => { const o = {}; for (const m of str.matchAll(/([\w:]+)="([^"]*)"/g)) o[m[1]] = xmlDec(m[2]); return o; };
  async function readAccaVFS(u8, H0 = 32) {
    const sb = (() => { for (let i = 0; i < 4096 && i < u8.length - 8; i++) if (u8[i] === 0x41 && String.fromCharCode(...u8.subarray(i, i + 8)) === 'AASFSSGN') return i; return -1; })();
    if (sb < 0) throw new Error('struttura DCF non riconosciuta (superblocco mancante)');
    const BS = u32(u8, sb + 0x10) || 4096; const NB = Math.floor((u8.length - sb) / BS);
    const block = b => u8.subarray(sb + b * BS, sb + (b + 1) * BS);
    const H = H0; // intestazione di ogni blocco (32 byte); 0 come alternativa per varianti senza intestazione
    const payload = b => block(b).subarray(H);
    const isAACS = b => { const p = payload(b); return p[0] === 0x41 && p[1] === 0x41 && p[2] === 0x43 && p[3] === 0x53; };
    const texts = []; const used = new Set();
    for (let b = 1; b < NB; b++) {
      const p = payload(b); const seq = [];
      for (let o = 0; o + 4 <= p.length; o += 4) { const v = u32(p, o); if (v > 0 && v < NB && !seq.includes(v)) seq.push(v); else break; }
      if (!seq.length || used.has(seq[0]) || !isAACS(seq[0])) continue;
      const data = new Uint8Array(seq.length * (BS - H)); seq.forEach((x, i) => data.set(payload(x), i * (BS - H)));
      const nch = u32(data, 0x0c); let pos = 0x80; const parts = [];
      try {
        for (let c = 0; c < nch; c++) { const comp = u32(data, pos), dec = u32(data, pos + 4); const out = await zinflate(data.subarray(pos + 16, pos + 16 + comp)); if (out.length !== dec) throw new Error('dimensione'); parts.push(out); pos += 16 + comp; }
      } catch (e) { continue; }
      seq.forEach(x => used.add(x));
      texts.push(parts.map(x => new TextDecoder('utf-8').decode(x)).join(''));
    }
    if (!texts.length && H) return readAccaVFS(u8, 0);
    const ep = texts.find(t => /<CollectionEP\b/.test(t)); const dg = texts.find(t => /<DatiGenerali\b/.test(t)) || '';
    if (!ep) throw new Error('elenco prezzi non trovato nel file DCF');
    const caps = {}; for (const k of ['ItemSpCap', 'ItemCap', 'ItemSbCap']) { caps[k] = {}; for (const m of dg.matchAll(new RegExp('<' + k + '\\s([^>]*?)/?>', 'g'))) { const a = attrs(m[1]); if (a.Id && a.Id !== '0') caps[k][a.Id] = (a.Cod ? a.Cod.replace(/^[A-Z]{2,4}\d{2}_/, '') + ' – ' : '') + (a.DesSnt || a.DesEst || ''); } }
    const voci = [];
    for (const m of ep.matchAll(/<ItemEP\s([\s\S]*?)\/>/g)) {
      const a = attrs(m[1]); const p = num(a.Prz1); const c = (a.Trf || a.Art || '').trim();
      if (!c || !isFinite(p) || (p === 0 && !a.UnMsr)) continue; // titoli di gruppo senza prezzo
      const de = (a.DesEst || a.DesRid || '').replace(/\r\n?/g, '\n').trim(); let d = (a.DesRid || '').replace(/\s+/g, ' ').trim();
      if (!d || /\.\.\./.test(d)) { const t = de.replace(/\s+/g, ' '); d = t.length > 220 ? t.slice(0, 217) + '…' : t; }
      const cap = [caps.ItemSpCap[a.IdSpCap], caps.ItemCap[a.IdCap], caps.ItemSbCap[a.IdSbCap]].filter(Boolean).slice(-2).join(' › ');
      voci.push({ c, d, de, u: (a.UnMsr || '').trim(), p: Math.round(p * 10000) / 10000, mo: normMo(num(a.MDOInc)), sic: num(a.SICInc) >= 100 || /sicurezza/i.test(caps.ItemSpCap[a.IdSpCap] || ''), cap: cap || capOf(c) });
    }
    const g = (dg.match(/<DGDatiGenerali\s([^>]*)>/) || [])[1]; const ga = g ? attrs(g) : {};
    voci.meta = { titolo: (ga.DsTrf || '').trim(), fonte: (ga.Ogg || '').replace(/\s+/g, ' ').trim() };
    return voci;
  }
  const DCF_TRIES = 400;
  /** decompressione tollerante: restituisce i dati prodotti anche se dopo il flusso compresso ci sono altri byte */
  async function inflateAt(u8, off, fmt, max = 512e6) {
    try {
      const rd = new Blob([u8.subarray(off)]).stream().pipeThrough(new DecompressionStream(fmt)).getReader(); const parts = []; let n = 0;
      for (;;) { let r; try { r = await rd.read(); } catch (e) { break; } if (r.done) break; parts.push(r.value); n += r.value.length; if (n > max) break; }
      if (n < 64) return null; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
    } catch (e) { return null; }
  }
  const entropy = u8 => { const h = new Array(256).fill(0); const n = Math.min(u8.length, 262144); for (let i = 0; i < n; i++) h[u8[i]]++; return -h.reduce((s, c) => c ? s + c / n * Math.log2(c / n) : s, 0); };
  const hex = u8 => Array.from(u8.subarray(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  /** prova a leggere un blocco di byte come prezzario (XML, ZIP, tabella, SQLite, testo UTF-16) */
  async function fromBytes(u8, depth) {
    const sig = String.fromCharCode(...u8.subarray(0, 16));
    if (sig.startsWith('AAMVHFSS')) return readAccaVFS(u8);
    if (sig.startsWith('PK')) { try { const z = await App.zip.read(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.length)); for (const k of Object.keys(z).sort((x, y) => z[y].length - z[x].length)) { const v = /\.xlsx$/i.test(k) ? parseRows(await xlsxRows(z[k].buffer)) : await fromBytes(z[k], depth + 1); if (validVoci(v)) return v; } } catch (e) { } }
    if (sig.startsWith('SQLite format 3')) {
      const SQL = await App.gisx.sql(); const db = new SQL.Database(u8); try { const tabs = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]; let best = []; for (const [t] of (tabs ? tabs.values : [])) { const r = db.exec(`SELECT * FROM "${String(t).replace(/"/g, '')}" LIMIT 300000`)[0]; if (!r) continue; const v = parseRows([r.columns, ...r.values.map(x => x.map(y => y == null ? '' : String(y)))]); if (validVoci(v) && v.length > best.length) best = v; } if (best.length) return best; } finally { db.close(); }
    }
    let zeros = 0; for (let i = 1; i < Math.min(u8.length, 4000); i += 2) if (u8[i] === 0) zeros++;
    const txt = zeros > 1500 ? new TextDecoder('utf-16le').decode(u8) : decodeText(u8);
    if (readable(txt.slice(0, 4000))) {
      const xi = txt.search(/<\?xml|<PweDocumento|<EPItem|<prezzario|<Prezzario|<PREZZARIO/); if (xi >= 0) { try { const v = parseXML(txt.slice(xi).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')); if (validVoci(v)) return v; } catch (e) { } }
      const v = parseRows(csvParse(txt)); if (validVoci(v)) return v;
    } else {
      // XML non compresso incluso in un contenitore binario
      const raw = new TextDecoder('latin1').decode(u8); const xi = raw.search(/<\?xml|<PweDocumento|<EPItem/);
      if (xi >= 0) { try { const v = parseXML(decodeText(u8.subarray(xi)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')); if (validVoci(v)) return v; } catch (e) { } }
    }
    if (depth >= 3) return null;
    // dati compressi in qualsiasi posizione: gzip, zlib, deflate, archivi ZIP incorporati
    let tries = 0;
    for (let i = 0; i < u8.length - 4 && tries < DCF_TRIES; i++) {
      const b0 = u8[i], b1 = u8[i + 1];
      let fmt = null;
      if (b0 === 0x1f && b1 === 0x8b && u8[i + 2] === 8) fmt = 'gzip';
      else if (b0 === 0x78 && (b0 * 256 + b1) % 31 === 0 && [0x01, 0x5e, 0x9c, 0xda].includes(b1)) fmt = 'deflate';
      else if (b0 === 0x50 && b1 === 0x4b && u8[i + 2] === 3 && u8[i + 3] === 4 && i > 0) { tries++; const v = await fromBytes(u8.slice(i), depth + 1); if (v) return v; continue; }
      if (!fmt) continue; tries++;
      const out = await inflateAt(u8, i, fmt); if (out) { const v = await fromBytes(out, depth + 1); if (v) return v; }
    }
    for (let off = 0; off <= 64 && off < u8.length; off++) { const out = await inflateAt(u8, off, 'deflate-raw', 64e6); if (out && out.length > 256) { const v = await fromBytes(out, depth + 1); if (v) return v; } }
    return null;
  }
  async function readDCF(buf, name) {
    const u8 = new Uint8Array(buf);
    if (/Standard (Jet|ACE) DB/.test(String.fromCharCode(...u8.subarray(0, 32)))) throw new Error('il file DCF è un database Microsoft Access: aprilo con il software di computo ed esportalo in XPWE, XLSX o CSV');
    const v = await fromBytes(u8, 0); if (v) return v;
    const e = new Error('formato DCF non leggibile'); e.dcf = { name, size: u8.length, sig: hex(u8), entropy: entropy(u8) }; throw e;
  }
  A.readPrezzario = async f => {
    const n = f.name.toLowerCase(); const buf = await App.readBuf(f); const u8 = new Uint8Array(buf);
    if (/\.dcf$/.test(n)) return readDCF(buf, f.name);
    if (!/\.(csv|txt|tsv|xlsx|xlsm|xls|xml|six|xpwe|zip|pwe)$/.test(n)) { const v = await fromBytes(u8, 0); if (v) return v; }
    if (u8[0] === 0x50 && u8[1] === 0x4B && !n.endsWith('.xlsx') && !n.endsWith('.zip')) { try { return await parseRows(await xlsxRows(buf)); } catch (e) { /* non è un xlsx */ } }
    if (/\.(xml|six|xpwe)$/.test(n)) return parseXML(decodeText(u8));
    if (/\.(csv|txt|tsv)$/.test(n)) return parseRows(csvParse(decodeText(u8)));
    if (n.endsWith('.xlsx') || n.endsWith('.xlsm')) return parseRows(await xlsxRows(buf));
    if (n.endsWith('.xls')) throw new Error('il vecchio formato Excel .xls non è supportato: apri il file con Excel o LibreOffice e salvalo come .xlsx o .csv');
    if (n.endsWith('.zip')) { const z = await App.zip.read(buf); const ks = Object.keys(z).filter(x => /\.(xml|six|xpwe|csv|xlsx|dcf|txt)$/i.test(x)).sort((a, b) => z[b].length - z[a].length); if (!ks.length) throw new Error('nessun file XML, XPWE, DCF, XLSX o CSV nello ZIP'); return A.readPrezzario(new File([z[ks[0]]], ks[0].split('/').pop())); }
    if (/\.pwe$/.test(n)) throw new Error('i file .PWE sono computi in formato proprietario: esportali in XPWE dal software di computo');
    throw new Error('formato non supportato (usa CSV, XLSX, DCF, XML SIX, XPWE o ZIP)');
  };
  /** rapporto per i file DCF non leggibili: nulla viene importato */
  A.dcfReport = d => {
    const info = `File: ${d.name}\nDimensione: ${d.size.toLocaleString('it-IT')} byte\nFirma (primi 16 byte): ${d.sig}\nEntropia: ${d.entropy.toFixed(2)} bit/byte`;
    return App.modal({ title: 'File DCF non leggibile', size: 'wide', body: `<p style="margin-top:0">Il file <b>${esc(d.name)}</b> non contiene dati in un formato aperto: BeCity ha cercato testo, XML, tabelle, archivi ZIP e dati compressi (gzip, zlib, deflate) in tutto il file senza trovare un elenco prezzi leggibile.${d.entropy > 7.8 ? ' I dati risultano <b>cifrati o compressi con un metodo proprietario</b>.' : ''} Per evitare voci corrotte <b>non è stato importato nulla</b>.</p>
      <div class="disclaimer"><b>Come procedere</b><br>1. Nel software di computo (es. PriMus) apri il prezzario e usa <b>Esporta → XPWE</b> oppure <b>Excel (XLSX)</b>, poi importa quel file in BeCity.<br>2. In alternativa scarica dal sito della Regione la versione <b>XLSX, CSV o XML</b> dello stesso prezzario.<br>3. Per aggiungere a BeCity il supporto di questo tipo di DCF invia all'assistenza i dati qui sotto e, se possibile, il file.</div>
      <pre class="tiny" style="background:var(--panel2);padding:8px;border-radius:4px;white-space:pre-wrap">${esc(info)}</pre>`, actions: [{ label: 'Copia i dettagli', value: 'copy' }, { label: App.t('close'), primary: true, value: null }] })
      .then(r => { if (r === 'copy' && navigator.clipboard) navigator.clipboard.writeText(info); });
  };
  /** scelta delle colonne con anteprima (CSV e XLSX): colonne riconosciute preimpostate e modificabili */
  A.mapColumns = async (f, rows) => {
    if (!rows.length) throw new Error('il file è vuoto');
    const g = A.guessColumns(rows); const nc = Math.min(30, Math.max(...rows.slice(0, 300).map(r => r.length)));
    const L = i => { let t = ''; i++; while (i > 0) { const m = (i - 1) % 26; t = String.fromCharCode(65 + m) + t; i = Math.floor((i - 1) / 26); } return t; };
    const hr = rows[g.start - 1] || [];
    const opts = (sel, none) => (none ? '<option value="-1">(nessuna)</option>' : '') + Array.from({ length: nc }, (_, j) => `<option value="${j}" ${j === sel ? 'selected' : ''}>Colonna ${L(j)}${hr[j] ? ' – ' + esc(String(hr[j]).slice(0, 24)) : ''}</option>`).join('');
    const prev = rows.slice(0, 12).map((r, i) => `<tr><td class="faint">${i + 1}</td>${Array.from({ length: Math.min(nc, 8) }, (_, j) => `<td>${esc(String(r[j] ?? '').slice(0, 40))}</td>`).join('')}</tr>`).join('');
    const body = `<p class="small muted" style="margin-top:0">Controlla le colonne riconosciute in <b>${esc(f.name)}</b> (${rows.length.toLocaleString('it-IT')} righe) e correggile se necessario.</p>
      <div class="grid3"><label class="f"><span>Codice / tariffa</span><select id="mC">${opts(g.c)}</select></label><label class="f"><span>Descrizione</span><select id="mD">${opts(g.d >= 0 ? g.d : g.db)}</select></label><label class="f"><span>Unità di misura</span><select id="mU">${opts(g.u, true)}</select></label><label class="f"><span>Prezzo</span><select id="mP">${opts(g.p)}</select></label><label class="f"><span>% manodopera</span><select id="mM">${opts(g.mo, true)}</select></label><label class="f"><span>Prima riga dei dati</span><input id="mS" type="number" min="1" value="${(g.start || 0) + 1}"></label></div>
      <div style="max-height:30vh;overflow:auto;margin-top:8px"><table class="tbl tiny"><tbody>${prev}</tbody></table></div><div class="small" id="mRes" style="margin-top:8px"></div>`;
    let result = null;
    const read = back => ({ c: +$('#mC', back).value, d: +$('#mD', back).value, db: -1, u: +$('#mU', back).value, p: +$('#mP', back).value, mo: +$('#mM', back).value, start: Math.max(0, (+$('#mS', back).value || 1) - 1) });
    const ok = await App.modal({ title: 'Importa prezzario – colonne', size: 'wide', body, actions: [{ label: App.t('cancel'), value: false }, { label: 'Continua', primary: true, value: back => { result = parseRows(rows, read(back)); return true; } }],
      onOpen: back => { const upd = () => { const v = parseRows(rows, read(back)); $('#mRes', back).innerHTML = v.length ? `<b>${v.length.toLocaleString('it-IT')} voci</b> · esempio: <span class="mono">${esc(v[0].c)}</span> ${esc(v[0].d.slice(0, 80))} – ${eur(v[0].p)}/${esc(v[0].u)}${validVoci(v) ? '' : ' <span class="err">· testo non leggibile: controlla le colonne</span>'}` : '<span class="err">Nessuna voce con queste colonne</span>'; }; $$('select,input', back).forEach(x => { x.onchange = upd; }); upd(); } });
    return ok ? result : null;
  };
  A.importPrezzario = async (regione) => {
    const [f] = await App.pickFiles({ accept: '.csv,.txt,.tsv,.xlsx,.xlsm,.xls,.dcf,.xml,.six,.xpwe,.zip' }); if (!f) return null;
    App.toast(`Lettura di ${f.name}…`); let voci;
    const n = f.name.toLowerCase();
    try {
      if (/\.(csv|txt|tsv|xlsx|xlsm)$/.test(n)) voci = await A.mapColumns(f, /\.(xlsx|xlsm)$/.test(n) ? await xlsxRows(await App.readBuf(f)) : csvParse(decodeText(new Uint8Array(await App.readBuf(f)))));
      else voci = await A.readPrezzario(f);
      if (voci === null) return null;
    } catch (e) {
      if (e.dcf) { A.dcfReport(e.dcf); return null; }
      App.toast('Prezzario non importato: ' + e.message, 'err'); return null;
    }
    if (!voci.length) { App.toast('Nessuna voce riconosciuta nel file', 'err'); return null; }
    if (!validVoci(voci)) { App.toast('Il file non contiene un elenco prezzi leggibile: nessuna voce importata', 'err'); return null; }
    const yr = (f.name.match(/20\d\d/) || [])[0];
    const meta = voci.meta || {}; if (!regione && meta.titolo) regione = REGIONI.find(x => meta.titolo.toLowerCase().includes(x.toLowerCase().replace('provincia autonoma di ', ''))) || regione;
    const r = await App.form('Importa prezzario', [{ type: 'html', html: `<div class="small">${voci.length.toLocaleString('it-IT')} voci lette da <b>${esc(f.name)}</b>. Esempio: <span class="mono">${esc(voci[0].c)}</span> ${esc(voci[0].d.slice(0, 80))} – ${eur(voci[0].p)}/${esc(voci[0].u)}</div>` }, { name: 'regione', label: 'Regione / ente', type: 'select', options: [...REGIONI, 'Altro ente'], value: regione || 'Puglia' }, { name: 'nome', label: 'Nome', value: meta.titolo || `Prezzario regionale ${regione || ''} ${yr || ''}`.replace(/\s+/g, ' ').trim() }, { name: 'anno', label: 'Anno / edizione', type: 'number', value: +yr || new Date().getFullYear() }, { name: 'fonte', label: 'Fonte (atto di approvazione, sito)', value: (meta.fonte || '').slice(0, 300) }], 'Importa');
    if (!r) return null;
    const id = 'pz' + App.uid(); await KV.set(id, voci); cache[id] = voci;
    App.state.prezzari = (App.state.prezzari || []).concat([{ id, nome: r.nome, regione: r.regione, anno: r.anno, fonte: r.fonte, file: f.name, n: voci.length, at: App.now() }]); App.save(); App.audit('prezzario', 'Importato ' + r.nome);
    App.toast(`${voci.length.toLocaleString('it-IT')} voci importate`, 'ok'); return id;
  };

  /* =================== dati del progetto =================== */
  A.data = p => {
    if (!p.acc) p.acc = { prezzario: 'demo', ep: [], cats: [{ id: 'C1', nome: 'Opere edili', soa: 'OG1' }], voci: [], misure: [], sal: [], giornale: [], ordini: [], verbali: [], crono: {}, qe: null };
    const a = p.acc; a.gen = Object.assign({ opera: p.name, committente: p.client || '', luogo: [p.address, p.comune].filter(Boolean).join(', '), cup: '', cig: '', rup: '', progettista: App.user ? App.user.name : '', dl: '', cse: '', impresa: '', ribasso: 0, iva: 10, anticipazione: 20, antErogata: false, ritenuta: .5, sogliaSal: 0, consegna: '', squadra: 4, costoOra: 32, penale: 1, garanzia: 10, durata: 0 }, a.gen || {});
    ['ep', 'cats', 'voci', 'misure', 'sal', 'giornale', 'ordini', 'verbali'].forEach(k => a[k] = a[k] || []); if (!a.cats.length) a.cats.push({ id: 'C1', nome: 'Opere edili', soa: 'OG1' }); a.crono = a.crono || {};
    return a;
  };
  const evalF = s => { if (s === '' || s == null) return null; if (typeof s === 'number') return s; const t = String(s).replace(/,/g, '.').trim(); if (!t) return null; if (!/^[0-9+\-*/().\s^]+$/.test(t)) return NaN; try { const v = App.expr.eval(t); return isFinite(v) ? v : NaN; } catch (e) { return NaN; } };
  A.rowQ = r => { if (r.q !== '' && r.q != null) { const v = evalF(r.q); return isFinite(v) ? v : 0; } const f = ['pu', 'l', 'w', 'h'].map(k => evalF(r[k])).filter(v => v !== null); return f.length ? f.reduce((a, b) => a * (isFinite(b) ? b : 0), 1) : 0; };
  const epOf = (a, id) => a.ep.find(e => e.id === id);
  A.voceQ = v => r2(v.righe.reduce((s, r) => s + A.rowQ(r), 0));
  A.voceImp = (a, v) => { const e = epOf(a, v.ep); return r2(A.voceQ(v) * (e ? e.p : 0)); };
  A.totals = a => { let lav = 0, sic = 0, mo = 0; a.voci.forEach(v => { const e = epOf(a, v.ep); const imp = A.voceImp(a, v); if (e && e.sic) sic += imp; else lav += imp; mo += imp * ((e && e.mo) || 0) / 100; }); return { lav: r2(lav), sic: r2(sic), tot: r2(lav + sic), mo: r2(mo) }; };
  A.catTot = (a, cid) => r2(a.voci.filter(v => v.cat === cid).reduce((s, v) => s + A.voceImp(a, v), 0));
  const newRow = (o = {}) => Object.assign({ id: App.uid(), d: '', pu: '', l: '', w: '', h: '', q: '' }, o);
  A.ensureEP = (a, v, src) => { let e = a.ep.find(x => x.c === v.c && x.src === src); if (!e) { e = { id: App.uid(), c: v.c, d: v.d, de: v.de || v.d, u: v.u, p: r2(v.p), mo: v.mo || 0, sic: !!v.sic, src }; a.ep.push(e); } return e; };
  A.addVoce = (a, ep, cat, righe) => { const v = { id: App.uid(), ep: ep.id, cat: cat || (a.cats[0] || {}).id, righe: righe && righe.length ? righe : [newRow()] }; a.voci.push(v); return v; };

  /* ---------- quadro economico (D.Lgs. 36/2023, Allegato I.7) ---------- */
  const QE0 = () => [
    { k: 'b1', d: 'Lavori in economia previsti in progetto ed esclusi dall\'appalto', m: 'val', v: 0 },
    { k: 'b2', d: 'Rilievi, accertamenti e indagini', m: 'val', v: 0 },
    { k: 'b3', d: 'Allacciamenti ai pubblici servizi', m: 'val', v: 0 },
    { k: 'b4', d: 'Imprevisti', m: 'pct', v: 5, base: 'A' },
    { k: 'b5', d: 'Acquisizione aree o immobili e pertinenti indennizzi', m: 'val', v: 0 },
    { k: 'b6', d: 'Accantonamento per revisione prezzi (art. 60)', m: 'pct', v: 1, base: 'A' },
    { k: 'b7', d: 'Spese tecniche: progettazione, direzione lavori, coordinamento sicurezza, collaudo', m: 'pct', v: 10, base: 'A' },
    { k: 'b8', d: 'Contributi previdenziali sulle spese tecniche', m: 'pct', v: 4, base: 'b7' },
    { k: 'b9', d: 'Incentivi per funzioni tecniche (art. 45)', m: 'pct', v: 2, base: 'A' },
    { k: 'b10', d: 'Spese per commissioni giudicatrici, pubblicità e contributo ANAC', m: 'val', v: 0 },
    { k: 'b11', d: 'Accertamenti di laboratorio, verifiche tecniche e collaudi specialistici', m: 'val', v: 0 },
    { k: 'b12', d: 'IVA sui lavori', m: 'pct', v: 10, base: 'A' },
    { k: 'b13', d: 'IVA su spese tecniche e contributi', m: 'pct', v: 22, base: 'b7b8' }];
  A.qe = (a, post) => {
    const t = A.totals(a); const lav = post ? r2(t.lav * (1 - (a.gen.ribasso || 0) / 100)) : t.lav; const Atot = r2(lav + t.sic);
    const rows = a.qe = a.qe || QE0(); const val = {}; const baseOf = b => b === 'A' ? Atot : b === 'b7b8' ? (val.b7 || 0) + (val.b8 || 0) : (val[b] || 0);
    rows.forEach(r => { val[r.k] = r2(r.m === 'pct' ? baseOf(r.base || 'A') * r.v / 100 : +r.v || 0); });
    const B = r2(rows.reduce((s, r) => s + val[r.k], 0)); return { lav, sic: t.sic, A: Atot, rows, val, B, tot: r2(Atot + B), economie: post ? r2(t.lav - lav) : 0 };
  };

  /* ---------- contabilità ---------- */
  A.salCalc = (a, n) => {
    let lav = 0, sic = 0; a.misure.filter(m => m.sal && m.sal <= n).forEach(m => { const v = a.voci.find(x => x.id === m.voce); const e = v && epOf(a, v.ep); if (!e) return; const imp = r2(A.rowQ(m) * e.p); if (e.sic) sic += imp; else lav += imp; });
    const g = a.gen; lav = r2(lav); sic = r2(sic); const rib = r2(lav * (g.ribasso || 0) / 100); const netto = r2(lav - rib + sic); const rit = r2(netto * (g.ritenuta ?? .5) / 100); const ant = g.antErogata ? r2(netto * (g.anticipazione || 0) / 100) : 0;
    const cert = r2(netto - rit - ant); return { lav, rib, sic, netto, rit, ant, cert };
  };
  A.salPay = (a, n) => { const c = A.salCalc(a, n), p = n > 1 ? A.salCalc(a, n - 1) : { cert: 0 }; const q = r2(c.cert - p.cert); return Object.assign(c, { prec: p.cert, questo: q, iva: r2(q * (a.gen.iva || 0) / 100), totale: r2(q * (1 + (a.gen.iva || 0) / 100)) }); };
  A.qContab = (a, vid, n) => r2(a.misure.filter(m => m.voce === vid && (n == null || (m.sal && m.sal <= n))).reduce((s, m) => s + A.rowQ(m), 0));

  /* ---------- fasi dell'opera ---------- */
  const FASI = [['prog', 'Progetto', 'comp'], ['aff', 'Affidamento', 'gen'], ['cons', 'Consegna lavori', 'verb'], ['exe', 'Esecuzione e SAL', 'salv'], ['ult', 'Ultimazione', 'verb'], ['coll', 'Collaudo / CRE', 'fin']];
  A.fasi = a => { const has = t => a.verbali.some(v => v.tipo === t); return { prog: a.voci.length > 0, aff: !!a.gen.impresa, cons: has('consegna'), exe: a.sal.length > 0, ult: has('ultimazione'), coll: has('cre') }; };

  /* ---------- cronoprogramma ---------- */
  A.crono = a => {
    const g = a.gen, perDay = Math.max(1, (g.squadra || 4) * 8 * (g.costoOra || 32)); let cur = 0;
    return a.cats.map(c => { const imp = A.catTot(a, c.id); const mo = r2(a.voci.filter(v => v.cat === c.id).reduce((s, v) => { const e = epOf(a, v.ep); return s + A.voceImp(a, v) * ((e && e.mo) || 0) / 100; }, 0)); const auto = Math.max(imp > 0 ? 3 : 0, Math.ceil(mo / perDay)); const o = a.crono[c.id] || {}; const dur = o.dur ?? auto; const start = o.start ?? cur; cur = Math.max(cur, start + Math.ceil(dur * .8)); return { c, imp, mo, dur, start, auto }; });
  };
  A.durata = a => { const r = A.crono(a); return r.length ? Math.max(0, ...r.map(x => x.start + x.dur)) : 0; };
  const addDays = (d, n) => { if (!d) return ''; const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const fdt = d => d ? new Date(d).toLocaleDateString('it-IT') : '—';

  /* =================== interoperabilità: XPWE =================== */
  const xe = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  A.exportXPWE = a => {
    const g = a.gen; const epI = new Map(a.ep.map((e, i) => [e.id, i + 1])); const catI = new Map(a.cats.map((c, i) => [c.id, i + 1]));
    const x = `<?xml version="1.0" encoding="UTF-8"?>\n<PweDocumento><CopyRight>BeCity</CopyRight><TipoDocumento>1</TipoDocumento><TipoFormato>XMLPwe</TipoFormato>
<PweDatiGenerali><PweDGProgetto><PweDGDatiGenerali><Oggetto>${xe(g.opera)}</Oggetto><Committente>${xe(g.committente)}</Committente><Impresa>${xe(g.impresa)}</Impresa><Comune>${xe(g.luogo)}</Comune></PweDGDatiGenerali></PweDGProgetto>
<PweDGCapitoliCategorie><PweDGSuperCategorie>${a.cats.map(c => `<DGSuperCategorieItem ID="${catI.get(c.id)}"><DesSintetica>${xe(c.nome)}</DesSintetica><DesEstesa>${xe(c.soa || '')}</DesEstesa></DGSuperCategorieItem>`).join('')}</PweDGSuperCategorie></PweDGCapitoliCategorie></PweDatiGenerali>
<PweMisurazioni><PweElencoPrezzi>${a.ep.map(e => `<EPItem ID="${epI.get(e.id)}"><TipoEP>0</TipoEP><Tariffa>${xe(e.c)}</Tariffa><DesRidotta>${xe(e.d)}</DesRidotta><DesEstesa>${xe(e.de || e.d)}</DesEstesa><UnMisura>${xe(e.u)}</UnMisura><Prezzo1>${e.p}</Prezzo1><IncSIC>${e.sic ? 100 : 0}</IncSIC><IncMDO>${e.mo || 0}</IncMDO></EPItem>`).join('')}</PweElencoPrezzi>
<PweVociComputo>${a.voci.map((v, i) => `<VCItem ID="${i + 1}"><IDEP>${epI.get(v.ep)}</IDEP><Quantita>${A.voceQ(v)}</Quantita><IDSpCat>${catI.get(v.cat) || 0}</IDSpCat><PweVCMisure>${v.righe.map((r, j) => `<RGItem ID="${j + 1}"><Descrizione>${xe(r.d)}</Descrizione><PartiUguali>${xe(r.pu)}</PartiUguali><Lunghezza>${xe(r.l)}</Lunghezza><Larghezza>${xe(r.w)}</Larghezza><HPeso>${xe(r.h)}</HPeso><Quantita>${r2(A.rowQ(r))}</Quantita></RGItem>`).join('')}</PweVCMisure></VCItem>`).join('')}</PweVociComputo></PweMisurazioni></PweDocumento>`;
    return x;
  };
  A.importXPWE = (a, txt) => {
    const doc = new DOMParser().parseFromString(txt, 'application/xml'); if (doc.querySelector('parsererror')) throw new Error('XML non valido');
    const by = (el, n) => [...el.getElementsByTagName('*')].filter(e => e.localName.toLowerCase() === n.toLowerCase()); const t = (el, n) => { const c = [...el.children].find(x => x.localName.toLowerCase() === n.toLowerCase()); return c ? c.textContent.trim() : ''; };
    const cats = {}; by(doc, 'DGSuperCategorieItem').forEach(c => { const n = { id: App.uid(), nome: t(c, 'DesSintetica') || 'Categoria', soa: '' }; a.cats.push(n); cats[c.getAttribute('ID')] = n.id; });
    const eps = {}; parseXML(txt).forEach(v => { const e = A.ensureEP(a, v, 'XPWE'); eps[v.xid] = e.id; });
    let nv = 0; by(doc, 'VCItem').forEach(vc => { const ep = eps[t(vc, 'IDEP')]; if (!ep) return; const righe = by(vc, 'RGItem').map(rg => { const r = newRow({ d: t(rg, 'Descrizione'), pu: t(rg, 'PartiUguali'), l: t(rg, 'Lunghezza'), w: t(rg, 'Larghezza'), h: t(rg, 'HPeso') }); if (!r.pu && !r.l && !r.w && !r.h && t(rg, 'Quantita')) r.q = t(rg, 'Quantita'); return r; }).filter(r => r.d || r.pu || r.l || r.w || r.h || r.q); if (!righe.length) righe.push(newRow({ d: 'Quantità importata', q: t(vc, 'Quantita') })); A.addVoce(a, { id: ep }, cats[t(vc, 'IDSpCat')] || a.cats[0].id, righe); nv++; });
    return nv;
  };

  /* =================== integrazione con BIM, CAD e GIS =================== */
  const shoelace = pts => { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; } return Math.abs(s / 2); };
  const plen = (pts, closed) => { let s = 0; for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += Math.hypot(q[0] - p[0], q[1] - p[1]); } return s; };
  const toM = (c, lat0) => [c[0] * 111320 * Math.cos(lat0 * Math.PI / 180), c[1] * 110574];
  let bimM = null; const bimModel = async () => bimM || (bimM = (await App.loadBIM()).model);
  /** sorgenti: restituiscono gruppi { key, label, unit, items: [{ id, d, q }] } */
  A.sources = {
    async bim(p) {
      if (!p.bim || !p.bim.elements.length) return [];
      const M = await bimModel(); const groups = {};
      p.bim.elements.forEach(e => { if (e.type === 'grid') return; let q; try { q = M.quantities(p.bim, e); } catch (err) { return; } const tl = (M.TYPES[e.type] || {}).label || e.type; Object.entries(q).filter(([, v]) => typeof v === 'number' && v > 0).forEach(([k, v]) => { const key = e.type + ':' + k; (groups[key] = groups[key] || { key, type: e.type, label: `${tl} – ${k.replace(/_/g, ' ')}`, f: k, items: [] }).items.push({ id: e.id, d: `${e.name || tl} · ${q.livello || ''}`.trim(), q: r2(v) }); }); groups['n:' + e.type] = groups['n:' + e.type] || { key: 'n:' + e.type, type: e.type, label: `${tl} – numero`, f: 'n', items: [] }; groups['n:' + e.type].items.push({ id: e.id, d: e.name || tl, q: 1 }); });
      return Object.values(groups);
    },
    cad(p) {
      const groups = {}; const add = (key, label, f, it) => (groups[key] = groups[key] || { key, label, f, items: [] }).items.push(it);
      (p.drawing.entities || []).forEach(e => {
        if (e.type === 'room') { add('room:a', 'Locali (stanze) – superficie', 'area', { id: e.id, d: e.name || 'Locale', q: r2(shoelace(e.pts)) }); add('room:p', 'Locali (stanze) – perimetro', 'perim', { id: e.id, d: e.name || 'Locale', q: r2(plen(e.pts, true)) }); if (e.h) add('room:w', 'Locali – superficie pareti (perimetro × altezza)', 'pareti', { id: e.id, d: e.name || 'Locale', q: r2(plen(e.pts, true) * e.h) }); }
        else if (e.type === 'wall') { const L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1); const k = (e.material || 'Muro') + ' sp. ' + nf((e.thk || 0) * 100, 0) + ' cm'; add('wall:a:' + k, `Muri ${k} – superficie (L × H)`, 'wallA', { id: e.id, d: `Muro L ${nf(L)} m`, q: r2(L * (e.h || 3)) }); add('wall:l:' + k, `Muri ${k} – lunghezza`, 'len', { id: e.id, d: 'Muro', q: r2(L) }); }
        else if (e.type === 'pline' && e.pts && e.pts.length > 2 && e.closed) add('pa:' + e.layer, `Layer ${e.layer} – area polilinee chiuse`, 'area', { id: e.id, d: e.layer, q: r2(shoelace(e.pts)) });
        else if (e.type === 'pline' && e.pts) add('pl:' + e.layer, `Layer ${e.layer} – lunghezza polilinee`, 'len', { id: e.id, d: e.layer, q: r2(plen(e.pts, false)) });
        else if (e.type === 'line') add('ln:' + e.layer, `Layer ${e.layer} – lunghezza linee`, 'len', { id: e.id, d: e.layer, q: r2(Math.hypot(e.x2 - e.x1, e.y2 - e.y1)) });
        else if (e.type === 'insert') add('bl:' + e.name, `Blocco ${e.name} – numero`, 'n', { id: e.id, d: e.name, q: 1 });
        else if (e.type === 'door' || e.type === 'window') add(e.type, e.type === 'door' ? 'Porte – numero' : 'Finestre – numero', 'n', { id: e.id, d: e.type === 'door' ? 'Porta' : 'Finestra', q: 1 });
      });
      return Object.values(groups);
    },
    gis(p) {
      const groups = {}; const lat0 = (p.origin || {}).lat || 41;
      (p.gis.layers || []).filter(l => l.type === 'vector').forEach(l => {
        const nm = f => { const pr = f.properties || {}; const s = Object.values(pr).find(v => typeof v === 'string' && v.length < 60); return s || ('Feature ' + (l.features.indexOf(f) + 1)); };
        l.features.forEach(f => { const g = f.geometry; if (!g) return; const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
          if (polys.length) { const a = polys.reduce((s, pl) => s + shoelace(pl[0].map(c => toM(c, lat0))) - pl.slice(1).reduce((h, r) => h + shoelace(r.map(c => toM(c, lat0))), 0), 0); (groups['a:' + l.id] = groups['a:' + l.id] || { key: 'a:' + l.id, label: `${l.name} – area`, f: 'area', layer: l.id, items: [] }).items.push({ id: f.id, d: nm(f), q: r2(a) }); }
          if (lines.length) { const L = lines.reduce((s, ln) => s + plen(ln.map(c => toM(c, lat0)), false), 0); (groups['l:' + l.id] = groups['l:' + l.id] || { key: 'l:' + l.id, label: `${l.name} – lunghezza`, f: 'len', layer: l.id, items: [] }).items.push({ id: f.id, d: nm(f), q: r2(L) }); }
          if (/Point/.test(g.type)) (groups['n:' + l.id] = groups['n:' + l.id] || { key: 'n:' + l.id, label: `${l.name} – numero`, f: 'n', layer: l.id, items: [] }).items.push({ id: f.id, d: nm(f), q: 1 });
          Object.entries(f.properties || {}).filter(([k, v]) => typeof v === 'number' && /vol|area|sup|lung|quant|mq|mc|m3|m2/i.test(k)).forEach(([k, v]) => { (groups['f:' + l.id + ':' + k] = groups['f:' + l.id + ':' + k] || { key: 'f:' + l.id + ':' + k, label: `${l.name} – campo ${k}`, f: 'attr:' + k, layer: l.id, items: [] }).items.push({ id: f.id, d: nm(f), q: r2(v) }); });
        });
      });
      return Object.values(groups);
    }
  };
  const SUGG = { wall: 'MUR.01.002', slab: 'CLS.04.001', column: 'CLS.01.003', beam: 'CLS.01.003', roof: 'COP.01.001', door: 'SER.02.001', window: 'SER.01.001', space: 'PAV.02.001', curtain: 'SER.01.002', rail: 'SER.03.002', stair: 'CLS.01.003', mass: 'CLS.01.003' };
  A.importFrom = async (src, p, a, onDone) => {
    const groups = await A.sources[src](p);
    if (!groups.length) { App.toast({ bim: 'Il modello BIM è vuoto: modella o genera l\'edificio nell\'applicazione BIM', cad: 'Il disegno CAD non contiene muri, locali, polilinee o blocchi misurabili', gis: 'Nessun layer vettoriale con geometrie misurabili' }[src], 'warn'); return; }
    const voci = await A.voci(a.prezzario); const codes = new Set(voci.map(v => v.c));
    const pref = { bim: ['area_netta', 'area', 'superficie', 'volume', 'lunghezza'], cad: [], gis: [] }[src];
    const sorted = groups.slice().sort((x, y) => (pref.indexOf(x.f) < 0 ? 99 : pref.indexOf(x.f)) - (pref.indexOf(y.f) < 0 ? 99 : pref.indexOf(y.f)));
    const seenType = new Set();
    const body = `<p class="small muted" style="margin-top:0">Scegli le quantità da portare nel computo e la voce di elenco prezzi (codice del prezzario attivo o dell'elenco prezzi). Le righe restano <b>collegate</b> al modello: con “Aggiorna quantità collegate” vengono ricalcolate.</p>
      <div class="row" style="margin-bottom:8px"><span class="small">Categoria di destinazione</span><select id="iCat" style="width:auto">${a.cats.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
      <datalist id="iCodes">${[...a.ep.map(e => e.c), ...voci.slice(0, 3000).map(v => v.c)].map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <div style="max-height:52vh;overflow:auto"><table class="tbl"><thead><tr><th></th><th>Quantità dal modello</th><th class="num">Elementi</th><th class="num">Totale</th><th>Voce (codice)</th></tr></thead><tbody>${sorted.map((g, i) => { const first = g.type && !seenType.has(g.type) && seenType.add(g.type); const sug = g.type && first ? SUGG[g.type] || '' : ''; return `<tr><td><input type="checkbox" data-g="${i}" ${sug && codes.has(sug) ? 'checked' : ''}></td><td>${esc(g.label)}</td><td class="num">${g.items.length}</td><td class="num">${nf(g.items.reduce((s, x) => s + x.q, 0))}</td><td><input list="iCodes" data-c="${i}" value="${esc(sug)}" style="width:150px;padding:3px 6px" placeholder="codice"></td></tr>`; }).join('')}</tbody></table></div>`;
    const res = await App.modal({ title: { bim: 'Quantità dal modello BIM', cad: 'Quantità dal disegno CAD', gis: 'Quantità dai layer GIS' }[src], size: 'wide', body, actions: [{ label: App.t('cancel'), value: null }, { label: 'Importa nel computo', primary: true, value: back => ({ cat: $('#iCat', back).value, sel: $$('[data-g]', back).filter(c => c.checked).map(c => ({ g: sorted[+c.dataset.g], code: $(`[data-c="${c.dataset.g}"]`, back).value.trim() })) }) }] });
    if (!res || !res.sel.length) return;
    let n = 0, miss = [];
    for (const s of res.sel) {
      let ep = a.ep.find(e => e.c === s.code); if (!ep) { const pv = voci.find(v => v.c === s.code); if (pv) ep = A.ensureEP(a, pv, (A.list().find(x => x.id === a.prezzario) || {}).nome || 'Prezzario'); }
      if (!ep) { miss.push(s.code || s.g.label); continue; }
      A.addVoce(a, ep, res.cat, s.g.items.map(it => newRow({ d: it.d, q: String(it.q), link: { src, id: it.id, f: s.g.f, layer: s.g.layer } }))); n++;
    }
    App.touch(p); App.audit('computo', `Importate ${n} voci da ${src.toUpperCase()}`);
    if (miss.length) App.toast('Codici non trovati: ' + miss.join(', '), 'warn'); else App.toast(`${n} voci importate dal ${src.toUpperCase()}`, 'ok');
    onDone && onDone();
  };
  A.refreshLinks = async (p, a) => {
    const idx = {}; for (const src of ['bim', 'cad', 'gis']) { const groups = await A.sources[src](p); groups.forEach(g => g.items.forEach(it => { idx[`${src}|${it.id}|${g.f}`] = it.q; })); }
    let upd = 0, gone = 0; a.voci.forEach(v => v.righe.forEach(r => { if (!r.link) return; const q = idx[`${r.link.src}|${r.link.id}|${r.link.f}`]; if (q == null) { if (!r.orfana) { r.orfana = true; gone++; } return; } r.orfana = false; if (String(q) !== String(r.q)) { r.q = String(q); upd++; } }));
    App.touch(p); return { upd, gone };
  };

  /* =================== stampe e documenti =================== */
  A.printHTML = (title, html) => {
    const w = window.open('', '_blank'); if (!w) { App.toast('Consenti le finestre popup per stampare', 'warn'); return; }
    w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:14mm}body{font:11px Helvetica,Arial,sans-serif;color:#111;margin:0}h1{font-size:17px;margin:0 0 4px}h2{font-size:13px;margin:16px 0 6px}.hd{border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:10px}.hd small{color:#555}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:3px 5px;vertical-align:top}th{background:#e9eef5;font-size:10px;text-transform:uppercase}td.n{text-align:right;white-space:nowrap}.cat td{background:#fff5d1;font-weight:700}.som td{font-weight:700;background:#f4f6f9}.mis td{color:#333;font-style:italic;border-top:0;border-bottom:0}.cod{font-weight:700;color:#0b4ea2}.tot td{background:#111;color:#fff;font-weight:700}.foot{margin-top:24px;display:flex;justify-content:space-between}.foot div{width:40%;border-top:1px solid #111;padding-top:4px;text-align:center}</style></head><body>${html}<script>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  };
  const hdr = (a, title) => `<div class="hd"><h1>${esc(title)}</h1><small>${esc(a.gen.opera)} · ${esc(a.gen.luogo || '')}${a.gen.committente ? ' · Committente: ' + esc(a.gen.committente) : ''}${a.gen.cup ? ' · CUP ' + esc(a.gen.cup) : ''}${a.gen.cig ? ' · CIG ' + esc(a.gen.cig) : ''}</small></div>`;
  const firme = a => `<div class="foot"><div>Il progettista<br>${esc(a.gen.progettista || '')}</div><div>Il RUP<br>${esc(a.gen.rup || '')}</div></div>`;
  A.computoHTML = (a, { estimativo = true } = {}) => {
    const t = A.totals(a); let n = 0;
    const body = a.cats.map(c => { const vs = a.voci.filter(v => v.cat === c.id); if (!vs.length) return ''; return `<tr class="cat"><td colspan="${estimativo ? 10 : 8}">${esc(c.nome)}${c.soa ? ' (' + esc(c.soa) + ')' : ''}</td></tr>` + vs.map(v => { const e = epOf(a, v.ep) || {}; n++; return `<tr><td class="n">${n}</td><td class="cod">${esc(e.c)}</td><td colspan="${estimativo ? 8 : 6}"><b>${esc(e.d)}</b>${e.de && e.de !== e.d ? '<br>' + esc(e.de) : ''}</td></tr>` + v.righe.map(r => `<tr class="mis"><td></td><td></td><td>${esc(r.d)}</td><td class="n">${esc(r.pu)}</td><td class="n">${esc(r.l)}</td><td class="n">${esc(r.w)}</td><td class="n">${esc(r.h)}</td><td class="n">${nf(A.rowQ(r))}</td>${estimativo ? '<td></td><td></td>' : ''}</tr>`).join('') + `<tr class="som"><td></td><td></td><td>SOMMANO ${esc(e.u)}</td><td></td><td></td><td></td><td></td><td class="n">${nf(A.voceQ(v))}</td>${estimativo ? `<td class="n">${nf(e.p)}</td><td class="n">${nf(A.voceImp(a, v))}</td>` : ''}</tr>`; }).join('') + (estimativo ? `<tr class="som"><td colspan="9">Totale ${esc(c.nome)}</td><td class="n">${nf(A.catTot(a, c.id))}</td></tr>` : ''); }).join('');
    return hdr(a, estimativo ? 'Computo metrico estimativo' : 'Computo metrico') + `<table><thead><tr><th>N.</th><th>Tariffa</th><th>Designazione dei lavori</th><th>Par.ug.</th><th>Lung.</th><th>Larg.</th><th>H/peso</th><th>Quantità</th>${estimativo ? '<th>Prezzo unit.</th><th>Importo</th>' : ''}</tr></thead><tbody>${body}</tbody>${estimativo ? `<tfoot><tr class="som"><td colspan="9">Lavori soggetti a ribasso</td><td class="n">${nf(t.lav)}</td></tr><tr class="som"><td colspan="9">Costi della sicurezza (non soggetti a ribasso)</td><td class="n">${nf(t.sic)}</td></tr><tr class="tot"><td colspan="9">TOTALE LAVORI</td><td class="n">${nf(t.tot)}</td></tr></tfoot>` : ''}</table>` + firme(a);
  };
  A.epHTML = a => hdr(a, 'Elenco prezzi unitari') + `<table><thead><tr><th>N.</th><th>Tariffa</th><th>Descrizione</th><th>U.M.</th><th>Prezzo €</th><th>% MO</th></tr></thead><tbody>${a.ep.map((e, i) => `<tr><td class="n">${i + 1}</td><td class="cod">${esc(e.c)}</td><td>${esc(e.de || e.d)}${e.np ? ' <b>(Nuovo prezzo)</b>' : ''}<br><small>${esc(e.src || '')}</small></td><td>${esc(e.u)}</td><td class="n">${nf(e.p)}</td><td class="n">${nf(e.mo || 0)}</td></tr>`).join('')}</tbody></table>` + firme(a);
  A.qeHTML = a => { const q = A.qe(a, false), qp = A.qe(a, true); const row = (k, d, v1, v2, cls = '') => `<tr class="${cls}"><td>${k}</td><td>${esc(d)}</td><td class="n">${nf(v1)}</td><td class="n">${nf(v2)}</td></tr>`;
    return hdr(a, 'Quadro economico dell\'intervento') + `<p><small>Articolazione secondo il D.Lgs. 36/2023, Allegato I.7. Colonna “post-aggiudicazione” con ribasso del ${nf(a.gen.ribasso)}%.</small></p><table><thead><tr><th></th><th>Descrizione</th><th>Progetto €</th><th>Post-aggiudicazione €</th></tr></thead><tbody>${row('A', 'LAVORI', '', '', 'cat')}${row('a.1', 'Lavori (soggetti a ribasso)', q.lav, qp.lav)}${row('a.2', 'Costi della sicurezza non soggetti a ribasso', q.sic, qp.sic)}${row('', 'Totale lavori (A)', q.A, qp.A, 'som')}${row('B', 'SOMME A DISPOSIZIONE DELLA STAZIONE APPALTANTE', '', '', 'cat')}${q.rows.map(r => row(r.k.replace('b', 'b.'), r.d + (r.m === 'pct' ? ` (${nf(r.v)}%)` : ''), q.val[r.k], qp.val[r.k])).join('')}${row('', 'Totale somme a disposizione (B)', q.B, qp.B, 'som')}${qp.economie ? row('', 'Economie da ribasso d\'asta', 0, qp.economie) : ''}${row('', 'TOTALE INTERVENTO (A + B)', q.tot, qp.tot + qp.economie, 'tot')}</tbody></table>` + firme(a); };
  A.capitolato = a => {
    const g = a.gen, t = A.totals(a); const cats = a.cats.map(c => ({ c, imp: A.catTot(a, c.id) })).filter(x => x.imp > 0); const prev = cats.slice().sort((x, y) => y.imp - x.imp)[0]; const dur = g.durata || A.durata(a);
    const B = [{ t: 'h1', text: `Capitolato speciale d'appalto – ${g.opera}` }, { t: 'small', text: 'Bozza generata automaticamente dai dati di progetto: da verificare e completare a cura del progettista e del RUP. Riferimenti normativi: D.Lgs. 36/2023 e allegati; D.Lgs. 81/2008.' },
      { t: 'h2', text: 'PARTE I – DEFINIZIONE TECNICA ED ECONOMICA DELL\'APPALTO' },
      { t: 'p', text: `Art. 1 – Oggetto dell'appalto. L'appalto ha per oggetto l'esecuzione di tutti i lavori e le forniture necessari per la realizzazione dell'intervento “${g.opera}”${g.luogo ? ', in ' + g.luogo : ''}${g.cup ? ' (CUP ' + g.cup + ')' : ''}${g.cig ? ' (CIG ' + g.cig + ')' : ''}, secondo gli elaborati del progetto esecutivo.` },
      { t: 'p', text: `Art. 2 – Ammontare dell'appalto. L'importo complessivo dei lavori ammonta a ${eur(t.tot)}, di cui ${eur(t.lav)} per lavori soggetti a ribasso e ${eur(t.sic)} per costi della sicurezza non soggetti a ribasso. L'incidenza stimata della manodopera è pari a ${eur(t.mo)} (${nf(t.lav ? t.mo / t.tot * 100 : 0)}%).` },
      { t: 'table', rows: [['Categoria', 'Classificazione', 'Importo €', '%'], ...cats.map(x => [x.c.nome, x.c.soa || '—', nf(x.imp), nf(x.imp / (t.tot || 1) * 100)]), ['Totale', '', nf(t.tot), '100,00']] },
      { t: 'p', text: `Art. 3 – Modalità di stipulazione. Il contratto è stipulato “a misura”: il corrispettivo è determinato applicando i prezzi dell'elenco prezzi, al netto del ribasso offerto, alle quantità effettivamente eseguite e contabilizzate.` },
      { t: 'p', text: `Art. 4 – Categorie dei lavori. La categoria prevalente è ${prev ? `${prev.c.soa || prev.c.nome} (${eur(prev.imp)})` : 'da definire'}; le ulteriori categorie sono indicate nella tabella dell'art. 2.` },
      { t: 'p', text: 'Art. 5 – Documenti che fanno parte del contratto. Capitolato generale (per quanto applicabile), presente capitolato speciale, elaborati grafici, elenco prezzi unitari, piano di sicurezza e coordinamento, cronoprogramma, polizze di garanzia.' },
      { t: 'h2', text: 'PARTE II – ESECUZIONE DEI LAVORI' },
      { t: 'p', text: `Art. 6 – Consegna e inizio dei lavori. ${g.consegna ? `La consegna è prevista per il ${fdt(g.consegna)}.` : 'La consegna avviene con apposito verbale redatto dal direttore dei lavori.'} L'esecutore inizia i lavori entro il termine indicato nel verbale di consegna.` },
      { t: 'p', text: `Art. 7 – Termini per l'ultimazione. Il tempo utile per ultimare tutti i lavori è fissato in ${dur} giorni naturali e consecutivi decorrenti dalla data del verbale di consegna, secondo il cronoprogramma allegato.` },
      { t: 'p', text: `Art. 8 – Penali. Per ogni giorno naturale e consecutivo di ritardo nell'ultimazione è applicata una penale pari al ${nf(g.penale, 1)} per mille dell'ammontare netto contrattuale, nei limiti previsti dall'art. 126 del D.Lgs. 36/2023 (complessivamente non superiore al 10%).` },
      { t: 'p', text: `Art. 9 – Sospensioni e riprese. Sono disciplinate dall'art. 121 del D.Lgs. 36/2023 e documentate con verbali di sospensione e di ripresa.` },
      { t: 'h2', text: 'PARTE III – DISCIPLINA ECONOMICA' },
      { t: 'p', text: `Art. 10 – Anticipazione. È prevista la corresponsione dell'anticipazione del prezzo pari al ${nf(g.anticipazione, 0)}% dell'importo contrattuale, ai sensi dell'art. 125 del D.Lgs. 36/2023, previa costituzione della relativa garanzia.` },
      { t: 'p', text: `Art. 11 – Pagamenti in acconto. Sono emessi stati di avanzamento lavori ${g.sogliaSal ? `ogni qualvolta il credito dell'esecutore, al netto del ribasso e delle ritenute, raggiunga ${eur(g.sogliaSal)}` : 'con la cadenza stabilita dal contratto'}. Sull'importo netto progressivo è operata una ritenuta dello ${nf(g.ritenuta)}% a garanzia, svincolata in sede di liquidazione finale.` },
      { t: 'p', text: 'Art. 12 – Conto finale. Il conto finale è redatto dal direttore dei lavori entro i termini di legge successivi all\'ultimazione dei lavori, accertata con apposito certificato.' },
      { t: 'p', text: 'Art. 13 – Revisione dei prezzi. Si applicano le clausole di revisione dei prezzi previste dall\'art. 60 del D.Lgs. 36/2023.' },
      { t: 'p', text: `Art. 14 – Garanzia definitiva. L'esecutore costituisce la garanzia definitiva prevista dall'art. 117 del D.Lgs. 36/2023 (${nf(g.garanzia, 0)}% dell'importo contrattuale, salvo incrementi e riduzioni di legge).` },
      { t: 'p', text: 'Art. 15 – Subappalto. Ammesso nei limiti e alle condizioni dell\'art. 119 del D.Lgs. 36/2023.' },
      { t: 'p', text: 'Art. 16 – Sicurezza. L\'esecutore è tenuto al rispetto del D.Lgs. 81/2008 e del piano di sicurezza e coordinamento; i costi della sicurezza non sono soggetti a ribasso.' },
      { t: 'p', text: 'Art. 17 – Collaudo / certificato di regolare esecuzione. Il collaudo o il certificato di regolare esecuzione è emesso nei termini di legge (art. 116 D.Lgs. 36/2023).' },
      { t: 'h2', text: 'PARTE IV – PRESCRIZIONI TECNICHE: QUALITÀ DEI MATERIALI E MODALITÀ DI ESECUZIONE' },
      ...a.cats.flatMap(c => { const vs = a.voci.filter(v => v.cat === c.id); if (!vs.length) return []; const eps = [...new Set(vs.map(v => v.ep))].map(id => epOf(a, id)).filter(Boolean); return [{ t: 'h2', text: c.nome }, ...eps.map(e => ({ t: 'li', text: `${e.c} – ${e.de || e.d} (misurazione in ${e.u}).` }))]; })];
    return B;
  };
  A.verbaleBlocks = (a, v) => {
    const g = a.gen, T = { consegna: 'Verbale di consegna dei lavori', sospensione: 'Verbale di sospensione dei lavori', ripresa: 'Verbale di ripresa dei lavori', ultimazione: 'Certificato di ultimazione dei lavori', cre: 'Certificato di regolare esecuzione', altro: 'Verbale' };
    const txt = { consegna: `In data ${fdt(v.data)} il direttore dei lavori ${g.dl || '…'}, alla presenza del rappresentante dell'esecutore ${g.impresa || '…'}, ha proceduto alla consegna dei lavori. Il tempo utile per l'ultimazione è di ${g.durata || A.durata(a)} giorni naturali e consecutivi, con scadenza il ${fdt(addDays(v.data, g.durata || A.durata(a)))}.`, sospensione: `In data ${fdt(v.data)} i lavori vengono sospesi per le seguenti ragioni: ${v.note || '…'}.`, ripresa: `In data ${fdt(v.data)}, cessate le cause della sospensione, i lavori vengono ripresi. ${v.note || ''}`, ultimazione: `Il direttore dei lavori, a seguito di sopralluogo in contraddittorio con l'esecutore, certifica che i lavori sono stati ultimati in data ${fdt(v.data)}. ${v.note || ''}`, cre: `Visti gli atti contabili e accertata la regolare esecuzione dei lavori, si certifica che i lavori sono stati eseguiti a regola d'arte e in conformità al contratto. Importo dei lavori eseguiti: ${eur(a.sal.length ? A.salCalc(a, a.sal.length).netto : 0)} al netto del ribasso. ${v.note || ''}`, altro: v.note || '' }[v.tipo];
    return [{ t: 'h1', text: T[v.tipo] || 'Verbale' }, { t: 'p', text: `Lavori: ${g.opera}${g.cup ? ' – CUP ' + g.cup : ''}${g.cig ? ' – CIG ' + g.cig : ''}` }, { t: 'p', text: `Committente: ${g.committente || '…'} · Esecutore: ${g.impresa || '…'} · RUP: ${g.rup || '…'} · Direttore dei lavori: ${g.dl || '…'}` }, { t: 'p', text: txt }, { t: 'p', text: `Letto, confermato e sottoscritto. ${g.luogo || ''}, ${fdt(v.data)}` }, { t: 'table', rows: [['Il direttore dei lavori', 'L\'esecutore', 'Il RUP'], [g.dl || '', g.impresa || '', g.rup || '']] }];
  };
  A.salBlocks = (a, n) => { const c = A.salPay(a, n), s = a.sal[n - 1]; const rows = a.voci.map(v => { const e = epOf(a, v.ep) || {}; const q = A.qContab(a, v.id, n); return q ? [e.c, e.d.slice(0, 70), e.u, nf(q), nf(e.p), nf(q * e.p)] : null; }).filter(Boolean);
    return [{ t: 'h1', text: `Stato di avanzamento lavori n. ${n}` }, { t: 'p', text: `Lavori: ${a.gen.opera} · Esecutore: ${a.gen.impresa || '…'} · Lavori a tutto il ${fdt(s.data)}` }, { t: 'table', rows: [['Tariffa', 'Designazione', 'U.M.', 'Quantità', 'Prezzo €', 'Importo €'], ...rows] },
      { t: 'h2', text: 'Riepilogo e certificato di pagamento' }, { t: 'table', rows: [['Voce', 'Importo €'], ['Lavori a misura (lordo)', nf(c.lav)], [`Ribasso d'asta ${nf(a.gen.ribasso)}%`, '- ' + nf(c.rib)], ['Costi della sicurezza', nf(c.sic)], ['Importo netto progressivo', nf(c.netto)], [`Ritenuta a garanzia ${nf(a.gen.ritenuta)}%`, '- ' + nf(c.rit)], ['Recupero anticipazione', '- ' + nf(c.ant)], ['Totale certificabile progressivo', nf(c.cert)], ['A dedurre certificati precedenti', '- ' + nf(c.prec)], ['IMPORTO DEL PRESENTE CERTIFICATO', nf(c.questo)], [`IVA ${nf(a.gen.iva, 0)}%`, nf(c.iva)], ['TOTALE', nf(c.totale)]] }, { t: 'table', rows: [['Il direttore dei lavori', 'Il RUP'], [a.gen.dl || '', a.gen.rup || '']] }];
  };

  /* =================== interfaccia (stile software di computo) =================== */
  const DOCS = [
    ['Progetto', [['gen', 'Dati generali', 'settings'], ['ep', 'Elenco prezzi', 'table'], ['an', 'Analisi nuovi prezzi', 'measure'], ['comp', 'Computo metrico estimativo', 'acc'], ['mo', 'Incidenza manodopera', 'users'], ['sic', 'Costi della sicurezza', 'shield'], ['qe', 'Quadro economico', 'doc'], ['cap', 'Capitolato speciale d\'appalto', 'doc'], ['crono', 'Cronoprogramma', 'calendar']]],
    ['Direzione lavori', [['giorn', 'Giornale dei lavori', 'doc'], ['ord', 'Ordini di servizio', 'doc'], ['verb', 'Verbali e certificati', 'doc']]],
    ['Contabilità lavori', [['lib', 'Libretto delle misure', 'ruler'], ['reg', 'Registro di contabilità', 'table'], ['salv', 'SAL e certificati di pagamento', 'acc'], ['fin', 'Stato finale e confronto', 'check']]],
    ['Prezzari', [['prz', 'Prezzari regionali', 'catalog']]]];
  const TITLES = Object.fromEntries(DOCS.flatMap(([, d]) => d.map(x => [x[0], x[1]])));
  const RB = (k, ic, l) => `<button class="rbtn" data-a="${k}" title="${esc(l)}">${App.icon(ic, 26)}<span>${l}</span></button>`;
  const RS = (k, ic, l) => `<button class="rbtn-s" data-a="${k}" title="${esc(l)}">${App.icon(ic, 16)}${l}</button>`;
  const RC = (...x) => `<div class="rcol">${x.join('')}</div>`;
  const RG = (t, i) => `<div class="rgroup"><div class="rgroup-items">${i}</div><div class="rgroup-title">${t}</div></div>`;
  const RIB = {
    home: () => RG('Documento', RB('d:gen', 'settings', 'Dati generali') + RB('d:comp', 'acc', 'Computo')) + RG('Inserisci', RB('addVoce', 'plus', 'Voce da elenco') + RC(RS('addCat', 'folder', 'Nuova categoria'), RS('newNP', 'measure', 'Nuovo prezzo (NP)'), RS('addRow', 'ruler', 'Riga di misura'))) + RG('Modifica', RC(RS('dupVoce', 'copy', 'Duplica voce'), RS('delVoce', 'trash', 'Elimina voce'), RS('moveVoce', 'move', 'Sposta in categoria'))) + RG('Quantità', RB('refresh', 'refresh', 'Aggiorna collegate')),
    prezzari: () => RG('Prezzario attivo', `<div class="rcol" style="padding:4px 6px;gap:6px"><span class="tiny">Prezzario</span><select id="rbPz" style="width:230px;padding:3px 5px;font-size:11.5px"></select></div>`) + RG('Archivio', RB('impPz', 'upload', 'Importa prezzario') + RB('d:prz', 'catalog', 'Prezzari regionali')) + RG('Elenco prezzi', RB('d:ep', 'table', 'Elenco prezzi') + RB('d:an', 'measure', 'Analisi prezzi')),
    contab: () => RG('Libretto delle misure', RB('newMis', 'ruler', 'Nuova misura') + RB('avanz', 'percent', 'Avanzamento %')) + RG('Stati di avanzamento', RB('emettiSal', 'acc', 'Emetti SAL') + RB('d:salv', 'doc', 'Certificati')) + RG('Registri', RC(RS('d:lib', 'ruler', 'Libretto'), RS('d:reg', 'table', 'Registro'), RS('d:fin', 'check', 'Stato finale'))),
    dl: () => RG('Giornale', RB('newGiorn', 'doc', 'Annotazione')) + RG('Atti', RB('newOrd', 'doc', 'Ordine di servizio') + RB('newVerb', 'doc', 'Verbale')) + RG('Programma', RB('d:crono', 'calendar', 'Cronoprogramma')),
    integ: () => RG('Quantità dai modelli', RB('fromBim', 'bim', 'Dal BIM') + RB('fromCad', 'cad', 'Dal CAD') + RB('fromGis', 'gis', 'Dal GIS')) + RG('Collegamenti', RB('refresh', 'refresh', 'Aggiorna quantità')) + RG('Apri', RC(RS('go:bim', 'bim', 'Modello BIM'), RS('go:cad', 'cad', 'Disegno CAD'), RS('go:gis', 'gis', 'Mappa GIS'))) + RG('Scambio', RC(RS('impX', 'upload', 'Importa XPWE'), RS('expX', 'download', 'Esporta XPWE'), RS('expCsv', 'download', 'Esporta CSV'))),
    print: () => RG('Progetto', RC(RS('pr:comp', 'print', 'Computo estimativo'), RS('pr:cm', 'print', 'Computo metrico'), RS('pr:ep', 'print', 'Elenco prezzi')) + RC(RS('pr:qe', 'print', 'Quadro economico'), RS('pr:cap', 'doc', 'Capitolato (DOCX)'), RS('pr:crono', 'print', 'Cronoprogramma'))) + RG('Word', RC(RS('dx:comp', 'doc', 'Computo (DOCX)'), RS('dx:qe', 'doc', 'Quadro economico (DOCX)'), RS('dx:giorn', 'doc', 'Giornale (DOCX)')))
  };
  const TABS = [['home', 'Computo'], ['prezzari', 'Prezzari'], ['contab', 'Contabilità'], ['dl', 'Direzione lavori'], ['integ', 'Integrazione BIM · CAD · GIS'], ['print', 'Stampe']];

  let P, a, doc = 'comp', curCat = null, selVoce = null, pzQ = '', pzLimit = 300;
  App.register('acc', {
    guest: false, needProject: true,
    mount(view, args) {
      P = App.project(); a = A.data(P); doc = TITLES[args[0]] ? args[0] : (A.state && A.state.doc) || 'comp'; curCat = curCat && a.cats.some(c => c.id === curCat) ? curCat : a.cats[0].id;
      const body = App.modShell(view, { id: 'acc', title: 'BeCity Contabilità', sub: 'Computo, prezzari, capitolato, cronoprogramma, direzione e contabilità lavori · D.Lgs. 36/2023' });
      body.style.flexDirection = 'column';
      body.innerHTML = `<div class="prm">
        <div class="ribbon" id="aRib"><div class="ribbon-tabs"><button class="app-menu prm-file" id="aFile">File</button>${TABS.map(([k, l], i) => `<button data-rt="${k}" class="${i ? '' : 'active'}">${l}</button>`).join('')}</div><div class="ribbon-body" id="aRb"></div></div>
        <div class="prm-fasi" id="aFasi"></div>
        <div class="cad-wrap">
          <aside class="prm-nav"><header>Documenti</header><div class="prm-tree" id="aNav"></div></aside>
          <main class="prm-main"><div class="prm-doctab" id="aDocT"></div><div class="prm-doc" id="aDoc"></div></main>
          <aside class="prm-pz" id="aPz"><header><span>Prezzario</span><span class="grow"></span><button class="btn sm ghost" data-a="impPz" title="Importa prezzario">${App.icon('upload', 13)}</button></header><div class="prm-pz-h"><select id="aPzSel"></select><label class="agp-find" style="margin:6px 0 0">${App.icon('search', 13)}<input id="aPzQ" placeholder="Cerca codice o descrizione"></label></div><div class="prm-pz-list" id="aPzL"></div><div class="prm-pz-info" id="aPzI">Doppio clic o trascina una voce sul computo per inserirla.</div></aside>
        </div>
        <div class="prm-status" id="aStat"></div></div>`;
      const showRb = k => { $('#aRb').innerHTML = RIB[k](); $$('#aRib [data-rt]').forEach(b => b.classList.toggle('active', b.dataset.rt === k)); fillPzSel($('#rbPz')); };
      $$('#aRib [data-rt]').forEach(b => b.onclick = () => showRb(b.dataset.rt));
      body.addEventListener('click', ev => { const b = ev.target.closest('[data-a]'); if (b && body.contains(b)) act(b.dataset.a, b); });
      $('#aFile').onclick = ev => { const r = ev.currentTarget.getBoundingClientRect(); App.ctxMenu(r.left, r.bottom, [{ label: 'Nuovo progetto…', action: App.newProjectDialog }, { label: 'Apri progetto…', action: App.openProjectDialog }, { label: 'Salva', action: () => { App.saveNow(); App.toast('Progetto salvato', 'ok'); } }, '-', { label: 'Importa computo XPWE…', action: () => act('impX') }, { label: 'Esporta computo XPWE', action: () => act('expX') }, { label: 'Importa prezzario…', action: () => act('impPz') }, '-', { label: 'Stampa computo estimativo', action: () => act('pr:comp') }]); };
      showRb('home'); renderAll();
      $('#aPzSel').onchange = e => { a.prezzario = e.target.value; App.touch(P); fillPzSel($('#rbPz')); renderPz(); };
      $('#aPzQ').oninput = e => { pzQ = e.target.value; pzLimit = 300; renderPz(); };
    },
    unmount() { App.saveNow(); }
  });
  A.state = { doc: 'comp' };
  function renderAll() { renderNav(); renderFasi(); renderDoc(); renderPz(); renderStat(); }
  function go(d) { doc = d; A.state.doc = d; history.replaceState(null, '', '#/acc/' + d); renderNav(); renderDoc(); }
  function renderNav() { $('#aNav').innerHTML = DOCS.map(([g, ds]) => `<div class="prm-grp">${esc(g)}</div>${ds.map(([k, l, ic]) => `<div class="prm-leaf ${k === doc ? 'on' : ''}" data-d="${k}">${App.icon(ic, 14)} ${esc(l)}</div>`).join('')}`).join(''); $$('#aNav [data-d]').forEach(e => e.onclick = () => go(e.dataset.d)); $('#aDocT').innerHTML = `<span class="on">${App.icon('doc', 12)} ${esc(TITLES[doc])}</span>`; }
  function renderFasi() { const f = A.fasi(a); const cur = FASI.findIndex(x => !f[x[0]]); $('#aFasi').innerHTML = FASI.map(([k, l, d], i) => `<button class="prm-step ${f[k] ? 'done' : ''} ${i === cur ? 'cur' : ''}" data-fd="${d}"><i>${f[k] ? '✓' : i + 1}</i>${l}</button>`).join('<span class="prm-arr"></span>'); $$('#aFasi [data-fd]').forEach(b => b.onclick = () => go(b.dataset.fd)); }
  function renderStat() { const t = A.totals(a); const q = A.qe(a, false); $('#aStat').innerHTML = `<span>Voci <b>${a.voci.length}</b></span><span>Lavori <b>${eur(t.lav)}</b></span><span>Sicurezza <b>${eur(t.sic)}</b></span><span class="hi">Totale lavori <b>${eur(t.tot)}</b></span><span>Manodopera <b>${eur(t.mo)}</b> (${nf(t.tot ? t.mo / t.tot * 100 : 0, 1)}%)</span><span>Quadro economico <b>${eur(q.tot)}</b></span><span class="grow"></span><span>SAL emessi <b>${a.sal.length}</b></span><span class="faint">Prezzario: ${esc((A.list().find(x => x.id === a.prezzario) || {}).nome || '—')}</span>`; }
  const changed = (what) => { App.touch(P); renderStat(); renderFasi(); if (what === 'all') renderDoc(); };
  function fillPzSel(sel) { if (!sel) return; sel.innerHTML = A.list().map(x => `<option value="${x.id}" ${x.id === a.prezzario ? 'selected' : ''}>${esc(x.nome)}${x.anno && !String(x.nome).includes(String(x.anno)) ? ' ' + x.anno : ''}</option>`).join(''); sel.onchange = () => { a.prezzario = sel.value; App.touch(P); fillPzSel($('#aPzSel')); renderPz(); renderStat(); }; }

  /* ---------- pannello prezzario ---------- */
  async function renderPz() {
    fillPzSel($('#aPzSel')); const L = $('#aPzL'); if (!L) return; const vs = await A.voci(a.prezzario); const q = pzQ.toLowerCase().trim();
    const hits = q ? vs.filter(v => v.c.toLowerCase().includes(q) || v.d.toLowerCase().includes(q)) : vs; const show = hits.slice(0, pzLimit); let cap = null;
    L.innerHTML = show.map(v => { const h = v.cap !== cap ? `<div class="prm-cap">${esc(v.cap || '')}</div>` : ''; cap = v.cap; return h + `<div class="prm-pv" draggable="true" data-c="${esc(v.c)}" title="${esc(v.de || v.d)}"><b>${esc(v.c)}</b><span>${esc(v.d)}</span><em>${eur(v.p)}/${esc(v.u)}</em></div>`; }).join('') + (hits.length > show.length ? `<button class="btn sm" id="aPzMore" style="margin:8px">Mostra altre (${(hits.length - show.length).toLocaleString('it-IT')})</button>` : '') + (!hits.length ? '<div class="empty small">Nessuna voce</div>' : '');
    const find = c => vs.find(v => v.c === c);
    $$('.prm-pv', L).forEach(e => { e.onclick = () => { $$('.prm-pv.on', L).forEach(x => x.classList.remove('on')); e.classList.add('on'); const v = find(e.dataset.c); $('#aPzI').innerHTML = `<b>${esc(v.c)}</b> · ${esc(v.u)} · <b>${eur(v.p)}</b> · MO ${nf(v.mo || 0, 1)}%<div class="small" style="margin-top:4px;max-height:120px;overflow:auto">${esc(v.de || v.d)}</div><button class="btn sm primary" style="margin-top:6px" id="aPzAdd">${App.icon('plus', 12)} Inserisci nel computo</button>`; $('#aPzAdd').onclick = () => insertFromPz(v); }; e.ondblclick = () => insertFromPz(find(e.dataset.c)); e.ondragstart = ev => ev.dataTransfer.setData('text/becity-pz', e.dataset.c); });
    const more = $('#aPzMore'); if (more) more.onclick = () => { pzLimit += 500; renderPz(); };
    A._find = find;
  }
  function insertFromPz(v, cat) {
    if (!v) return; const src = (A.list().find(x => x.id === a.prezzario) || {}).nome || 'Prezzario'; const e = A.ensureEP(a, v, src);
    if (doc === 'ep' || doc === 'an') { changed(); renderDoc(); App.toast('Voce aggiunta all\'elenco prezzi', 'ok'); return; }
    const vo = A.addVoce(a, e, cat || curCat); selVoce = vo.id; if (doc !== 'comp') go('comp'); else renderDoc(); changed();
    setTimeout(() => { const i = $(`[data-r="${vo.righe[0].id}"] [data-k="d"]`); if (i) i.focus(); }, 30);
  }

  /* ---------- documenti ---------- */
  function renderDoc() {
    const D = $('#aDoc'); if (!D) return; D.scrollTop = 0; renderNav();
    ({ gen: docGen, ep: docEP, an: docAn, comp: docComp, mo: docMO, sic: docSic, qe: docQE, cap: docCap, crono: docCrono, giorn: docGiorn, ord: docOrd, verb: docVerb, lib: docLib, reg: docReg, salv: docSal, fin: docFin, prz: docPrz }[doc] || docComp)(D);
  }
  const field = (k, l, type = 'text', o = {}) => `<label class="f"><span>${l}</span>${type === 'select' ? `<select data-g="${k}">${o.options.map(x => `<option ${String(a.gen[k]) === String(x) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : type === 'checkbox' ? `<input type="checkbox" data-g="${k}" ${a.gen[k] ? 'checked' : ''} style="width:auto">` : `<input type="${type}" data-g="${k}" value="${esc(a.gen[k] ?? '')}" ${type === 'number' ? 'step="any"' : ''}>`}</label>`;
  function bindGen(D) { $$('[data-g]', D).forEach(i => i.onchange = () => { const k = i.dataset.g; a.gen[k] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? parseFloat(i.value) || 0 : i.value; changed(); }); }
  function docGen(D) {
    D.innerHTML = `<div class="prm-page"><h3>Dati generali dell'opera</h3><div class="grid3">${field('opera', 'Oggetto dei lavori')}${field('luogo', 'Luogo')}${field('committente', 'Committente / stazione appaltante')}${field('cup', 'CUP')}${field('cig', 'CIG')}${field('rup', 'Responsabile unico del progetto (RUP)')}${field('progettista', 'Progettista')}${field('dl', 'Direttore dei lavori')}${field('cse', 'Coordinatore sicurezza (CSP/CSE)')}</div>
      <h3>Affidamento ed esecuzione</h3><div class="grid3">${field('impresa', 'Impresa esecutrice')}${field('ribasso', 'Ribasso d\'asta %', 'number')}${field('iva', 'Aliquota IVA lavori %', 'number')}${field('consegna', 'Data consegna lavori', 'date')}${field('durata', 'Tempo utile (giorni, 0 = da cronoprogramma)', 'number')}${field('penale', 'Penale giornaliera (‰)', 'number')}</div>
      <h3>Contabilità</h3><div class="grid3">${field('anticipazione', 'Anticipazione %', 'number')}${field('antErogata', 'Anticipazione erogata (recupero sui SAL)', 'checkbox')}${field('ritenuta', 'Ritenuta a garanzia %', 'number')}${field('sogliaSal', 'Importo minimo per SAL €', 'number')}${field('garanzia', 'Garanzia definitiva %', 'number')}</div>
      <h3>Cronoprogramma</h3><div class="grid3">${field('squadra', 'Operai per squadra', 'number')}${field('costoOra', 'Costo orario medio manodopera €', 'number')}</div>
      <h3>Categorie di lavoro (WBS)</h3><table class="tbl prm-tbl"><thead><tr><th>Categoria</th><th>Classificazione SOA</th><th class="num">Importo</th><th></th></tr></thead><tbody>${a.cats.map(c => `<tr data-c="${c.id}"><td><input data-cf="nome" value="${esc(c.nome)}"></td><td><input data-cf="soa" value="${esc(c.soa || '')}" list="soaL" style="width:110px"></td><td class="num">${eur(A.catTot(a, c.id))}</td><td><button class="btn sm ghost" data-cdel>✕</button></td></tr>`).join('')}</tbody></table><datalist id="soaL">${['OG1', 'OG2', 'OG3', 'OG6', 'OG8', 'OG9', 'OG10', 'OG11', 'OG12', 'OG13', 'OS3', 'OS6', 'OS7', 'OS8', 'OS18-A', 'OS21', 'OS24', 'OS28', 'OS30'].map(x => `<option>${x}</option>`).join('')}</datalist><button class="btn sm" data-a="addCat" style="margin-top:8px">${App.icon('plus', 13)} Nuova categoria</button></div>`;
    bindGen(D);
    $$('tr[data-c]', D).forEach(tr => { const c = a.cats.find(x => x.id === tr.dataset.c); $$('[data-cf]', tr).forEach(i => i.onchange = () => { c[i.dataset.cf] = i.value; changed(); }); $('[data-cdel]', tr).onclick = () => { if (a.voci.some(v => v.cat === c.id)) { App.toast('La categoria contiene voci', 'warn'); return; } if (a.cats.length < 2) return; a.cats = a.cats.filter(x => x !== c); changed('all'); }; });
  }
  function docEP(D) {
    const used = id => a.voci.filter(v => v.ep === id).length;
    D.innerHTML = `<div class="prm-bar"><b>Elenco prezzi unitari</b><span class="faint small">${a.ep.length} voci · doppio clic sul prezzario per aggiungere</span><span class="grow"></span><button class="btn sm" data-a="newNP">${App.icon('plus', 12)} Nuovo prezzo (NP)</button><button class="btn sm" data-a="pr:ep">${App.icon('print', 12)} Stampa</button></div>
      <table class="tbl prm-tbl"><thead><tr><th>N.</th><th>Tariffa</th><th>Descrizione</th><th>U.M.</th><th class="num">Prezzo €</th><th class="num">% MO</th><th>Sicurezza</th><th>Fonte</th><th class="num">Usi</th><th></th></tr></thead><tbody>${a.ep.map((e, i) => `<tr data-e="${e.id}"><td>${i + 1}</td><td class="cod">${esc(e.c)}${e.np ? ' <span class="pill blue">NP</span>' : ''}</td><td><input data-ef="d" value="${esc(e.d)}"></td><td><input data-ef="u" value="${esc(e.u)}" style="width:60px"></td><td><input data-ef="p" type="number" step="0.01" value="${e.p}" style="width:90px;text-align:right"></td><td><input data-ef="mo" type="number" step="0.1" value="${e.mo || 0}" style="width:64px;text-align:right"></td><td><input type="checkbox" data-ef="sic" ${e.sic ? 'checked' : ''}></td><td class="tiny faint">${esc(e.src || '')}</td><td class="num">${used(e.id)}</td><td>${used(e.id) ? '' : '<button class="btn sm ghost" data-edel>✕</button>'}</td></tr>`).join('') || '<tr><td colspan="10" class="empty small">Elenco vuoto: inserisci voci dal prezzario</td></tr>'}</tbody></table>`;
    $$('tr[data-e]', D).forEach(tr => { const e = a.ep.find(x => x.id === tr.dataset.e); $$('[data-ef]', tr).forEach(i => i.onchange = () => { const k = i.dataset.ef; e[k] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? r2(parseFloat(i.value) || 0) : i.value; changed(); }); const d = $('[data-edel]', tr); if (d) d.onclick = () => { a.ep = a.ep.filter(x => x !== e); changed('all'); }; });
  }
  function docAn(D) {
    const nps = a.ep.filter(e => e.np); const cur = nps.find(e => e.id === A.state.np) || nps[0];
    if (!cur) { D.innerHTML = `<div class="prm-page"><h3>Analisi dei nuovi prezzi</h3><p class="muted">Per le lavorazioni non presenti nel prezzario si redige l'analisi del prezzo: costi di manodopera, materiali, noli e trasporti, maggiorati delle spese generali e dell'utile d'impresa.</p><button class="btn primary" data-a="newNP">${App.icon('plus', 14)} Nuovo prezzo</button></div>`; return; }
    const an = cur.an = cur.an || { righe: [], sg: 15, ui: 10 }; const tot = an.righe.reduce((s, r) => s + (+r.q || 0) * (+r.p || 0), 0); const mo = an.righe.filter(r => r.t === 'Manodopera').reduce((s, r) => s + (+r.q || 0) * (+r.p || 0), 0); const sg = tot * an.sg / 100, ui = (tot + sg) * an.ui / 100, pr = r2(tot + sg + ui);
    D.innerHTML = `<div class="prm-bar"><b>Analisi del prezzo</b><select id="anSel" style="width:auto">${nps.map(e => `<option value="${e.id}" ${e === cur ? 'selected' : ''}>${esc(e.c)} – ${esc(e.d.slice(0, 50))}</option>`).join('')}</select><span class="grow"></span><button class="btn sm" data-a="newNP">${App.icon('plus', 12)} Nuovo prezzo</button></div>
      <div class="prm-page"><div class="small muted">${esc(cur.de || cur.d)} · unità di misura <b>${esc(cur.u)}</b></div>
      <table class="tbl prm-tbl" style="margin-top:10px"><thead><tr><th>Tipo</th><th>Descrizione</th><th>U.M.</th><th class="num">Quantità</th><th class="num">Prezzo €</th><th class="num">Importo €</th><th></th></tr></thead><tbody>${an.righe.map((r, i) => `<tr data-i="${i}"><td><select data-af="t">${['Manodopera', 'Materiali', 'Noli', 'Trasporti'].map(x => `<option ${r.t === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td><td><input data-af="d" value="${esc(r.d)}"></td><td><input data-af="u" value="${esc(r.u)}" style="width:60px"></td><td><input data-af="q" type="number" step="any" value="${r.q}" style="width:80px;text-align:right"></td><td><input data-af="p" type="number" step="any" value="${r.p}" style="width:90px;text-align:right"></td><td class="num">${nf((+r.q || 0) * (+r.p || 0))}</td><td><button class="btn sm ghost" data-adel>✕</button></td></tr>`).join('')}</tbody></table>
      <div class="row" style="margin-top:8px"><button class="btn sm" id="anAdd">${App.icon('plus', 12)} Riga</button><button class="btn sm" id="anMan">Manodopera dal prezzario</button></div>
      <table class="tbl" style="max-width:460px;margin-top:14px"><tbody><tr><td>Costo tecnico (A)</td><td class="num">${nf(tot)}</td></tr><tr><td>Spese generali <input id="anSg" type="number" value="${an.sg}" style="width:60px"> % di A</td><td class="num">${nf(sg)}</td></tr><tr><td>Utile d'impresa <input id="anUi" type="number" value="${an.ui}" style="width:60px"> % di (A + SG)</td><td class="num">${nf(ui)}</td></tr><tr class="hi"><td><b>Prezzo di applicazione</b> (${nf(tot ? mo / tot * 100 : 0, 1)}% manodopera)</td><td class="num"><b>${eur(pr)}</b></td></tr></tbody></table>
      <button class="btn primary" id="anApply" style="margin-top:10px">Applica all'elenco prezzi</button></div>`;
    $('#anSel', D).onchange = e => { A.state.np = e.target.value; renderDoc(); };
    $$('tr[data-i]', D).forEach(tr => { const r = an.righe[+tr.dataset.i]; $$('[data-af]', tr).forEach(i => i.onchange = () => { r[i.dataset.af] = i.type === 'number' ? parseFloat(i.value) || 0 : i.value; changed('all'); }); $('[data-adel]', tr).onclick = () => { an.righe.splice(+tr.dataset.i, 1); changed('all'); }; });
    $('#anAdd', D).onclick = () => { an.righe.push({ t: 'Materiali', d: '', u: '', q: 1, p: 0 }); changed('all'); };
    $('#anMan', D).onclick = async () => { const vs = (await A.voci(a.prezzario)).filter(v => /operaio/i.test(v.d) && v.u === 'h'); vs.forEach(v => an.righe.push({ t: 'Manodopera', d: v.d, u: 'h', q: 0, p: v.p })); if (!vs.length) App.toast('Nessuna voce di manodopera oraria nel prezzario attivo', 'warn'); changed('all'); };
    $('#anSg', D).onchange = e => { an.sg = +e.target.value; changed('all'); }; $('#anUi', D).onchange = e => { an.ui = +e.target.value; changed('all'); };
    $('#anApply', D).onclick = () => { cur.p = pr; cur.mo = r2(tot ? mo / tot * 100 : 0); changed('all'); App.toast(`Prezzo ${cur.c} aggiornato: ${eur(pr)}`, 'ok'); };
  }

  /* ---------- computo (griglia) ---------- */
  function docComp(D) {
    const t = A.totals(a); let n = 0;
    const cell = (r, k, w) => `<td class="${k === 'd' ? '' : 'n'}"><input data-k="${k}" value="${esc(r[k] ?? '')}" ${k === 'd' ? 'placeholder="descrizione della misura"' : `placeholder="${k === 'q' ? 'q. man.' : ''}"`} style="${w ? 'width:' + w + 'px' : ''}"></td>`;
    const html = a.cats.map(c => {
      const vs = a.voci.filter(v => v.cat === c.id);
      return `<tbody class="prm-cat ${c.id === curCat ? 'cur' : ''}" data-cat="${c.id}"><tr class="cat"><td colspan="11"><div class="ch"><span class="caret">▾</span> ${esc(c.nome)}${c.soa ? ` <span class="pill">${esc(c.soa)}</span>` : ''}<span class="grow"></span><span class="faint small">${vs.length} voci</span><b id="ct_${c.id}">${eur(A.catTot(a, c.id))}</b></div></td></tr>` +
        vs.map(v => { const e = epOf(a, v.ep) || { c: '?', d: 'Voce mancante', u: '', p: 0 }; n++; const linked = v.righe.some(r => r.link);
          return `<tr class="voce ${v.id === selVoce ? 'sel' : ''}" data-v="${v.id}"><td class="n">${n}</td><td class="cod">${esc(e.c)}${linked ? ` <span title="Quantità collegate al modello" class="lk">${App.icon('link', 11)}</span>` : ''}</td><td colspan="8"><b>${esc(e.d)}</b>${e.sic ? ' <span class="pill warn">sicurezza</span>' : ''}${e.de && e.de !== e.d ? `<div class="de">${esc(e.de)}</div>` : ''}</td><td class="act"><button data-va="row" title="Aggiungi riga di misura">+</button><button data-va="menu" title="Altre azioni">⋯</button></td></tr>` +
            v.righe.map(r => `<tr class="mis ${r.link ? 'link' : ''} ${r.orfana ? 'orf' : ''}" data-v="${v.id}" data-r="${r.id}"><td></td><td class="tiny faint">${r.link ? r.link.src.toUpperCase() : ''}</td>${cell(r, 'd')}${cell(r, 'pu', 58)}${cell(r, 'l', 64)}${cell(r, 'w', 64)}${cell(r, 'h', 64)}<td class="n q" id="q_${r.id}">${nf(A.rowQ(r))}</td>${cell(r, 'q', 64).replace('class="n"', 'class="n ov"')}<td></td><td class="act"><button data-ra="del" title="Elimina riga">✕</button></td></tr>`).join('') +
            `<tr class="som" data-v="${v.id}"><td></td><td></td><td>SOMMANO ${esc(e.u)}</td><td></td><td></td><td></td><td></td><td class="n" id="sq_${v.id}">${nf(A.voceQ(v))}</td><td class="n">${nf(e.p)}</td><td class="n" id="si_${v.id}">${nf(A.voceImp(a, v))}</td><td></td></tr>`; }).join('') +
        `<tr class="drop"><td colspan="11">${App.icon('plus', 12)} Trascina qui una voce del prezzario o fai doppio clic su una voce · categoria “${esc(c.nome)}”</td></tr></tbody>`;
    }).join('');
    D.innerHTML = `<div class="prm-bar"><b>Computo metrico estimativo</b><span class="faint small">Formule ammesse nelle celle (es. 2*3,50+1,2) · valori negativi per le deduzioni · Invio sull'ultima cella aggiunge una riga</span></div>
      <table class="prm-grid"><thead><tr><th style="width:38px">N.</th><th style="width:96px">Tariffa</th><th>Designazione dei lavori</th><th style="width:66px">Par.ug.</th><th style="width:72px">Lung.</th><th style="width:72px">Larg.</th><th style="width:72px">H/peso</th><th style="width:86px">Quantità</th><th style="width:86px">Prezzo unit.</th><th style="width:104px">Importo €</th><th style="width:54px"></th></tr></thead>${html}
      <tfoot><tr class="som"><td colspan="9">Lavori soggetti a ribasso</td><td class="n" id="tLav">${nf(t.lav)}</td><td></td></tr><tr class="som"><td colspan="9">Costi della sicurezza non soggetti a ribasso</td><td class="n" id="tSic">${nf(t.sic)}</td><td></td></tr><tr class="tot"><td colspan="9">TOTALE LAVORI</td><td class="n" id="tTot">${nf(t.tot)}</td><td></td></tr></tfoot></table>`;
    const recalc = (v, r) => { if (r) $('#q_' + r.id).textContent = nf(A.rowQ(r)); $('#sq_' + v.id).textContent = nf(A.voceQ(v)); $('#si_' + v.id).textContent = nf(A.voceImp(a, v)); $('#ct_' + v.cat).textContent = eur(A.catTot(a, v.cat)); const tt = A.totals(a); $('#tLav').textContent = nf(tt.lav); $('#tSic').textContent = nf(tt.sic); $('#tTot').textContent = nf(tt.tot); changed(); };
    $$('tr.mis', D).forEach(tr => { const v = a.voci.find(x => x.id === tr.dataset.v), r = v.righe.find(x => x.id === tr.dataset.r);
      $$('input[data-k]', tr).forEach(i => { i.onchange = () => { const k = i.dataset.k; r[k] = i.value.trim(); if (k !== 'd' && i.value.trim() && !isFinite(evalF(i.value))) i.classList.add('bad'); else i.classList.remove('bad'); if (r.link && k === 'q') delete r.link; recalc(v, r); };
        i.onfocus = () => { selVoce = v.id; curCat = v.cat; $$('.prm-grid tr.voce.sel').forEach(x => x.classList.remove('sel')); const vr = $(`tr.voce[data-v="${v.id}"]`); if (vr) vr.classList.add('sel'); $$('.prm-cat').forEach(x => x.classList.toggle('cur', x.dataset.cat === curCat)); };
        i.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); i.onchange(); const ins = $$('input[data-k]', tr); const ix = ins.indexOf(i); if (ix < ins.length - 2) ins[ix + 1].focus(); else { const nr = newRow(); v.righe.splice(v.righe.indexOf(r) + 1, 0, nr); changed(); renderDoc(); setTimeout(() => { const x = $(`[data-r="${nr.id}"] [data-k="d"]`); if (x) x.focus(); }, 20); } } }; });
      $('[data-ra=del]', tr).onclick = () => { v.righe = v.righe.filter(x => x !== r); if (!v.righe.length) v.righe.push(newRow()); changed(); renderDoc(); }; });
    $$('tr.voce', D).forEach(tr => { const v = a.voci.find(x => x.id === tr.dataset.v); tr.onclick = ev => { if (ev.target.closest('button')) return; selVoce = v.id; curCat = v.cat; $$('.prm-grid tr.voce.sel').forEach(x => x.classList.remove('sel')); tr.classList.add('sel'); $$('.prm-cat').forEach(x => x.classList.toggle('cur', x.dataset.cat === curCat)); };
      $('[data-va=row]', tr).onclick = () => { const nr = newRow(); v.righe.push(nr); changed(); renderDoc(); setTimeout(() => { const x = $(`[data-r="${nr.id}"] [data-k="d"]`); if (x) x.focus(); }, 20); };
      $('[data-va=menu]', tr).onclick = ev => { selVoce = v.id; const r = ev.target.getBoundingClientRect(); App.ctxMenu(r.left - 160, r.bottom, [{ label: 'Duplica voce', action: () => act('dupVoce') }, { label: 'Sposta in categoria…', action: () => act('moveVoce') }, { label: 'Modifica prezzo in elenco', action: () => go('ep') }, '-', { label: 'Elimina voce', action: () => act('delVoce') }]); }; });
    $$('tr.cat', D).forEach(tr => tr.onclick = () => { curCat = tr.parentElement.dataset.cat; tr.parentElement.classList.toggle('collapsed'); $$('.prm-cat').forEach(x => x.classList.toggle('cur', x.dataset.cat === curCat)); });
    $$('.prm-cat', D).forEach(tb => { tb.ondragover = ev => { if (ev.dataTransfer.types.includes('text/becity-pz')) { ev.preventDefault(); tb.classList.add('over'); } }; tb.ondragleave = () => tb.classList.remove('over'); tb.ondrop = ev => { ev.preventDefault(); tb.classList.remove('over'); const c = ev.dataTransfer.getData('text/becity-pz'); curCat = tb.dataset.cat; insertFromPz(A._find && A._find(c), tb.dataset.cat); }; });
    if (!a.voci.length) D.insertAdjacentHTML('beforeend', `<div class="prm-empty">${App.appIcon('acc', 56)}<b>Computo vuoto</b><span>Inserisci le voci dal prezzario a destra (doppio clic o trascinamento) oppure importa le quantità dal modello BIM, dal disegno CAD o dai layer GIS.</span><div class="row"><button class="btn" data-a="fromBim">${App.icon('bim', 14)} Dal BIM</button><button class="btn" data-a="fromCad">${App.icon('cad', 14)} Dal CAD</button><button class="btn" data-a="fromGis">${App.icon('gis', 14)} Dal GIS</button><button class="btn" data-a="impX">${App.icon('upload', 14)} Importa XPWE</button></div></div>`);
  }
  function docMO(D) {
    const t = A.totals(a); const rows = a.voci.map(v => { const e = epOf(a, v.ep) || {}; const imp = A.voceImp(a, v); return { e, imp, mo: r2(imp * (e.mo || 0) / 100) }; });
    D.innerHTML = `<div class="prm-bar"><b>Stima dell'incidenza della manodopera</b><span class="grow"></span><span class="small">Totale manodopera <b>${eur(t.mo)}</b> · ${nf(t.tot ? t.mo / t.tot * 100 : 0, 2)}% dei lavori</span></div><table class="tbl prm-tbl"><thead><tr><th>Tariffa</th><th>Designazione</th><th class="num">Importo €</th><th class="num">% MO</th><th class="num">Manodopera €</th></tr></thead><tbody>${rows.map(r => `<tr><td class="cod">${esc(r.e.c)}</td><td>${esc((r.e.d || '').slice(0, 90))}</td><td class="num">${nf(r.imp)}</td><td class="num">${nf(r.e.mo || 0)}</td><td class="num">${nf(r.mo)}</td></tr>`).join('')}</tbody><tfoot><tr class="hi"><td colspan="2">Totale</td><td class="num">${nf(t.tot)}</td><td class="num">${nf(t.tot ? t.mo / t.tot * 100 : 0)}</td><td class="num">${nf(t.mo)}</td></tr></tfoot></table><p class="tiny faint">L'incidenza percentuale per voce deriva dal prezzario o dall'analisi dei nuovi prezzi; il costo della manodopera è indicato separatamente negli atti di gara secondo il D.Lgs. 36/2023.</p>`;
  }
  function docSic(D) {
    const vs = a.voci.filter(v => (epOf(a, v.ep) || {}).sic); const t = A.totals(a);
    D.innerHTML = `<div class="prm-bar"><b>Costi della sicurezza</b><span class="grow"></span><span class="small">Totale <b>${eur(t.sic)}</b> · ${nf(t.tot ? t.sic / t.tot * 100 : 0)}% · non soggetti a ribasso</span></div><table class="tbl prm-tbl"><thead><tr><th>Tariffa</th><th>Designazione</th><th>U.M.</th><th class="num">Quantità</th><th class="num">Prezzo</th><th class="num">Importo €</th></tr></thead><tbody>${vs.map(v => { const e = epOf(a, v.ep); return `<tr><td class="cod">${esc(e.c)}</td><td>${esc(e.d)}</td><td>${esc(e.u)}</td><td class="num">${nf(A.voceQ(v))}</td><td class="num">${nf(e.p)}</td><td class="num">${nf(A.voceImp(a, v))}</td></tr>`; }).join('') || '<tr><td colspan="6" class="empty small">Nessuna voce della sicurezza: inserisci voci del capitolo “Costi della sicurezza” o contrassegna una voce dell\'elenco prezzi come sicurezza.</td></tr>'}</tbody></table><p class="tiny faint">Stima analitica dei costi della sicurezza secondo il piano di sicurezza e coordinamento (D.Lgs. 81/2008, Allegato XV).</p>`;
  }
  function docQE(D) {
    const q = A.qe(a, false), qp = A.qe(a, true);
    D.innerHTML = `<div class="prm-bar"><b>Quadro economico</b><span class="faint small">D.Lgs. 36/2023, Allegato I.7 · percentuali e importi modificabili</span><span class="grow"></span><button class="btn sm" data-a="pr:qe">${App.icon('print', 12)} Stampa</button><button class="btn sm" data-a="dx:qe">${App.icon('doc', 12)} DOCX</button></div>
      <table class="tbl prm-tbl prm-qe"><thead><tr><th></th><th>Descrizione</th><th>Calcolo</th><th class="num">Valore</th><th class="num">Progetto €</th><th class="num">Post-aggiudicazione €</th></tr></thead><tbody>
      <tr class="cat"><td>A</td><td colspan="5">LAVORI</td></tr><tr><td>a.1</td><td>Lavori soggetti a ribasso</td><td class="faint">dal computo</td><td></td><td class="num">${nf(q.lav)}</td><td class="num">${nf(qp.lav)}</td></tr><tr><td>a.2</td><td>Costi della sicurezza non soggetti a ribasso</td><td class="faint">dal computo</td><td></td><td class="num">${nf(q.sic)}</td><td class="num">${nf(qp.sic)}</td></tr><tr class="hi"><td></td><td>Totale lavori (A)</td><td></td><td></td><td class="num">${nf(q.A)}</td><td class="num">${nf(qp.A)}</td></tr>
      <tr class="cat"><td>B</td><td colspan="5">SOMME A DISPOSIZIONE DELLA STAZIONE APPALTANTE</td></tr>${q.rows.map((r, i) => `<tr data-q="${i}"><td>${r.k.replace('b', 'b.')}</td><td><input data-qf="d" value="${esc(r.d)}"></td><td><select data-qf="m" style="width:auto"><option value="pct" ${r.m === 'pct' ? 'selected' : ''}>% di ${r.base === 'b7' ? 'b.7' : r.base === 'b7b8' ? 'b.7+b.8' : 'A'}</option><option value="val" ${r.m === 'val' ? 'selected' : ''}>importo €</option></select></td><td><input data-qf="v" type="number" step="any" value="${r.v}" style="width:100px;text-align:right"></td><td class="num">${nf(q.val[r.k])}</td><td class="num">${nf(qp.val[r.k])}</td></tr>`).join('')}
      <tr class="hi"><td></td><td>Totale somme a disposizione (B)</td><td></td><td></td><td class="num">${nf(q.B)}</td><td class="num">${nf(qp.B)}</td></tr>${qp.economie ? `<tr><td></td><td>Economie da ribasso d'asta (${nf(a.gen.ribasso)}%)</td><td></td><td></td><td></td><td class="num">${nf(qp.economie)}</td></tr>` : ''}<tr class="tot"><td></td><td>TOTALE INTERVENTO (A + B)</td><td></td><td></td><td class="num">${nf(q.tot)}</td><td class="num">${nf(qp.tot + qp.economie)}</td></tr></tbody></table>
      <div class="row" style="margin-top:10px"><button class="btn sm" id="qeAdd">${App.icon('plus', 12)} Voce B</button><button class="btn sm ghost" id="qeReset">Ripristina schema</button></div>`;
    $$('tr[data-q]', D).forEach(tr => { const r = q.rows[+tr.dataset.q]; $$('[data-qf]', tr).forEach(i => i.onchange = () => { r[i.dataset.qf] = i.type === 'number' ? parseFloat(i.value) || 0 : i.value; changed('all'); }); });
    $('#qeAdd', D).onclick = () => { a.qe.push({ k: 'b' + (a.qe.length + 1), d: 'Altre somme', m: 'val', v: 0 }); changed('all'); }; $('#qeReset', D).onclick = () => { a.qe = null; changed('all'); };
  }
  function docCap(D) {
    const B = A.capitolato(a);
    D.innerHTML = `<div class="prm-bar"><b>Capitolato speciale d'appalto</b><span class="faint small">bozza generata dai dati di progetto, computo e cronoprogramma</span><span class="grow"></span><button class="btn sm" data-a="pr:cap">${App.icon('doc', 12)} Scarica DOCX</button><button class="btn sm" id="capPr">${App.icon('print', 12)} Stampa</button></div><div class="prm-page prm-paper">${B.map(b => b.t === 'h1' ? `<h2>${esc(b.text)}</h2>` : b.t === 'h2' ? `<h4>${esc(b.text)}</h4>` : b.t === 'li' ? `<div class="small" style="margin-left:14px">• ${esc(b.text)}</div>` : b.t === 'table' ? `<table class="tbl">${b.rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</table>` : b.t === 'small' ? `<div class="disclaimer">${esc(b.text)}</div>` : `<p>${esc(b.text)}</p>`).join('')}</div>`;
    $('#capPr', D).onclick = () => App.printBlocks('Capitolato speciale d\'appalto', B);
  }
  function cronoSVG(rows, W = 900) {
    const tot = Math.max(1, ...rows.map(r => r.start + r.dur)); const L = 230, H = 28, top = 34, sc = (W - L - 20) / tot; const imp = rows.reduce((s, r) => s + r.imp, 0) || 1; const pts = [];
    for (let d = 0; d <= tot; d += Math.max(1, Math.ceil(tot / 60))) { const done = rows.reduce((s, r) => s + r.imp * Math.max(0, Math.min(1, (d - r.start) / (r.dur || 1))), 0); pts.push([L + d * sc, top + rows.length * H - done / imp * (rows.length * H - 6)]); }
    const step = tot > 180 ? 30 : tot > 60 ? 7 : 1; const st = a.gen.consegna;
    return `<svg viewBox="0 0 ${W} ${top + rows.length * H + 30}" width="100%" class="prm-gantt"><g font-size="10" fill="#566170">${Array.from({ length: Math.floor(tot / step) + 1 }, (_, i) => `<line x1="${L + i * step * sc}" y1="${top - 6}" x2="${L + i * step * sc}" y2="${top + rows.length * H}" stroke="#e3e7ec"/><text x="${L + i * step * sc + 2}" y="${top - 10}">${st ? new Date(addDays(st, i * step)).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : 'g ' + i * step}</text>`).join('')}</g>${rows.map((r, i) => `<g><text x="6" y="${top + i * H + 18}" font-size="11.5" fill="#1f2833">${esc(r.c.nome.slice(0, 32))}</text><rect x="${L + r.start * sc}" y="${top + i * H + 6}" width="${Math.max(2, r.dur * sc)}" height="${H - 12}" rx="3" fill="#e8475f" opacity=".85"><title>${esc(r.c.nome)}: ${r.dur} gg dal giorno ${r.start}</title></rect><text x="${L + (r.start + r.dur) * sc + 4}" y="${top + i * H + 18}" font-size="10" fill="#566170">${r.dur} gg</text></g>`).join('')}<polyline points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#0a6cff" stroke-width="2"/><text x="${W - 150}" y="${top + rows.length * H + 22}" font-size="10" fill="#0a6cff">— curva di spesa prevista (S)</text></svg>`;
  }
  function docCrono(D) {
    const rows = A.crono(a).filter(r => r.imp > 0 || a.crono[r.c.id]); const dur = A.durata(a);
    D.innerHTML = `<div class="prm-bar"><b>Cronoprogramma dei lavori</b><span class="faint small">durate stimate dall'incidenza della manodopera (squadra di ${a.gen.squadra} operai × ${eur(a.gen.costoOra)}/h) · modificabili</span><span class="grow"></span><span class="small">Durata complessiva <b>${dur} giorni</b>${a.gen.consegna ? ` · fine prevista ${fdt(addDays(a.gen.consegna, dur))}` : ''}</span><button class="btn sm" data-a="pr:crono">${App.icon('print', 12)} Stampa</button></div>
      <div class="prm-page">${rows.length ? cronoSVG(rows) : '<div class="empty small">Inserisci voci nel computo per generare il cronoprogramma.</div>'}
      <table class="tbl prm-tbl" style="margin-top:12px"><thead><tr><th>Categoria</th><th class="num">Importo €</th><th class="num">Manodopera €</th><th class="num">Inizio (giorno)</th><th class="num">Durata (gg)</th><th class="num">Stimata</th><th></th></tr></thead><tbody>${rows.map(r => `<tr data-c="${r.c.id}"><td>${esc(r.c.nome)}</td><td class="num">${nf(r.imp)}</td><td class="num">${nf(r.mo)}</td><td><input data-cr="start" type="number" value="${r.start}" style="width:70px;text-align:right"></td><td><input data-cr="dur" type="number" value="${r.dur}" style="width:70px;text-align:right"></td><td class="num faint">${r.auto}</td><td><button class="btn sm ghost" data-crr title="Ripristina stima">↺</button></td></tr>`).join('')}</tbody></table>
      <label class="chk small" style="margin-top:10px"><input type="checkbox" id="crUse" ${a.gen.durata ? 'checked' : ''}> Usa la durata del cronoprogramma come tempo utile contrattuale (${dur} gg)</label></div>`;
    $$('tr[data-c]', D).forEach(tr => { const o = a.crono[tr.dataset.c] = a.crono[tr.dataset.c] || {}; $$('[data-cr]', tr).forEach(i => i.onchange = () => { o[i.dataset.cr] = Math.max(0, parseInt(i.value) || 0); changed('all'); }); $('[data-crr]', tr).onclick = () => { delete a.crono[tr.dataset.c]; changed('all'); }; });
    $('#crUse', D).onchange = e => { a.gen.durata = e.target.checked ? dur : 0; changed('all'); };
  }
  function docGiorn(D) {
    D.innerHTML = `<div class="prm-bar"><b>Giornale dei lavori</b><span class="grow"></span><button class="btn sm primary" data-a="newGiorn">${App.icon('plus', 12)} Annotazione</button><button class="btn sm" data-a="dx:giorn">${App.icon('doc', 12)} DOCX</button></div><table class="tbl prm-tbl"><thead><tr><th>Data</th><th>Meteo</th><th class="num">Operai</th><th>Mezzi e attrezzature</th><th>Lavorazioni eseguite</th><th>Annotazioni del DL</th><th></th></tr></thead><tbody>${a.giornale.slice().sort((x, y) => String(y.data).localeCompare(x.data)).map(g => `<tr data-gi="${g.id}"><td>${fdt(g.data)}</td><td>${esc(g.meteo)}</td><td class="num">${g.operai || 0}</td><td>${esc(g.mezzi || '')}</td><td>${esc(g.lav || '')}</td><td>${esc(g.note || '')}</td><td><button class="btn sm ghost" data-gdel>✕</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty small">Nessuna annotazione</td></tr>'}</tbody></table>`;
    $$('[data-gdel]', D).forEach(b => b.onclick = () => { a.giornale = a.giornale.filter(g => g.id !== b.closest('tr').dataset.gi); changed('all'); });
  }
  function docOrd(D) {
    D.innerHTML = `<div class="prm-bar"><b>Ordini di servizio</b><span class="grow"></span><button class="btn sm primary" data-a="newOrd">${App.icon('plus', 12)} Ordine di servizio</button></div><table class="tbl prm-tbl"><thead><tr><th>N.</th><th>Data</th><th>Oggetto</th><th>Disposizioni</th><th></th></tr></thead><tbody>${a.ordini.map((o, i) => `<tr data-oi="${i}"><td>${i + 1}</td><td>${fdt(o.data)}</td><td>${esc(o.ogg)}</td><td class="small">${esc(o.testo)}</td><td><button class="btn sm" data-odx>DOCX</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty small">Nessun ordine di servizio</td></tr>'}</tbody></table>`;
    $$('[data-odx]', D).forEach(b => b.onclick = () => { const i = +b.closest('tr').dataset.oi, o = a.ordini[i]; App.download(`Ordine_di_servizio_${i + 1}.docx`, App.docx.make([{ t: 'h1', text: `Ordine di servizio n. ${i + 1}` }, { t: 'p', text: `Lavori: ${a.gen.opera} · Esecutore: ${a.gen.impresa || '…'} · Data: ${fdt(o.data)}` }, { t: 'h2', text: o.ogg }, { t: 'p', text: o.testo }, { t: 'table', rows: [['Il direttore dei lavori', 'L\'esecutore (per ricevuta)'], [a.gen.dl || '', a.gen.impresa || '']] }])); });
  }
  const VT = { consegna: 'Consegna lavori', sospensione: 'Sospensione', ripresa: 'Ripresa', ultimazione: 'Certificato di ultimazione', cre: 'Certificato di regolare esecuzione', altro: 'Altro verbale' };
  function docVerb(D) {
    D.innerHTML = `<div class="prm-bar"><b>Verbali e certificati</b><span class="grow"></span><button class="btn sm primary" data-a="newVerb">${App.icon('plus', 12)} Nuovo verbale</button></div><table class="tbl prm-tbl"><thead><tr><th>Data</th><th>Tipo</th><th>Note</th><th></th></tr></thead><tbody>${a.verbali.map((v, i) => `<tr data-vi="${i}"><td>${fdt(v.data)}</td><td><b>${esc(VT[v.tipo] || v.tipo)}</b></td><td class="small">${esc(v.note || '')}</td><td><button class="btn sm" data-vdx>DOCX</button><button class="btn sm ghost" data-vdel>✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty small">Nessun verbale. La consegna dei lavori avvia la fase di esecuzione.</td></tr>'}</tbody></table>`;
    $$('[data-vdx]', D).forEach(b => b.onclick = () => { const v = a.verbali[+b.closest('tr').dataset.vi]; App.download(`${App.slug(VT[v.tipo])}_${v.data || ''}.docx`, App.docx.make(A.verbaleBlocks(a, v))); });
    $$('[data-vdel]', D).forEach(b => b.onclick = () => { a.verbali.splice(+b.closest('tr').dataset.vi, 1); changed('all'); });
  }
  function docLib(D) {
    const byV = a.voci.map(v => ({ v, e: epOf(a, v.ep) || {}, ms: a.misure.filter(m => m.voce === v.id) })).filter(x => x.ms.length);
    D.innerHTML = `<div class="prm-bar"><b>Libretto delle misure</b><span class="faint small">le misure non ancora inserite in un SAL sono modificabili</span><span class="grow"></span><button class="btn sm primary" data-a="newMis">${App.icon('plus', 12)} Misura</button><button class="btn sm" data-a="avanz">Avanzamento %</button><button class="btn sm" data-a="emettiSal">${App.icon('acc', 12)} Emetti SAL</button></div>
      <table class="prm-grid"><thead><tr><th style="width:90px">Data</th><th style="width:96px">Tariffa</th><th>Designazione / misura</th><th style="width:60px">Par.ug.</th><th style="width:66px">Lung.</th><th style="width:66px">Larg.</th><th style="width:66px">H/peso</th><th style="width:86px">Quantità</th><th style="width:60px">SAL</th><th style="width:40px"></th></tr></thead><tbody>${byV.map(({ v, e, ms }) => `<tr class="voce"><td></td><td class="cod">${esc(e.c)}</td><td colspan="8"><b>${esc(e.d)}</b> <span class="faint small">· progetto ${nf(A.voceQ(v))} ${esc(e.u)} · contabilizzato ${nf(A.qContab(a, v.id))}</span></td></tr>` + ms.map(m => { const lock = !!m.sal; const c = k => `<td class="n"><input data-mk="${k}" value="${esc(m[k] ?? '')}" ${lock ? 'disabled' : ''}></td>`; return `<tr class="mis" data-m="${m.id}"><td><input type="date" data-mk="data" value="${m.data || ''}" ${lock ? 'disabled' : ''}></td><td></td><td><input data-mk="d" value="${esc(m.d || '')}" ${lock ? 'disabled' : ''}></td>${c('pu')}${c('l')}${c('w')}${c('h')}<td class="n">${nf(A.rowQ(m))}</td><td class="n">${m.sal ? `<span class="pill ok">${m.sal}</span>` : '<span class="pill">—</span>'}</td><td>${lock ? '' : '<button class="btn sm ghost" data-mdel>✕</button>'}</td></tr>`; }).join('')).join('') || '<tr><td colspan="10" class="empty small">Nessuna misura registrata. Usa “Misura” o “Avanzamento %”.</td></tr>'}</tbody></table>`;
    $$('tr[data-m]', D).forEach(tr => { const m = a.misure.find(x => x.id === tr.dataset.m); $$('[data-mk]', tr).forEach(i => i.onchange = () => { m[i.dataset.mk] = i.value; changed('all'); }); const d = $('[data-mdel]', tr); if (d) d.onclick = () => { a.misure = a.misure.filter(x => x !== m); changed('all'); }; });
  }
  function docReg(D) {
    const n = a.sal.length;
    D.innerHTML = `<div class="prm-bar"><b>Registro di contabilità</b><span class="faint small">quantità contabilizzate progressive per SAL</span></div><table class="tbl prm-tbl"><thead><tr><th>Tariffa</th><th>Designazione</th><th>U.M.</th><th class="num">Q. progetto</th>${a.sal.map(s => `<th class="num">SAL ${s.n}</th>`).join('')}<th class="num">Q. totale</th><th class="num">%</th><th class="num">Importo €</th></tr></thead><tbody>${a.voci.map(v => { const e = epOf(a, v.ep) || {}; const qp = A.voceQ(v), qc = A.qContab(a, v.id, n || 0); return `<tr><td class="cod">${esc(e.c)}</td><td>${esc((e.d || '').slice(0, 70))}</td><td>${esc(e.u)}</td><td class="num">${nf(qp)}</td>${a.sal.map(s => `<td class="num">${nf(A.qContab(a, v.id, s.n))}</td>`).join('')}<td class="num">${nf(qc)}</td><td class="num"><span class="prm-bar-pct" style="--p:${Math.min(100, qp ? qc / qp * 100 : 0)}%">${nf(qp ? qc / qp * 100 : 0, 0)}%</span></td><td class="num">${nf(qc * (e.p || 0))}</td></tr>`; }).join('')}</tbody></table>`;
  }
  function docSal(D) {
    D.innerHTML = `<div class="prm-bar"><b>Stati di avanzamento e certificati di pagamento</b><span class="grow"></span><button class="btn sm primary" data-a="emettiSal">${App.icon('acc', 12)} Emetti SAL n. ${a.sal.length + 1}</button></div><div class="prm-page">${a.sal.length ? '' : '<div class="empty small">Nessun SAL emesso. Registra le misure nel libretto, poi emetti il SAL.</div>'}${a.sal.map(s => { const c = A.salPay(a, s.n); return `<div class="card prm-sal"><div class="row between"><h4 style="margin:0">SAL n. ${s.n} · lavori a tutto il ${fdt(s.data)}</h4><div class="row"><button class="btn sm" data-sdx="${s.n}">${App.icon('doc', 12)} SAL e certificato (DOCX)</button>${s.n === a.sal.length ? `<button class="btn sm ghost" data-sdel="${s.n}">Annulla SAL</button>` : ''}</div></div><div class="kpi" style="margin-top:10px"><div class="card"><b>${eur(c.lav)}</b><span>lavori lordi progressivi</span></div><div class="card"><b>${eur(c.netto)}</b><span>netto progressivo (ribasso ${nf(a.gen.ribasso)}%)</span></div><div class="card"><b>${eur(c.rit + c.ant)}</b><span>ritenute e recupero anticipazione</span></div><div class="card hi"><b>${eur(c.questo)}</b><span>certificato di pagamento n. ${s.n} (+ IVA ${eur(c.iva)})</span></div></div></div>`; }).join('')}</div>`;
    $$('[data-sdx]', D).forEach(b => b.onclick = () => App.download(`SAL_${b.dataset.sdx}_${App.slug(a.gen.opera)}.docx`, App.docx.make(A.salBlocks(a, +b.dataset.sdx))));
    $$('[data-sdel]', D).forEach(b => b.onclick = async () => { if (!await App.confirm('Annulla SAL', 'Le misure del SAL tornano modificabili. Continuare?')) return; const n = +b.dataset.sdel; a.misure.forEach(m => { if (m.sal === n) m.sal = null; }); a.sal.pop(); changed('all'); });
  }
  function docFin(D) {
    const n = a.sal.length; const rows = a.voci.map(v => { const e = epOf(a, v.ep) || {}; const qp = A.voceQ(v), qf = A.qContab(a, v.id, n); return { e, qp, qf, ip: r2(qp * (e.p || 0)), iF: r2(qf * (e.p || 0)) }; }); const tp = rows.reduce((s, r) => s + r.ip, 0), tf = rows.reduce((s, r) => s + r.iF, 0); const c = n ? A.salCalc(a, n) : null;
    D.innerHTML = `<div class="prm-bar"><b>Stato finale e confronto progetto / contabilità</b><span class="grow"></span><button class="btn sm" data-a="newVerb">Certificato di ultimazione / CRE</button></div><div class="prm-page"><div class="kpi"><div class="card"><b>${eur(tp)}</b><span>importo di progetto</span></div><div class="card"><b>${eur(tf)}</b><span>importo contabilizzato (lordo)</span></div><div class="card"><b>${eur(tf - tp)}</b><span>variazione (${nf(tp ? (tf - tp) / tp * 100 : 0, 1)}%)</span></div><div class="card"><b>${c ? eur(c.netto) : '—'}</b><span>stato finale netto</span></div></div>
      <table class="tbl prm-tbl" style="margin-top:12px"><thead><tr><th>Tariffa</th><th>Designazione</th><th class="num">Q. progetto</th><th class="num">Q. eseguita</th><th class="num">Δ</th><th class="num">Importo progetto</th><th class="num">Importo eseguito</th></tr></thead><tbody>${rows.map(r => `<tr class="${Math.abs(r.qf - r.qp) > .005 ? 'diff' : ''}"><td class="cod">${esc(r.e.c)}</td><td>${esc((r.e.d || '').slice(0, 70))}</td><td class="num">${nf(r.qp)}</td><td class="num">${nf(r.qf)}</td><td class="num">${nf(r.qf - r.qp)}</td><td class="num">${nf(r.ip)}</td><td class="num">${nf(r.iF)}</td></tr>`).join('')}</tbody></table>${c ? `<p class="small">Ritenute a garanzia accantonate da svincolare con il certificato di regolare esecuzione / collaudo: <b>${eur(c.rit)}</b>.</p>` : ''}</div>`;
  }
  function docPrz(D) {
    const imp = (App.state.prezzari || []);
    D.innerHTML = `<div class="prm-bar"><b>Prezzari regionali</b><span class="grow"></span><button class="btn sm primary" data-a="impPz">${App.icon('upload', 12)} Importa prezzario</button></div><div class="prm-page">
      <div class="disclaimer">I prezzari regionali dei lavori pubblici sono approvati e pubblicati da ciascuna Regione o Provincia autonoma (aggiornamento annuale, art. 41 D.Lgs. 36/2023). Scarica il file dal sito ufficiale dell'ente o dalla raccolta su <b>acca.it/prezzari-regionali</b> e importalo qui: sono supportati <b>XML SIX</b>, <b>XPWE</b>, <b>XLSX</b> e <b>CSV</b> (anche dentro uno ZIP). Il prezzario resta salvato su questo computer e si può usare in tutti i progetti, anche senza connessione.</div>
      <div class="row" style="margin:12px 0"><button class="btn sm" id="pzWeb">${App.icon('globe', 12)} Apri l'elenco dei prezzari (online)</button></div>
      <table class="tbl prm-tbl"><thead><tr><th>Regione / ente</th><th>Prezzari importati</th><th></th></tr></thead><tbody><tr><td><b>Dimostrativo</b></td><td>${esc(App.accDemo.nome)} · ${demoVoci().length} voci <span class="pill warn">valori indicativi</span></td><td><button class="btn sm" data-use="demo">${a.prezzario === 'demo' ? 'In uso' : 'Usa'}</button></td></tr>${REGIONI.map(r => { const mine = imp.filter(x => x.regione === r); return `<tr><td>${esc(r)}</td><td>${mine.map(x => `<div class="row"><span>${esc(x.nome)} · ${x.n.toLocaleString('it-IT')} voci${x.fonte ? ' · ' + esc(x.fonte) : ''}</span><button class="btn sm" data-use="${x.id}">${a.prezzario === x.id ? 'In uso' : 'Usa'}</button><button class="btn sm ghost" data-pdel="${x.id}">✕</button></div>`).join('') || '<span class="faint small">non importato</span>'}</td><td><button class="btn sm" data-impr="${esc(r)}">${App.icon('upload', 12)} Importa…</button></td></tr>`; }).join('')}${imp.filter(x => !REGIONI.includes(x.regione)).map(x => `<tr><td>${esc(x.regione)}</td><td>${esc(x.nome)} · ${x.n} voci</td><td><button class="btn sm" data-use="${x.id}">Usa</button><button class="btn sm ghost" data-pdel="${x.id}">✕</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#pzWeb', D).onclick = () => window.open('https://www.acca.it/prezzari-regionali', '_blank');
    $$('[data-use]', D).forEach(b => b.onclick = () => { a.prezzario = b.dataset.use; changed('all'); renderPz(); });
    $$('[data-impr]', D).forEach(b => b.onclick = async () => { const id = await A.importPrezzario(b.dataset.impr); if (id) { a.prezzario = id; changed('all'); renderPz(); fillPzSel($('#rbPz')); } });
    $$('[data-pdel]', D).forEach(b => b.onclick = async () => { if (!await App.confirm('Rimuovi prezzario', 'Il prezzario viene rimosso dall\'archivio locale (le voci già usate restano nei computi). Continuare?')) return; await KV.del(b.dataset.pdel); delete cache[b.dataset.pdel]; App.state.prezzari = App.state.prezzari.filter(x => x.id !== b.dataset.pdel); if (a.prezzario === b.dataset.pdel) a.prezzario = 'demo'; App.save(); changed('all'); renderPz(); });
  }

  /* ---------- azioni ---------- */
  async function act(k, btn) {
    if (k.startsWith('d:')) return go(k.slice(2));
    if (k.startsWith('go:')) { location.hash = '#/' + k.slice(3); return; }
    const sv = () => a.voci.find(v => v.id === selVoce);
    const F = {
      addCat: async () => { const r = await App.form('Nuova categoria di lavoro', [{ name: 'n', label: 'Nome', value: 'Nuova categoria' }, { name: 's', label: 'Classificazione SOA (es. OG1, OS6)', value: '' }]); if (!r) return; const c = { id: App.uid(), nome: r.n, soa: r.s }; a.cats.push(c); curCat = c.id; changed('all'); },
      addVoce: async () => { if (!a.ep.length) { App.toast('L\'elenco prezzi è vuoto: fai doppio clic su una voce del prezzario a destra', 'info'); $('#aPzQ').focus(); return; } const r = await App.form('Inserisci voce da elenco prezzi', [{ name: 'e', label: 'Voce', type: 'select', options: a.ep.map(e => ({ value: e.id, label: `${e.c} – ${e.d.slice(0, 70)}` })) }, { name: 'c', label: 'Categoria', type: 'select', options: a.cats.map(c => ({ value: c.id, label: c.nome })), value: curCat }]); if (!r) return; const v = A.addVoce(a, a.ep.find(e => e.id === r.e), r.c); selVoce = v.id; go('comp'); changed(); },
      addRow: () => { const v = sv(); if (!v) { App.toast('Seleziona una voce del computo', 'warn'); return; } v.righe.push(newRow()); changed(); go('comp'); },
      dupVoce: () => { const v = sv(); if (!v) { App.toast('Seleziona una voce del computo', 'warn'); return; } const n = App.clone(v); n.id = App.uid(); n.righe.forEach(r => { r.id = App.uid(); delete r.link; }); a.voci.splice(a.voci.indexOf(v) + 1, 0, n); changed('all'); },
      delVoce: async () => { const v = sv(); if (!v) { App.toast('Seleziona una voce del computo', 'warn'); return; } if (a.misure.some(m => m.voce === v.id)) { App.toast('La voce ha misure contabilizzate', 'warn'); return; } if (!await App.confirm('Elimina voce', 'Eliminare la voce selezionata e le sue righe di misura?')) return; a.voci = a.voci.filter(x => x !== v); selVoce = null; changed('all'); },
      moveVoce: async () => { const v = sv(); if (!v) { App.toast('Seleziona una voce del computo', 'warn'); return; } const r = await App.form('Sposta voce', [{ name: 'c', label: 'Categoria', type: 'select', options: a.cats.map(c => ({ value: c.id, label: c.nome })), value: v.cat }]); if (r) { v.cat = r.c; changed('all'); } },
      newNP: async () => { const r = await App.form('Nuovo prezzo (NP)', [{ name: 'c', label: 'Codice', value: 'NP.' + String(a.ep.filter(e => e.np).length + 1).padStart(2, '0') }, { name: 'd', label: 'Descrizione sintetica', value: '' }, { name: 'de', label: 'Descrizione estesa', type: 'textarea', value: '' }, { name: 'u', label: 'Unità di misura', value: 'm²' }]); if (!r || !r.d) return; const e = { id: App.uid(), c: r.c, d: r.d, de: r.de || r.d, u: r.u, p: 0, mo: 0, np: true, src: 'Nuovo prezzo (analisi)', an: { righe: [], sg: 15, ui: 10 } }; a.ep.push(e); A.state.np = e.id; changed(); go('an'); },
      refresh: async () => { const r = await A.refreshLinks(P, a); App.toast(`Quantità aggiornate: ${r.upd} righe${r.gone ? ` · ${r.gone} elementi non più presenti nel modello` : ''}`, r.gone ? 'warn' : 'ok'); changed('all'); },
      impPz: async () => { const id = await A.importPrezzario(); if (id) { a.prezzario = id; changed('all'); renderPz(); fillPzSel($('#rbPz')); } },
      fromBim: () => A.importFrom('bim', P, a, () => { go('comp'); changed('all'); }), fromCad: () => A.importFrom('cad', P, a, () => { go('comp'); changed('all'); }), fromGis: () => A.importFrom('gis', P, a, () => { go('comp'); changed('all'); }),
      impX: async () => { const [f] = await App.pickFiles({ accept: '.xpwe,.xml' }); if (!f) return; try { const n = A.importXPWE(a, await App.readText(f)); App.toast(`${n} voci importate da ${f.name}`, 'ok'); go('comp'); changed('all'); } catch (e) { App.toast('XPWE non valido: ' + e.message, 'err'); } },
      expX: () => App.download(App.slug(a.gen.opera) + '.xpwe', A.exportXPWE(a), 'application/xml'),
      expCsv: () => { const rows = [['N', 'Categoria', 'Tariffa', 'Descrizione', 'UM', 'Quantita', 'Prezzo', 'Importo']]; a.voci.forEach((v, i) => { const e = epOf(a, v.ep) || {}; rows.push([i + 1, (a.cats.find(c => c.id === v.cat) || {}).nome, e.c, e.d, e.u, String(A.voceQ(v)).replace('.', ','), String(e.p).replace('.', ','), String(A.voceImp(a, v)).replace('.', ',')]); }); App.download(App.slug(a.gen.opera) + '_computo.csv', '﻿' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv'); },
      newMis: async () => { if (!a.voci.length) { App.toast('Il computo è vuoto', 'warn'); return; } const r = await App.form('Nuova misura (libretto)', [{ name: 'v', label: 'Voce', type: 'select', options: a.voci.map(v => { const e = epOf(a, v.ep) || {}; return { value: v.id, label: `${e.c} – ${(e.d || '').slice(0, 60)} (${e.u})` }; }), value: selVoce }, { name: 'data', label: 'Data', type: 'date', value: new Date().toISOString().slice(0, 10) }, { name: 'd', label: 'Descrizione / ubicazione', value: '' }, { type: 'html', html: '<div class="grid2">' }, { name: 'pu', label: 'Parti uguali', value: '' }, { name: 'l', label: 'Lunghezza', value: '' }, { name: 'w', label: 'Larghezza', value: '' }, { name: 'h', label: 'H / peso', value: '' }, { type: 'html', html: '</div>' }]); if (!r) return; a.misure.push({ id: App.uid(), voce: r.v, data: r.data, d: r.d, pu: r.pu, l: r.l, w: r.w, h: r.h, q: '', sal: null }); changed(); go('lib'); },
      avanz: async () => { if (!a.voci.length) { App.toast('Il computo è vuoto', 'warn'); return; } const body = `<p class="small muted" style="margin-top:0">Percentuale di avanzamento <b>cumulata</b> per voce: viene registrata la quantità mancante rispetto a quanto già contabilizzato.</p><div style="max-height:50vh;overflow:auto"><table class="tbl"><thead><tr><th>Tariffa</th><th>Designazione</th><th class="num">Contab.</th><th class="num">% cumulata</th></tr></thead><tbody>${a.voci.map(v => { const e = epOf(a, v.ep) || {}; const qp = A.voceQ(v), qc = A.qContab(a, v.id); return `<tr><td class="cod">${esc(e.c)}</td><td class="small">${esc((e.d || '').slice(0, 60))}</td><td class="num">${nf(qp ? qc / qp * 100 : 0, 0)}%</td><td><input type="number" data-av="${v.id}" min="0" max="100" value="${Math.round(qp ? qc / qp * 100 : 0)}" style="width:70px"></td></tr>`; }).join('')}</tbody></table></div><label class="f"><span>Data delle misure</span><input type="date" id="avD" value="${new Date().toISOString().slice(0, 10)}"></label>`;
        const res = await App.modal({ title: 'Avanzamento lavori per voce', size: 'wide', body, actions: [{ label: App.t('cancel'), value: null }, { label: 'Registra misure', primary: true, value: b => ({ d: $('#avD', b).value, list: $$('[data-av]', b).map(i => [i.dataset.av, +i.value]) }) }] }); if (!res) return;
        let n = 0; res.list.forEach(([vid, pct]) => { const v = a.voci.find(x => x.id === vid); const qp = A.voceQ(v), qc = A.qContab(a, vid); const dq = r2(qp * Math.min(100, Math.max(0, pct)) / 100 - qc); if (Math.abs(dq) > .004) { a.misure.push({ id: App.uid(), voce: vid, data: res.d, d: `Avanzamento al ${pct}%`, q: String(dq), pu: '', l: '', w: '', h: '', sal: null }); n++; } }); App.toast(`${n} misure registrate`, 'ok'); changed(); go('lib'); },
      emettiSal: async () => { const open = a.misure.filter(m => !m.sal); if (!open.length) { App.toast('Nessuna misura da contabilizzare: registra prima le misure nel libretto', 'warn'); return; } const nn = a.sal.length + 1; const r = await App.form(`Emetti SAL n. ${nn}`, [{ name: 'data', label: 'Lavori a tutto il', type: 'date', value: new Date().toISOString().slice(0, 10) }, { type: 'html', html: `<div class="small muted">${open.length} misure non ancora contabilizzate (fino alla data indicata).</div>` }]); if (!r) return; const ms = open.filter(m => !m.data || m.data <= r.data); if (!ms.length) { App.toast('Nessuna misura entro la data indicata', 'warn'); return; } ms.forEach(m => m.sal = nn); a.sal.push({ n: nn, data: r.data, at: App.now() }); const c = A.salPay(a, nn); if (a.gen.sogliaSal && c.questo < a.gen.sogliaSal) App.toast(`Attenzione: importo del certificato (${eur(c.questo)}) inferiore alla soglia contrattuale`, 'warn'); App.audit('sal', `SAL n. ${nn}: ${eur(c.questo)}`); changed(); go('salv'); },
      newGiorn: async () => { const r = await App.form('Giornale dei lavori – annotazione', [{ name: 'data', label: 'Data', type: 'date', value: new Date().toISOString().slice(0, 10) }, { name: 'meteo', label: 'Condizioni meteo', type: 'select', options: ['Sereno', 'Nuvoloso', 'Pioggia', 'Vento forte', 'Neve', 'Gelo'] }, { name: 'operai', label: 'Operai presenti', type: 'number', value: a.gen.squadra }, { name: 'mezzi', label: 'Mezzi e attrezzature', value: '' }, { name: 'lav', label: 'Lavorazioni eseguite', type: 'textarea', value: '' }, { name: 'note', label: 'Annotazioni, disposizioni e osservazioni del DL', type: 'textarea', value: '' }]); if (!r) return; a.giornale.push(Object.assign({ id: App.uid() }, r)); changed(); go('giorn'); },
      newOrd: async () => { const r = await App.form('Ordine di servizio', [{ name: 'data', label: 'Data', type: 'date', value: new Date().toISOString().slice(0, 10) }, { name: 'ogg', label: 'Oggetto', value: '' }, { name: 'testo', label: 'Disposizioni', type: 'textarea', rows: 6, value: '' }]); if (!r || !r.ogg) return; a.ordini.push(r); changed(); go('ord'); },
      newVerb: async () => { const r = await App.form('Nuovo verbale / certificato', [{ name: 'tipo', label: 'Tipo', type: 'select', options: Object.entries(VT).map(([v, l]) => ({ value: v, label: l })), value: a.verbali.some(v => v.tipo === 'consegna') ? (a.verbali.some(v => v.tipo === 'ultimazione') ? 'cre' : 'ultimazione') : 'consegna' }, { name: 'data', label: 'Data', type: 'date', value: new Date().toISOString().slice(0, 10) }, { name: 'note', label: 'Note / motivazioni', type: 'textarea', value: '' }]); if (!r) return; a.verbali.push(r); if (r.tipo === 'consegna' && !a.gen.consegna) a.gen.consegna = r.data; changed(); go('verb'); },
      'pr:comp': () => A.printHTML('Computo metrico estimativo', A.computoHTML(a)), 'pr:cm': () => A.printHTML('Computo metrico', A.computoHTML(a, { estimativo: false })), 'pr:ep': () => A.printHTML('Elenco prezzi', A.epHTML(a)), 'pr:qe': () => A.printHTML('Quadro economico', A.qeHTML(a)),
      'pr:cap': () => App.download('Capitolato_speciale_' + App.slug(a.gen.opera) + '.docx', App.docx.make(A.capitolato(a))),
      'pr:crono': () => { const rows = A.crono(a).filter(r => r.imp > 0); A.printHTML('Cronoprogramma', hdr(a, 'Cronoprogramma dei lavori') + cronoSVG(rows, 1000) + `<table><thead><tr><th>Categoria</th><th>Inizio (g)</th><th>Durata (gg)</th><th>Importo €</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.c.nome)}</td><td class="n">${r.start}</td><td class="n">${r.dur}</td><td class="n">${nf(r.imp)}</td></tr>`).join('')}</tbody></table>`); },
      'dx:comp': () => { let n = 0; App.download('Computo_' + App.slug(a.gen.opera) + '.docx', App.docx.make([{ t: 'h1', text: 'Computo metrico estimativo – ' + a.gen.opera }, ...a.cats.flatMap(c => { const vs = a.voci.filter(v => v.cat === c.id); return vs.length ? [{ t: 'h2', text: c.nome }, { t: 'table', rows: [['N.', 'Tariffa', 'Designazione', 'U.M.', 'Quantità', 'Prezzo €', 'Importo €'], ...vs.map(v => { const e = epOf(a, v.ep) || {}; return [++n, e.c, e.d, e.u, nf(A.voceQ(v)), nf(e.p), nf(A.voceImp(a, v))]; })] }] : []; }), { t: 'table', rows: [['Riepilogo', 'Importo €'], ['Lavori soggetti a ribasso', nf(A.totals(a).lav)], ['Costi della sicurezza', nf(A.totals(a).sic)], ['Totale lavori', nf(A.totals(a).tot)]] }])); },
      'dx:qe': () => { const q = A.qe(a, false); App.download('Quadro_economico_' + App.slug(a.gen.opera) + '.docx', App.docx.make([{ t: 'h1', text: 'Quadro economico – ' + a.gen.opera }, { t: 'small', text: 'Articolazione secondo il D.Lgs. 36/2023, Allegato I.7' }, { t: 'table', rows: [['', 'Descrizione', 'Importo €'], ['a.1', 'Lavori soggetti a ribasso', nf(q.lav)], ['a.2', 'Costi della sicurezza', nf(q.sic)], ['A', 'Totale lavori', nf(q.A)], ...q.rows.map(r => [r.k.replace('b', 'b.'), r.d, nf(q.val[r.k])]), ['B', 'Totale somme a disposizione', nf(q.B)], ['', 'TOTALE INTERVENTO', nf(q.tot)]] }])); },
      'dx:giorn': () => App.download('Giornale_lavori_' + App.slug(a.gen.opera) + '.docx', App.docx.make([{ t: 'h1', text: 'Giornale dei lavori – ' + a.gen.opera }, { t: 'table', rows: [['Data', 'Meteo', 'Operai', 'Mezzi', 'Lavorazioni', 'Annotazioni'], ...a.giornale.slice().sort((x, y) => String(x.data).localeCompare(y.data)).map(g => [fdt(g.data), g.meteo, g.operai, g.mezzi, g.lav, g.note])] }]))
    };
    (F[k] || (() => App.toast('Comando non disponibile', 'warn')))();
  }
})();
