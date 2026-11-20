/* BeCity – writer PDF (vettoriale + GeoPDF) e DOCX, sviluppati in casa */
'use strict';
App.pdf = {
  str: s => '(' + String(s).replace(/[\\()]/g, m => '\\' + m).replace(/[\r\n]+/g, ' ') + ')',
  latin1(s) { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); u[i] = c < 256 ? c : c === 8364 ? 128 : c === 8217 || c === 8216 ? 39 : c === 8220 || c === 8221 ? 34 : c === 8211 || c === 8212 ? 45 : 63; } return u; },
  /** pages: [{w,h,content,images:[{name,data(Uint8Array jpeg),w,h}],geo:{gpts:[lat,lon x4], wkt}}] */
  make(pages, meta = {}) {
    const objs = []; const add = o => { objs.push(o); return objs.length; };
    const catalog = add(null), pagesId = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const pg of pages) {
      const xo = [];
      for (const im of (pg.images || [])) { const id = add({ dict: `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>`, bin: im.data }); xo.push(`/${im.name} ${id} 0 R`); }
      const content = App.pdf.latin1(pg.content);
      const cid = add({ dict: `<< /Length ${content.length} >>`, bin: content });
      let vp = '';
      if (pg.geo) { const g = pg.geo; vp = ` /VP [<< /Type /Viewport /BBox [${g.bbox.join(' ')}] /Name (Mappa) /Measure << /Type /Measure /Subtype /GEO /Bounds [0 0 0 1 1 1 1 0] /GPTS [${g.gpts.map(v => v.toFixed(8)).join(' ')}] /LPTS [0 0 0 1 1 1 1 0] /GCS << /Type /GEOGCS /EPSG 4326 /WKT ${App.pdf.str(g.wkt || 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]')} >> >> >>]`; }
      const pid = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pg.w.toFixed(2)} ${pg.h.toFixed(2)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /XObject << ${xo.join(' ')} >> >> /Contents ${cid} 0 R${vp} >>`);
      kids.push(pid);
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    const info = add(`<< /Title ${App.pdf.str(meta.title || 'BeCity')} /Producer (BeCity PDF writer) /Creator (BeCity) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}) >>`);
    const chunks = []; let len = 0; const offs = [];
    const push = u => { chunks.push(u); len += u.length; };
    push(App.pdf.latin1('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'));
    objs.forEach((o, i) => {
      offs[i] = len;
      if (typeof o === 'string') push(App.pdf.latin1(`${i + 1} 0 obj\n${o}\nendobj\n`));
      else { push(App.pdf.latin1(`${i + 1} 0 obj\n${o.dict}\nstream\n`)); push(o.bin); push(App.pdf.latin1('\nendstream\nendobj\n')); }
    });
    const xref = len;
    let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`; offs.forEach(o => x += String(o).padStart(10, '0') + ' 00000 n \n');
    x += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    push(App.pdf.latin1(x));
    return new Blob(chunks, { type: 'application/pdf' });
  },
  dataURLtoBytes(d) { const b = atob(d.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
};

/* DOCX minimale (WordprocessingML) */
App.docx = {
  x: s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  run(text, o = {}) { return `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${o.sz || 21}"/></w:rPr><w:t xml:space="preserve">${App.docx.x(text)}</w:t></w:r>`; },
  para(text, o = {}) { const runs = Array.isArray(text) ? text.map(t => typeof t === 'string' ? App.docx.run(t, o) : App.docx.run(t.t, Object.assign({}, o, t))).join('') : App.docx.run(text, o); return `<w:p><w:pPr>${o.list ? '<w:ind w:left="360" w:hanging="240"/>' : ''}<w:spacing w:after="${o.after ?? 100}"/>${o.align ? `<w:jc w:val="${o.align}"/>` : ''}</w:pPr>${o.list ? App.docx.run('• ', o) : ''}${runs}</w:p>`; },
  table(rows, header = true) {
    const b = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => `<w:${k} w:val="single" w:sz="4" w:color="BFC7D3"/>`).join('') + '</w:tblBorders>';
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${b}</w:tblPr>` + rows.map((r, i) => `<w:tr>${r.map(c => `<w:tc>${i === 0 && header ? '<w:tcPr><w:shd w:val="clear" w:fill="EEF2F7"/></w:tcPr>' : ''}${App.docx.para(String(c ?? ''), { b: i === 0 && header, sz: 18, after: 0 })}</w:tc>`).join('')}</w:tr>`).join('') + '</w:tbl>' + App.docx.para('');
  },
  /** blocks: [{t:'h1'|'h2'|'p'|'li'|'table'|'small', text, rows}] */
  make(blocks) {
    const body = blocks.map(b => b.t === 'h1' ? App.docx.para(b.text, { b: true, sz: 34, after: 200 }) : b.t === 'h2' ? App.docx.para(b.text, { b: true, sz: 26, after: 120, color: '1A2030' }) : b.t === 'li' ? App.docx.para(b.text, { list: true }) : b.t === 'table' ? App.docx.table(b.rows) : b.t === 'small' ? App.docx.para(b.text, { sz: 16, color: '6B7280', i: true }) : App.docx.para(b.text, b.o || {})).join('');
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    return App.docx.pack(doc);
  },
  pack(documentXml) {
    return App.zip.make([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/document.xml', data: documentXml }
    ]);
  }
};
/* stampa di blocchi documento in finestra (export PDF via stampa del browser) */
App.printBlocks = (title, blocks) => {
  const w = window.open('', '_blank'); if (!w) { App.toast('Consenti i popup per stampare', 'warn'); return; }
  const html = blocks.map(b => b.t === 'h1' ? `<h1>${esc(b.text)}</h1>` : b.t === 'h2' ? `<h2>${esc(b.text)}</h2>` : b.t === 'li' ? `<ul><li>${esc(b.text)}</li></ul>` : b.t === 'table' ? `<table>${b.rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</table>` : b.t === 'small' ? `<p class="s">${esc(b.text)}</p>` : `<p>${esc(Array.isArray(b.text) ? b.text.map(x => x.t || x).join('') : b.text)}</p>`).join('');
  w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Helvetica,Arial,sans-serif;max-width:760px;margin:30px auto;color:#14213d;font-size:13px}h1{font-size:22px}h2{font-size:15px;margin-top:22px}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #ccd;padding:4px 6px;text-align:left;font-size:12px}th{background:#eef2f7}ul{margin:2px 0}.s{color:#667;font-size:11px;font-style:italic}</style></head><body>${html}<script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
};
