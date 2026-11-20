fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") && std::path::Path::new("becity.ico").exists() {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("becity.ico");
        res.set("ProductName", "BeCity");
        res.set("FileDescription", "BeCity – piattaforma per architettura e urbanistica");
        res.set("CompanyName", "BeCity");
        res.set("LegalCopyright", "© 2026 BeCity");
        res.set("OriginalFilename", "BeCity.exe");
        res.set("InternalName", "BeCity");
        res.set_manifest(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity version="3.1.0.0" processorArchitecture="amd64" name="BeCity.BeCity" type="win32"/>
  <description>BeCity - piattaforma per architettura e urbanistica</description>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security></trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1"><application><supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/><supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}"/></application></compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings><dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware><dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness></windowsSettings></application>
</assembly>"#);
        if let Ok(tool) = std::env::var("WINDRES") { res.set_windres_path(&tool); }
        res.compile().expect("risorse Windows");
    }
}
