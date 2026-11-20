// BeCity – programma di avvio locale.
// Serve l'applicazione web dalla cartella "app", converte DWG <-> DXF (acadrust, MPL-2.0),
// collega database PostGIS (postgres, MIT/Apache-2.0), apre la finestra dell'applicazione
// e termina quando la finestra viene chiusa (heartbeat).
#![cfg_attr(windows, windows_subsystem = "windows")]

use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::sync::OnceLock;
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

const PORT: u16 = 47800;
const VERSION: &str = "3.2.0";
static TOKEN: OnceLock<String> = OnceLock::new();
static PORT_IN_USE: OnceLock<u16> = OnceLock::new();
static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

/// gettone di sessione casuale: protegge l'API locale da richieste di altri siti aperti nel browser
fn make_token() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let mut out = String::new();
    for i in 0..4u64 { let mut h = RandomState::new().build_hasher(); h.write_u64(i ^ now()); h.write_u32(std::process::id()); out.push_str(&format!("{:016x}", h.finish())); }
    out
}

/// cartella dei dati: BECITY_DATA, oppure "dati" accanto al programma (modalità portatile), oppure Documenti\BeCity
fn data_dir() -> PathBuf {
    if let Ok(d) = std::env::var("BECITY_DATA") { if !d.is_empty() { return PathBuf::from(d); } }
    let exe = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf())).unwrap_or_else(|| PathBuf::from("."));
    if exe.join("dati").is_dir() { return exe.join("dati"); }
    let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).map(PathBuf::from).unwrap_or(exe.clone());
    let docs = home.join("Documents");
    if docs.is_dir() { docs.join("BeCity") } else { home.join("BeCity") }
}
const NAMESPACES: [&str; 5] = ["stato", "progetti", "file", "prezzari", "backup"];
fn safe_key(k: &str) -> bool { !k.is_empty() && k.len() <= 160 && !k.starts_with('.') && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.') }

fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }

fn app_root() -> PathBuf {
    let exe = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf())).unwrap_or_else(|| PathBuf::from("."));
    for c in [exe.join("app"), exe.clone(), PathBuf::from("app"), PathBuf::from(".")] {
        if c.join("index.html").exists() { return c; }
    }
    exe
}

fn log_path() -> PathBuf { DATA_DIR.get().map(|d| d.join("becity.log")).unwrap_or_else(|| std::env::temp_dir().join("becity.log")) }
fn log(msg: &str) {
    let p = log_path();
    if std::fs::metadata(&p).map(|m| m.len() > 2_000_000).unwrap_or(false) { let _ = std::fs::rename(&p, p.with_extension("log.old")); }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(p) { let _ = writeln!(f, "[{}] {}", now(), msg.chars().take(4000).collect::<String>()); }
}
/// messaggio nativo di Windows (gli errori di avvio sono visibili anche senza finestra dell'applicazione)
fn alert(msg: &str) {
    log(msg);
    #[cfg(windows)]
    {
        #[link(name = "user32")]
        extern "system" { fn MessageBoxW(h: *mut core::ffi::c_void, text: *const u16, caption: *const u16, kind: u32) -> i32; }
        let w = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
        unsafe { MessageBoxW(core::ptr::null_mut(), w(msg).as_ptr(), w("BeCity").as_ptr(), 0x10); }
    }
    #[cfg(not(windows))]
    eprintln!("{msg}");
}

fn mime(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8", "js" | "mjs" => "text/javascript; charset=utf-8", "css" => "text/css; charset=utf-8",
        "json" => "application/json", "svg" => "image/svg+xml", "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "ico" => "image/x-icon",
        "wasm" => "application/wasm", "woff2" => "font/woff2", "ttf" => "font/ttf", "txt" => "text/plain; charset=utf-8", "md" => "text/markdown; charset=utf-8",
        "geojson" => "application/geo+json", "webmanifest" => "application/manifest+json", _ => "application/octet-stream",
    }
}

fn hdr(k: &str, v: &str) -> Header { Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap() }
fn secure<R: Read>(r: Response<R>) -> Response<R> {
    r.with_header(hdr("X-Content-Type-Options", "nosniff")).with_header(hdr("X-Frame-Options", "DENY")).with_header(hdr("Referrer-Policy", "no-referrer"))
     .with_header(hdr("Cross-Origin-Resource-Policy", "same-origin"))
     .with_header(hdr("Content-Security-Policy", "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'none'"))
}
fn header<'a>(req: &'a Request, name: &'static str) -> Option<&'a str> { req.headers().iter().find(|h| h.field.equiv(name)).map(|h| h.value.as_str()) }
/// accetta solo richieste dirette a 127.0.0.1/localhost sulla porta del programma (contro il DNS rebinding)
fn host_ok(req: &Request) -> bool {
    let port = PORT_IN_USE.get().copied().unwrap_or(PORT);
    match header(req, "Host") { Some(h) => h == format!("127.0.0.1:{port}") || h == format!("localhost:{port}"), None => false }
}
fn origin_ok(req: &Request) -> bool {
    let port = PORT_IN_USE.get().copied().unwrap_or(PORT);
    match header(req, "Origin") { None => true, Some(o) => o == format!("http://127.0.0.1:{port}") || o == format!("http://localhost:{port}") }
}
fn token_ok(req: &Request) -> bool { match (header(req, "X-BeCity-Token"), TOKEN.get()) { (Some(t), Some(k)) => t == k, _ => false } }

fn json(req: Request, code: u16, v: serde_json::Value) {
    let body = v.to_string();
    let _ = req.respond(secure(Response::from_string(body).with_status_code(StatusCode(code)).with_header(hdr("Content-Type", "application/json; charset=utf-8")).with_header(hdr("Cache-Control", "no-store"))));
}

fn bytes(req: Request, data: Vec<u8>, ctype: &str) {
    let _ = req.respond(secure(Response::from_data(data).with_header(hdr("Content-Type", ctype)).with_header(hdr("Cache-Control", "no-store"))));
}

/* ---------------- DWG / DXF ---------------- */
fn guard<T>(f: impl FnOnce() -> Result<T, String> + std::panic::UnwindSafe) -> Result<T, String> {
    match std::panic::catch_unwind(f) { Ok(r) => r, Err(_) => Err("errore interno durante la conversione del disegno".into()) }
}
fn dwg_to_dxf(data: Vec<u8>) -> Result<Vec<u8>, String> {
    guard(move || {
        let mut rd = acadrust::DwgReader::from_stream(Cursor::new(data));
        let doc = rd.read().map_err(|e| format!("lettura DWG: {e}"))?;
        let mut out = Vec::new();
        acadrust::DxfWriter::new(&doc).write_to_writer(&mut out).map_err(|e| format!("scrittura DXF: {e}"))?;
        Ok(out)
    })
}
fn dxf_to_dwg(data: Vec<u8>, ver: &str) -> Result<Vec<u8>, String> {
    let ver = ver.to_string();
    guard(move || {
        let mut doc = acadrust::DxfReader::from_reader(Cursor::new(data)).map_err(|e| format!("lettura DXF: {e}"))?.read().map_err(|e| format!("lettura DXF: {e}"))?;
        doc.version = match ver.as_str() { "AC1015" | "2000" => acadrust::DxfVersion::AC1015, "AC1018" | "2004" => acadrust::DxfVersion::AC1018, "AC1024" | "2010" => acadrust::DxfVersion::AC1024, "AC1027" | "2013" => acadrust::DxfVersion::AC1027, _ => acadrust::DxfVersion::AC1032 };
        acadrust::DwgWriter::write_to_vec(&doc).map_err(|e| format!("scrittura DWG: {e}"))
    })
}
fn dxf_version_out(data: Vec<u8>, binary: bool) -> Result<Vec<u8>, String> {
    guard(move || {
        let mut doc = acadrust::DxfReader::from_reader(Cursor::new(data)).map_err(|e| format!("lettura DXF: {e}"))?.read().map_err(|e| format!("lettura DXF: {e}"))?;
        doc.version = acadrust::DxfVersion::AC1032;
        let mut out = Vec::new();
        let w = if binary { acadrust::DxfWriter::new_binary(&doc) } else { acadrust::DxfWriter::new(&doc) };
        w.write_to_writer(&mut out).map_err(|e| format!("scrittura DXF: {e}"))?;
        Ok(out)
    })
}

/* ---------------- PostGIS ---------------- */
fn ident(s: &str) -> Result<String, String> {
    let ok = !s.is_empty() && s.chars().next().map(|c| c.is_ascii_alphabetic() || c == '_').unwrap_or(false) && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if ok { Ok(format!("\"{s}\"")) } else { Err(format!("identificatore SQL non valido: {s}")) }
}
fn connect(v: &serde_json::Value) -> Result<postgres::Client, String> {
    let c = &v["conn"];
    let esc = |s: &str| s.replace('\\', "\\\\").replace('\'', "\\'");
    let cs = format!("host='{}' port={} dbname='{}' user='{}' password='{}' connect_timeout=8",
        esc(c["host"].as_str().unwrap_or("localhost")), c["port"].as_u64().or_else(|| c["port"].as_str().and_then(|s| s.parse().ok())).unwrap_or(5432),
        esc(c["database"].as_str().unwrap_or("")), esc(c["user"].as_str().unwrap_or("")), esc(c["password"].as_str().unwrap_or("")));
    postgres::Client::connect(&cs, postgres::NoTls).map_err(|e| format!("connessione: {e}"))
}
fn postgis(op: &str, v: serde_json::Value) -> Result<serde_json::Value, String> {
    let mut cl = connect(&v)?;
    match op {
        "layers" => {
            let rows = cl.query("SELECT f_table_schema::text, f_table_name::text, f_geometry_column::text, srid, type::text FROM geometry_columns ORDER BY 1,2", &[]).map_err(|e| e.to_string())?;
            let ver: String = cl.query_one("SELECT postgis_full_version()", &[]).map(|r| r.get(0)).unwrap_or_default();
            let layers: Vec<_> = rows.iter().map(|r| serde_json::json!({"schema": r.get::<_, String>(0), "table": r.get::<_, String>(1), "geom": r.get::<_, String>(2), "srid": r.get::<_, i32>(3), "type": r.get::<_, String>(4)})).collect();
            Ok(serde_json::json!({"layers": layers, "version": ver}))
        }
        "features" => {
            let tbl = format!("{}.{}", ident(v["schema"].as_str().unwrap_or("public"))?, ident(v["table"].as_str().unwrap_or(""))?);
            let gname = v["geom"].as_str().unwrap_or("geom"); let g = ident(gname)?;
            let lim = v["limit"].as_u64().unwrap_or(5000).min(200000);
            let bb: Vec<f64> = v["bbox"].as_array().map(|a| a.iter().filter_map(|x| x.as_f64()).collect()).unwrap_or_default();
            let filt = bb.len() == 4;
            let sql = format!("SELECT ST_AsGeoJSON(ST_Transform({g},4326),8)::text, (to_jsonb(t) - '{gname}')::text FROM {tbl} t {} LIMIT {lim}",
                if filt { format!("WHERE {g} && ST_Transform(ST_MakeEnvelope($1::float8,$2::float8,$3::float8,$4::float8,4326), ST_SRID({g}))") } else { String::new() });
            let rows = if filt { cl.query(sql.as_str(), &[&bb[0], &bb[1], &bb[2], &bb[3]]) } else { cl.query(sql.as_str(), &[]) }.map_err(|e| e.to_string())?;
            let feats: Vec<_> = rows.iter().filter_map(|r| { let gj: Option<String> = r.get(0); let pr: Option<String> = r.get(1);
                gj.map(|gj| serde_json::json!({"type": "Feature", "geometry": serde_json::from_str::<serde_json::Value>(&gj).unwrap_or(serde_json::Value::Null), "properties": pr.and_then(|p| serde_json::from_str::<serde_json::Value>(&p).ok()).unwrap_or(serde_json::json!({}))})) }).collect();
            Ok(serde_json::json!({"type": "FeatureCollection", "features": feats}))
        }
        "write" => {
            let tbl = format!("{}.{}", ident(v["schema"].as_str().unwrap_or("public"))?, ident(v["table"].as_str().unwrap_or(""))?);
            let srid = v["srid"].as_i64().or_else(|| v["srid"].as_str().and_then(|s| s.parse().ok())).unwrap_or(4326);
            let feats = v["features"].as_array().cloned().unwrap_or_default();
            let mut fields: Vec<String> = Vec::new();
            for f in &feats { if let Some(o) = f["properties"].as_object() { for k in o.keys() { if k != "geom" && ident(k).is_ok() && !fields.contains(k) { fields.push(k.clone()); } } } }
            let mut tx = cl.transaction().map_err(|e| e.to_string())?;
            if v["replace"].as_bool().unwrap_or(false) { tx.execute(format!("DROP TABLE IF EXISTS {tbl}").as_str(), &[]).map_err(|e| e.to_string())?; }
            let cols: String = fields.iter().map(|k| format!(", {} text", ident(k).unwrap())).collect();
            tx.execute(format!("CREATE TABLE IF NOT EXISTS {tbl} (gid serial PRIMARY KEY, geom geometry(Geometry, {srid}){cols})").as_str(), &[]).map_err(|e| e.to_string())?;
            let names: String = fields.iter().map(|k| format!(", {}", ident(k).unwrap())).collect();
            let ph: String = (0..fields.len()).map(|i| format!(", ${}", i + 2)).collect();
            let sql = format!("INSERT INTO {tbl} (geom{names}) VALUES (ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),{srid}){ph})");
            for f in &feats {
                let gj = f["geometry"].to_string();
                let vals: Vec<Option<String>> = fields.iter().map(|k| match &f["properties"][k] { serde_json::Value::Null => None, serde_json::Value::String(s) => Some(s.clone()), x => Some(x.to_string()) }).collect();
                let mut params: Vec<&(dyn postgres::types::ToSql + Sync)> = vec![&gj];
                for x in &vals { params.push(x); }
                tx.execute(sql.as_str(), &params).map_err(|e| e.to_string())?;
            }
            let idx = ident(&format!("{}_geom_idx", v["table"].as_str().unwrap_or("t")))?;
            tx.execute(format!("CREATE INDEX IF NOT EXISTS {idx} ON {tbl} USING GIST (geom)").as_str(), &[]).map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            Ok(serde_json::json!({"ok": true, "inserted": feats.len()}))
        }
        _ => Err("operazione sconosciuta".into()),
    }
}

/* ---------------- archivio su disco ---------------- */
fn store_path(ns: &str, key: &str) -> Option<PathBuf> {
    if !NAMESPACES.contains(&ns) || !safe_key(key) { return None; }
    Some(DATA_DIR.get()?.join(ns).join(key))
}
fn store_put(ns: &str, key: &str, body: &[u8]) -> Result<(), String> {
    let p = store_path(ns, key).ok_or("chiave non valida")?;
    std::fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
    let tmp = p.with_extension(format!("{}tmp", p.extension().and_then(|e| e.to_str()).map(|e| format!("{e}.")).unwrap_or_default()));
    { let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?; f.write_all(body).map_err(|e| e.to_string())?; f.sync_all().map_err(|e| e.to_string())?; }
    if (ns == "stato" || ns == "progetti") && p.exists() { let _ = std::fs::copy(&p, p.with_extension("bak")); }
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}
fn store_list(ns: &str) -> Result<serde_json::Value, String> {
    if !NAMESPACES.contains(&ns) { return Err("archivio non valido".into()); }
    let dir = DATA_DIR.get().ok_or("cartella dati")?.join(ns);
    let mut v = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) { for e in rd.flatten() { let n = e.file_name().to_string_lossy().to_string(); if n.ends_with(".tmp") || n.ends_with(".bak") || !safe_key(&n) { continue; } let m = e.metadata().ok(); v.push(serde_json::json!({"key": n, "size": m.as_ref().map(|m| m.len()).unwrap_or(0), "mtime": m.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0)})); } }
    Ok(serde_json::Value::Array(v))
}
fn dir_size(p: &Path) -> u64 { std::fs::read_dir(p).map(|rd| rd.flatten().map(|e| { let m = e.metadata(); match m { Ok(m) if m.is_dir() => dir_size(&e.path()), Ok(m) => m.len(), _ => 0 } }).sum()).unwrap_or(0) }

/* ---------------- richiesta ---------------- */
fn handle(mut req: Request, root: &Path, beat: &AtomicU64, seen: &AtomicBool) {
    let url = req.url().split('?').next().unwrap_or("/").to_string();
    let query = req.url().split('?').nth(1).unwrap_or("").to_string();
    let path = percent_decode(&url);
    if !host_ok(&req) { let _ = req.respond(Response::from_string("Richiesta non consentita").with_status_code(403)); return; }
    if path.starts_with("/api/") {
        if !origin_ok(&req) { return json(req, 403, serde_json::json!({"error": "origine non consentita"})); }
        if path == "/api/status" { return json(req, 200, serde_json::json!({"ok": true, "app": "BeCity", "version": VERSION})); }
        if !token_ok(&req) { return json(req, 401, serde_json::json!({"error": "sessione non valida: riavvia BeCity"})); }
        let method = req.method().clone();
        let mut body = Vec::new();
        if method == Method::Post || method == Method::Put { let _ = req.as_reader().take(1024 * 1024 * 1024).read_to_end(&mut body); }
        if let Some(rest) = path.strip_prefix("/api/store/") {
            let (ns, key) = rest.split_once('/').unwrap_or((rest, ""));
            return match (method, key.is_empty()) {
                (Method::Get, true) => match store_list(ns) { Ok(v) => json(req, 200, v), Err(e) => json(req, 400, serde_json::json!({"error": e})) },
                (Method::Get, false) => match store_path(ns, key).map(|p| if query.contains("bak=1") { p.with_extension("bak") } else { p }).map(std::fs::read) { Some(Ok(d)) => bytes(req, d, "application/octet-stream"), Some(Err(_)) => json(req, 404, serde_json::json!({"error": "non trovato"})), None => json(req, 400, serde_json::json!({"error": "chiave non valida"})) },
                (Method::Put, false) => match store_put(ns, key, &body) { Ok(_) => json(req, 200, serde_json::json!({"ok": true, "size": body.len()})), Err(e) => json(req, 500, serde_json::json!({"error": e})) },
                (Method::Delete, false) => { if let Some(p) = store_path(ns, key) { let _ = std::fs::remove_file(p); } json(req, 200, serde_json::json!({"ok": true})) }
                _ => json(req, 405, serde_json::json!({"error": "metodo non consentito"})),
            };
        }
        match path.as_str() {
            "/api/log" => { log(&format!("pagina: {}", String::from_utf8_lossy(&body))); return json(req, 200, serde_json::json!({"ok": true})); }
            "/api/store-info" => { let d = DATA_DIR.get().cloned().unwrap_or_default(); return json(req, 200, serde_json::json!({"ok": true, "dir": d.display().to_string(), "size": dir_size(&d.join("progetti")) + dir_size(&d.join("file")) + dir_size(&d.join("prezzari")) + dir_size(&d.join("stato")), "log": log_path().display().to_string(), "version": VERSION, "dwg": true, "postgis": true, "launcher": true})); }
            "/api/open-data-dir" => { if let Some(d) = DATA_DIR.get() { let _ = std::fs::create_dir_all(d); #[cfg(windows)] { let _ = std::process::Command::new("explorer").arg(d).spawn(); } #[cfg(target_os = "macos")] { let _ = std::process::Command::new("open").arg(d).spawn(); } #[cfg(all(unix, not(target_os = "macos")))] { let _ = std::process::Command::new("xdg-open").arg(d).spawn(); } } return json(req, 200, serde_json::json!({"ok": true})); }
            "/api/heartbeat" => { beat.store(now(), Ordering::SeqCst); seen.store(true, Ordering::SeqCst); return json(req, 200, serde_json::json!({"ok": true})); }
            "/api/quit" => { json(req, 200, serde_json::json!({"ok": true})); std::thread::spawn(|| { std::thread::sleep(Duration::from_millis(300)); std::process::exit(0); }); return; }
            "/api/dwg/to-dxf" => return match dwg_to_dxf(body) { Ok(d) => bytes(req, d, "application/dxf"), Err(e) => json(req, 422, serde_json::json!({"error": e})) },
            "/api/dxf/to-dwg" => { let ver = query.split('&').find_map(|kv| kv.strip_prefix("version=")).unwrap_or("AC1032").to_string(); return match dxf_to_dwg(body, &ver) { Ok(d) => bytes(req, d, "application/acad"), Err(e) => json(req, 422, serde_json::json!({"error": e})) }; }
            "/api/dxf/upgrade" => { let bin = query.contains("binary=1"); return match dxf_version_out(body, bin) { Ok(d) => bytes(req, d, "application/dxf"), Err(e) => json(req, 422, serde_json::json!({"error": e})) }; }
            p if p.starts_with("/api/postgis/") => {
                let op = p.trim_start_matches("/api/postgis/").to_string();
                let v: serde_json::Value = serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null);
                return match postgis(&op, v) { Ok(r) => json(req, 200, r), Err(e) => json(req, 400, serde_json::json!({"error": e})) };
            }
            _ => return json(req, 404, serde_json::json!({"error": "non trovato"})),
        }
    }
    let mut rel = path.trim_start_matches('/').to_string();
    if rel.is_empty() || rel.ends_with('/') { rel.push_str("index.html"); }
    if rel.split('/').any(|s| s == ".." || s.contains('\\') || s.contains(':')) { let _ = req.respond(Response::empty(403)); return; }
    let f = root.join(&rel);
    match std::fs::read(&f) {
        Ok(mut d) => {
            if rel == "index.html" { let t = TOKEN.get().cloned().unwrap_or_default(); d = String::from_utf8_lossy(&d).replace("<meta name=\"becity-token\" content=\"\">", &format!("<meta name=\"becity-token\" content=\"{t}\">")).into_bytes(); }
            let _ = req.respond(secure(Response::from_data(d).with_header(hdr("Content-Type", mime(&f))).with_header(hdr("Cache-Control", "no-store"))));
        }
        Err(_) => { let _ = req.respond(Response::from_string("Non trovato").with_status_code(404)); }
    }
}
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes(); let mut out = Vec::with_capacity(b.len()); let mut i = 0;
    while i < b.len() { if b[i] == b'%' && i + 2 < b.len() { if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) { out.push(v); i += 3; continue; } } out.push(if b[i] == b'+' { b' ' } else { b[i] }); i += 1; }
    String::from_utf8_lossy(&out).into_owned()
}

/* ---------------- apertura finestra ---------------- */
static COMPAT: OnceLock<bool> = OnceLock::new();
fn open_window(url: &str) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const NO_WINDOW: u32 = 0x0800_0000;
        let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
        let pf86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".into());
        let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let cands = [format!("{pf86}\\Microsoft\\Edge\\Application\\msedge.exe"), format!("{pf}\\Microsoft\\Edge\\Application\\msedge.exe"), format!("{pf}\\Google\\Chrome\\Application\\chrome.exe"), format!("{pf86}\\Google\\Chrome\\Application\\chrome.exe"), format!("{local}\\Google\\Chrome\\Application\\chrome.exe")];
        for c in cands.iter() {
            if !Path::new(c).exists() { continue; }
            let mut a: Vec<String> = vec![format!("--app={url}"), "--start-maximized".into(), "--no-first-run".into(), "--no-default-browser-check".into()];
            if COMPAT.get().copied().unwrap_or(false) { a.push("--disable-gpu".into()); }
            match std::process::Command::new(c).args(&a).spawn() { Ok(_) => { log(&format!("finestra aperta con {c}")); return; } Err(e) => log(&format!("avvio di {c} non riuscito: {e}")) }
        }
        log("Edge/Chrome non trovati: apertura con il browser predefinito");
        if std::process::Command::new("cmd").args(["/C", "start", "", url]).creation_flags(NO_WINDOW).spawn().is_err() { alert(&format!("Impossibile aprire il browser. Apri manualmente questo indirizzo:\n{url}")); }
    }
    #[cfg(target_os = "macos")]
    { let _ = std::process::Command::new("open").arg(url).spawn(); }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        for b in ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"] { if std::process::Command::new(b).args([&format!("--app={url}")]).spawn().is_ok() { return; } }
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

fn already_running(port: u16) -> bool {
    use std::net::TcpStream;
    if let Ok(mut s) = TcpStream::connect_timeout(&format!("127.0.0.1:{port}").parse().unwrap(), Duration::from_millis(500)) {
        let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
        let _ = s.write_all(format!("GET /api/status HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\n\r\n").as_bytes());
        let mut buf = String::new(); let _ = s.read_to_string(&mut buf);
        return buf.contains("BeCity") && buf.contains(&format!("\"version\":\"{VERSION}\""));
    }
    false
}

fn main() {
    let root = app_root();
    let args: Vec<String> = std::env::args().collect();
    let no_window = args.iter().any(|a| a == "--server");
    let _ = COMPAT.set(args.iter().any(|a| a == "--compat"));
    if !root.join("index.html").exists() || !root.join("js").join("core.js").exists() {
        alert(&format!("La cartella \"app\" di BeCity non è stata trovata accanto al programma ({}).\n\nEstrai tutto il contenuto dello ZIP in una cartella e avvia BeCity.exe da lì (non direttamente dall'interno dello ZIP).", root.display()));
        return;
    }
    let mut port = PORT;
    let server = loop {
        match Server::http(("127.0.0.1", port)) {
            Ok(s) => break s,
            Err(_) => {
                if already_running(port) { let _ = DATA_DIR.set(data_dir()); log(&format!("BeCity {VERSION} già in esecuzione sulla porta {port}: apro una nuova finestra")); open_window(&format!("http://127.0.0.1:{port}/?v={VERSION}")); return; }
                port += 1; if port > PORT + 20 { log("nessuna porta disponibile"); return; }
            }
        }
    };
    let _ = PORT_IN_USE.set(port);
    let _ = TOKEN.set(make_token());
    let dd = data_dir();
    if let Err(e) = std::fs::create_dir_all(&dd) { alert(&format!("Impossibile creare la cartella dei dati {}: {e}.\n\nSe è attiva la protezione \"Accesso controllato alle cartelle\" di Windows, consenti BeCity.exe oppure crea una cartella \"dati\" accanto a BeCity.exe.", dd.display())); }
    for ns in NAMESPACES { let _ = std::fs::create_dir_all(dd.join(ns)); }
    let _ = DATA_DIR.set(dd);
    let url = format!("http://127.0.0.1:{port}/?v={VERSION}");
    log(&format!("BeCity {VERSION} avviato su {url} – programma {} – dati {}", root.display(), DATA_DIR.get().map(|d| d.display().to_string()).unwrap_or_default()));
    #[cfg(not(windows))]
    println!("BeCity {VERSION} in esecuzione su {url}  (Ctrl+C per terminare)");
    if !no_window { open_window(&url); }
    let beat = Arc::new(AtomicU64::new(now()));
    let seen = Arc::new(AtomicBool::new(false));
    if !no_window {
        let (b, s) = (beat.clone(), seen.clone());
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_secs(10));
            let idle = now().saturating_sub(b.load(Ordering::SeqCst));
            // chiude il server quando la finestra non risponde più (o se non è mai stata aperta entro 10 minuti)
            if (s.load(Ordering::SeqCst) && idle > 60) || (!s.load(Ordering::SeqCst) && idle > 600) { log("finestra chiusa: arresto"); std::process::exit(0); }
        });
    }
    let server = Arc::new(server);
    let root = Arc::new(root);
    for req in server.incoming_requests() {
        let (root, beat, seen) = (root.clone(), beat.clone(), seen.clone());
        std::thread::spawn(move || handle(req, &root, &beat, &seen));
    }
}
