/*
  vanguard_registry.js
  Compatibility shim for older pages that load Vanguard registry from the repo root.
  The active Vanguard registry lives at assets/js/vanguard_registry.js.

  This shim also includes a small page-rescue guard so older pages do not sit at
  INITIALIZING forever if Vanguard/Firebase loads late or fails on GitHub Pages.
*/
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  function alreadyLoaded(srcPart) {
    var scripts = document.querySelectorAll("script[src]");
    for (var i = 0; i < scripts.length; i += 1) {
      var src = scripts[i].getAttribute("src") || "";
      if (src.indexOf(srcPart) !== -1) return true;
    }
    return false;
  }

  function text(el, value) {
    if (el) el.textContent = value;
  }

  function className(el, value) {
    if (el) el.className = value;
  }

  function qsEq() {
    try {
      return (new URLSearchParams(window.location.search).get("eq") || "TR-001").trim() || "TR-001";
    } catch (e) {
      return "TR-001";
    }
  }

  function localStepDone(eq, step) {
    try {
      if (step === "ccs") {
        return localStorage.getItem("nexus_" + eq + "_ccs_signed_off") === "1" ||
          localStorage.getItem("nexus_" + eq + "_step_ccs") === "1";
      }
      if (step === "meg") {
        return localStorage.getItem("nexus_" + eq + "_step_meg") === "1" ||
          (localStorage.getItem("nexus_" + eq + "_step_megohmmeter_line") === "1" &&
           localStorage.getItem("nexus_" + eq + "_step_megohmmeter_load") === "1");
      }
      if (step === "fpv") {
        return localStorage.getItem("nexus_" + eq + "_step_fpv_photo") === "1" ||
          localStorage.getItem("nexus_" + eq + "_step_fpv") === "1";
      }
      return localStorage.getItem("nexus_" + eq + "_step_" + step) === "1";
    } catch (e) {
      return false;
    }
  }

  function rescueIndexPage() {
    var badge = document.getElementById("vxIndexBadge");
    if (!badge || String(badge.textContent || "").trim().toUpperCase() !== "INITIALIZING") return;

    var eq = qsEq();
    className(badge, "vx-index-badge warn");
    text(badge, "LOCAL READY");
    text(document.getElementById("vxIndexSub"), "Recovered to local mode. Vanguard/Firebase can attach when available.");
    text(document.getElementById("vxIndexEq"), eq);
    text(document.getElementById("vxIndexReadiness"), "Local Mode");
    text(document.getElementById("vxIndexLastSync"), new Date().toLocaleTimeString());
  }

  function rescueEquipmentPage() {
    var badge = document.getElementById("vxOrchBadge");
    if (!badge || String(badge.textContent || "").trim().toUpperCase() !== "INITIALIZING") return;

    var eq = qsEq();
    var steps = ["ccs", "rif", "phenolic", "meg", "torque", "l2", "prefod", "fpv"];
    var complete = 0;
    for (var i = 0; i < steps.length; i += 1) {
      if (localStepDone(eq, steps[i])) complete += 1;
    }
    var total = steps.length;
    var pct = total ? Math.round((complete / total) * 100) : 0;
    var status = complete === total ? "READY" : "REVIEW";

    className(badge, complete === total ? "vx-orch-badge pass" : "vx-orch-badge review");
    text(badge, complete === total ? "READY FOR ENERGIZATION" : "LOCAL REVIEW");
    text(document.getElementById("vxOrchSub"), "Recovered to local workflow mode. Firebase/Vanguard live sync can attach when available.");
    text(document.getElementById("vxPackageStatus"), status);
    text(document.getElementById("vxCompleteCount"), complete + "/" + total);
    text(document.getElementById("vxIssueCount"), "0");
    text(document.getElementById("vxLastUpdate"), new Date().toLocaleTimeString());

    var progressText = document.getElementById("progressText");
    var progressCount = document.getElementById("progressCount");
    var progressFill = document.getElementById("progressFill");
    var progressHint = document.getElementById("progressHint");
    text(progressText, "Progress: " + pct + "%");
    text(progressCount, complete + "/" + total);
    if (progressFill) progressFill.style.width = pct + "%";
    if (progressHint) {
      progressHint.innerHTML = "<div>Completed: " + complete + "</div><div>Remaining Work Items: " + Math.max(0, total - complete) + "</div>";
    }
  }

  function rescueStuckPages() {
    rescueIndexPage();
    rescueEquipmentPage();
  }

  if (!alreadyLoaded("assets/js/vanguard_registry.js")) {
    var script = document.createElement("script");
    script.src = "assets/js/vanguard_registry.js";
    script.async = false;
    script.onerror = function () {
      console.warn("Vanguard registry compatibility shim could not load assets/js/vanguard_registry.js");
      rescueStuckPages();
    };
    script.onload = function () {
      setTimeout(rescueStuckPages, 1200);
    };
    document.head.appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(rescueStuckPages, 1800);
      setTimeout(rescueStuckPages, 4500);
    });
  } else {
    setTimeout(rescueStuckPages, 1800);
    setTimeout(rescueStuckPages, 4500);
  }
})();
