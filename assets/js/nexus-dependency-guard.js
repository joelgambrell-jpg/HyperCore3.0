/* NEXUS dependency guard - neutral offline capability status. */
(function(){
  "use strict";
  const checks = [
    { name:"Excel XLSX parser", ok:()=>!!window.XLSX && !window.NEXUS_VENDOR_FALLBACKS?.xlsx, safe:"CSV import/export remains available offline." },
    { name:"QR generator", ok:()=>!!window.QRCode, safe:"Local QR generation is bundled." },
    { name:"Camera QR scanner", ok:()=>!!window.Html5Qrcode && !window.NEXUS_QR_SCANNER_FALLBACK_ACTIVE, safe:"Manual equipment entry remains available offline." },
    { name:"PDF generator", ok:()=>!!(window.jspdf && window.jspdf.jsPDF) && !window.jspdf.NEXUS_FALLBACK, safe:"Text/print export remains available offline." }
  ];
  function run(){
    const fallback = checks.filter(c=>{ try{return !c.ok();}catch(e){return true;} });
    window.NEXUS_DEPENDENCY_STATUS = { ok: fallback.length === 0, fallback:fallback, checkedAt:new Date().toISOString() };
    if(!fallback.length) return;
    console.info("NEXUS offline-safe fallback active:", fallback.map(c=>c.name + " — " + c.safe).join(" | "));
    if(document.getElementById("nexus-dependency-guard")) return;
    const box = document.createElement("div");
    box.id = "nexus-dependency-guard";
    box.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:99998;background:rgba(12,18,32,.92);color:#dbeafe;border:1px solid rgba(96,165,250,.45);border-radius:12px;padding:8px 10px;font:12px system-ui;box-shadow:0 10px 28px rgba(0,0,0,.3);max-width:360px";
    box.textContent = "Offline-safe mode: " + fallback.map(c=>c.name).join(", ") + " uses protected fallback behavior.";
    document.body.appendChild(box);
    setTimeout(()=>{ try{ box.remove(); }catch(e){} }, 6000);
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
})();
