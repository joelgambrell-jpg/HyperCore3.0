(function () {
  "use strict";

  const ROLE_KEY = "nexus_role";
  const STATUS_KEY = "nexus_session_status";
  const VALID_ROLES = ["viewer", "tech", "qcx", "foreman", "superintendent", "admin"];

  function safeText(value) { return String(value == null ? "" : value); }
  function readText(key, fallback = "") { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch (e) { return fallback; } }
  function writeText(key, value) { try { localStorage.setItem(key, safeText(value)); return true; } catch (e) { return false; } }
  function removeKey(key) { try { localStorage.removeItem(key); return true; } catch (e) { return false; } }
  function readJSON(key, fallback = null) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; } }
  function writeJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
  function getQs() { try { return new URLSearchParams(window.location.search || ""); } catch (e) { return new URLSearchParams(""); } }

  function getEq() {
    const qs = getQs();
    const fromUrl = safeText(qs.get("eq")).trim();
    if (fromUrl) return fromUrl;
    const candidates = ["nexus_active_eq", "nexus_current_eq", "nexus_selected_eq", "nexus_eq", "eq"];
    for (const key of candidates) { const v = safeText(readText(key, "")).trim(); if (v) return v; }
    return "";
  }

  function persistEq(eq) {
    const value = safeText(eq).trim();
    if (!value) return;
    ["nexus_active_eq", "nexus_current_eq", "nexus_selected_eq", "nexus_eq", "eq"].forEach(k => writeText(k, value));
  }

  function normalizeRole(role) { const value = safeText(role).trim().toLowerCase(); return VALID_ROLES.includes(value) ? value : "viewer"; }
  function getRole() { return normalizeRole(readText(ROLE_KEY, "viewer")); }
  function setRole(role) { const value = normalizeRole(role); writeText(ROLE_KEY, value); syncRoleSelects(value); updateSessionBanner(); return value; }
  function getStatus() { return safeText(readText(STATUS_KEY, "Ready")) || "Ready"; }
  function setStatus(text) { const value = safeText(text) || "Ready"; writeText(STATUS_KEY, value); updateSessionBanner(); return value; }
  function stepKey(stepId, eq) { const equipment = safeText(eq || getEq()) || "NO_EQ"; return `nexus_${equipment}_step_${safeText(stepId)}`; }
  function isStepComplete(stepId, eq) { return readText(stepKey(stepId, eq)) === "1"; }
  function setStepComplete(stepId, done, eq) { const key = stepKey(stepId, eq); if (done) writeText(key, "1"); else removeKey(key); return !!done; }
  function ccsSignedKey(eq) { const equipment = safeText(eq || getEq()) || "NO_EQ"; return `nexus_${equipment}_ccs_signed_off`; }
  function isCcsSigned(eq) { return readText(ccsSignedKey(eq)) === "1"; }
  function setCcsSigned(done, eq) { const key = ccsSignedKey(eq); if (done) writeText(key, "1"); else removeKey(key); return !!done; }

  function getEqUrl(path, eq) {
    const equipment = safeText(eq || getEq());
    const url = new URL(path, location.href);
    if (equipment) url.searchParams.set("eq", equipment);
    return url.pathname.split("/").pop() + url.search;
  }

  function back() {
    try { if (document.referrer && document.referrer.includes(location.host)) { history.back(); return false; } } catch(e){}
    const eq = getEq(); location.href = eq ? `equipment.html?eq=${encodeURIComponent(eq)}` : "equipment.html"; return false;
  }

  function isSopUrl(urlOrText) {
    const value = safeText(urlOrText).toLowerCase();
    return value.includes("sop") || value.includes("standard-operating-procedure") || value.includes("procedure");
  }

  function toSameTabUrl(urlLike) {
    const value = safeText(urlLike).trim();
    if (!value || value === "#") return "";
    try {
      const url = new URL(value, location.href);
      if (url.origin === location.origin) return url.pathname.split("/").pop() + url.search + url.hash;
      return url.href;
    } catch(e) {
      return value;
    }
  }

  function navigateSingleTab(urlLike) {
    const url = toSameTabUrl(urlLike);
    if (!url) return false;
    location.href = url;
    return false;
  }

  function installSingleTabGuard() {
    if (window.__NEXUS_SINGLE_TAB_GUARD__) return;
    window.__NEXUS_SINGLE_TAB_GUARD__ = true;

    document.addEventListener("click", function(ev){
      const link = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!link) return;
      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const wantsNewTab = (link.getAttribute("target") || "").toLowerCase() === "_blank" || link.dataset.newTab === "true" || link.dataset.openNewTab === "true";
      if (!wantsNewTab) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (isSopUrl(href + " " + link.textContent)) {
        const yes = window.confirm("Open this SOP in a new tab?\n\nChoose OK for new tab or Cancel to stay in this tab.");
        if (yes) window.open(href, "_blank", "noopener,noreferrer");
        else navigateSingleTab(href);
      } else {
        navigateSingleTab(href);
      }
    }, true);

    const originalOpen = window.open;
    window.open = function(url, target, features) {
      const requested = safeText(target || "");
      const isNew = !requested || requested === "_blank";
      if (isNew && isSopUrl(url)) {
        const yes = window.confirm("Open this SOP in a new tab?\n\nChoose OK for new tab or Cancel to stay in this tab.");
        if (yes) return originalOpen.call(window, url, "_blank", features || "noopener,noreferrer");
        navigateSingleTab(url);
        return null;
      }
      if (isNew) {
        navigateSingleTab(url);
        return null;
      }
      return originalOpen.call(window, url, target, features);
    };
  }

  function forceEqOnLinks(root) {
    const eq = getEq(); if (!eq) return;
    (root || document).querySelectorAll("a[href]").forEach(a => {
      let href = a.getAttribute("href"); if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      try { const url = new URL(href, location.href); if (!url.searchParams.get("eq")) { url.searchParams.set("eq", eq); a.href = url.pathname.split("/").pop() + url.search; } } catch(e){}
    });
  }

  function syncRoleSelects(role){ document.querySelectorAll("#nxRoleSelect").forEach(sel => { sel.value = role; }); }
  function updateSessionBanner(){
    const eq = getEq(); const role = getRole(); const status = getStatus();
    document.querySelectorAll("[data-nx-eq]").forEach(el => el.textContent = eq || "(none)");
    document.querySelectorAll("[data-nx-role]").forEach(el => el.textContent = role);
    document.querySelectorAll("[data-nx-status]").forEach(el => el.textContent = status);
    syncRoleSelects(role);
  }

  function loadScriptOnce(src){
    return new Promise(resolve => {
      if (!src) { resolve(false); return; }
      const existing = Array.from(document.scripts || []).find(s => (s.getAttribute("src") || "") === src);
      if (existing) { resolve(true); return; }
      const script = document.createElement("script"); script.src = src; script.async = false;
      script.onload = () => resolve(true);
      script.onerror = () => { console.warn("NEXUS module failed to load:", src); resolve(false); };
      document.head.appendChild(script);
    });
  }

  async function loadAuthorityModules(){
    try {
      const path = location.pathname || "";
      const qs = getQs();
      const isEquipment = /equipment\.html$/i.test(path) || !!document.getElementById("progressFill");
      const isRegistry = /index_equipment_registry\.html$/i.test(path) || !!document.getElementById("registrySelect");
      const isDiagnostic = /vanguard_storage_audit\.html$/i.test(path) || !!document.getElementById("vanguardStorageAuditApp");
      const dashboardRequested = qs.get("authorityDashboard") === "1" || window.NEXUS_AUTHORITY_DASHBOARD_AUTO === true;
      if (!isEquipment && !isRegistry && !isDiagnostic) return;

      await loadScriptOnce("assets/js/vanguard_validation_authority.js");
      await loadScriptOnce("assets/js/vanguard_authority_adapters.js");
      await loadScriptOnce("assets/js/vanguard_storage_audit.js");

      if (isEquipment) await loadScriptOnce("assets/js/vanguard_equipment_authority_indicator.js");
      if ((isRegistry && dashboardRequested) || isDiagnostic) await loadScriptOnce("assets/js/vanguard_project_authority_dashboard.js");

      try { window.dispatchEvent(new CustomEvent("vanguard:authority-modules-loaded", { detail:{ isEquipment, isRegistry, isDiagnostic, dashboardRequested } })); } catch(e) {}
    } catch (e) { console.warn("NEXUS authority module loader failed:", e); }
  }

  function controlCenterStabilityGuard(){
    try {
      const isControlCenter = /vanguard_control_center/i.test(location.pathname || "") || !!document.getElementById("vxDropZone"); if (!isControlCenter) return;
      document.documentElement.style.overflowY = "auto"; document.documentElement.style.height = "auto"; document.body.style.overflowY = "auto"; document.body.style.height = "auto"; document.body.style.minHeight = "100vh";
      const duplicateIntake = document.getElementById("vanguard-finishline-intake"); if (duplicateIntake && duplicateIntake.parentNode) duplicateIntake.parentNode.removeChild(duplicateIntake);
      const backendInput = document.getElementById("vgBackendUrl");
      if (backendInput) { const backendPanel = backendInput.closest("div[style]"); const topActions = document.querySelector(".top-actions"); if (backendPanel) { backendPanel.style.cssText = "padding:12px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);font-family:Arial,Helvetica,sans-serif;color:#f6fbff;"; if (topActions && backendPanel.parentNode !== topActions) topActions.appendChild(backendPanel); } }
      const zeroIds = ["heroDocCount", "heroMappedCount", "heroConflictCount", "statMapped", "statReview", "statReady", "activeQueueCount", "approvedToday"];
      zeroIds.forEach(id => { const el = document.getElementById(id); if (el && /^(12|47|6|31|4|9)$/.test(String(el.textContent || "").trim())) el.textContent = "0"; });
      const health = document.getElementById("statHealth"); if (health && String(health.textContent || "").trim() === "92%") health.textContent = "0%";
      const status = document.getElementById("vxLiveStatus"); if (status && /Reading local Vanguard project state/i.test(status.textContent || "")) status.textContent = "Control Center loaded. Reading local Vanguard state. Firebase will attach when available.";
    } catch (e) { console.warn("Control Center stability guard failed:", e); }
  }

  function registryStartupGuard(){
    try {
      const isRegistry = /index_equipment_registry/i.test(location.pathname || ""); if (!isRegistry || window.__NEXUS_REGISTRY_CORE_GUARD__) return;
      window.__NEXUS_REGISTRY_CORE_GUARD__ = true; window.__NEXUS_REGISTRY_SKIP_HEAVY_PROGRESS_SCAN__ = true;
      window.addEventListener("pagehide", function(){ try { window.__NEXUS_REGISTRY_LEAVING__ = true; } catch(e) {} }, { capture:true });
      window.addEventListener("pageshow", function(){ try { window.__NEXUS_REGISTRY_LEAVING__ = false; } catch(e) {} }, { capture:true });
    } catch (e) { console.warn("Registry startup guard failed:", e); }
  }

  function init(){
    registryStartupGuard(); persistEq(getEq()); updateSessionBanner(); forceEqOnLinks(document); installSingleTabGuard(); controlCenterStabilityGuard(); loadAuthorityModules();
    window.addEventListener("focus", updateSessionBanner); window.addEventListener("storage", updateSessionBanner); window.addEventListener("load", controlCenterStabilityGuard); window.addEventListener("vanguard:loader:complete", controlCenterStabilityGuard);
    setTimeout(controlCenterStabilityGuard, 250); setTimeout(controlCenterStabilityGuard, 1200);
  }

  const NEXUS = { getEq, persistEq, getRole, setRole, getStatus, setStatus, stepKey, isStepComplete, setStepComplete, isCcsSigned, setCcsSigned, getEqUrl, forceEqOnLinks, back, updateSessionBanner, readJSON, writeJSON, controlCenterStabilityGuard, registryStartupGuard, loadAuthorityModules, installSingleTabGuard, navigateSingleTab };
  window.NEXUS = window.NEXUS || {}; Object.assign(window.NEXUS, NEXUS); window.NEXUS_back = back;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();