/* =========================================================
   NEXUS / HyperCore Shared Workflow State Engine
   File: assets/js/nexus-workflow-state.js

   PURPOSE
   ---------------------------------------------------------
   Single source of truth for:
   - workflow step status
   - progress calculations
   - package readiness
   - future Firebase adapter
   - future Vanguard AI reads

   LOCALSTORAGE-FIRST STABILIZED ARCHITECTURE
   ========================================================= */

(function(){

  if(window.NEXUS_WORKFLOW){
    console.warn("NEXUS_WORKFLOW already initialized");
    return;
  }

  /* =========================================================
     STEP REGISTRY
     ========================================================= */

  const STEP_ORDER = [
    "rif",
    "phenolic",
    "torque",
    "l2",
    "meg",
    "prefod",
    "fpv",
    "ccs"
  ];

  const STEP_LABELS = {
    rif: "Receipt Inspection",
    phenolic: "Phenolic Display",
    torque: "Torque Application",
    l2: "L2 Verification",
    meg: "Megohmmeter Testing",
    prefod: "Pre-FOD",
    fpv: "Finished Product Verification",
    ccs: "Construction Check Sheet"
  };

  /* =========================================================
     HELPERS
     ========================================================= */

  function safeEq(eq){

    if(eq && typeof eq === "string"){
      return eq.trim();
    }

    try{

      return (
        localStorage.getItem("nexus_active_equipment") ||
        localStorage.getItem("nexus_active_eq") ||
        ""
      ).trim();

    }catch(e){
      return "";
    }

  }

  function stepKey(eq, step){
    return `nexus_${eq}_step_${step}`;
  }

  function bool(v){
    return (
      v === true ||
      v === "true" ||
      v === "1" ||
      v === 1
    );
  }

  /* =========================================================
     STEP STATUS
     ========================================================= */

  function getStepStatus(eq, step){

    eq = safeEq(eq);

    if(!eq || !step){
      return false;
    }

    /* =========================
       CCS SPECIAL LOGIC
       ========================= */

    if(step === "ccs"){

      return (
        bool(localStorage.getItem(`nexus_${eq}_ccs_signed_off`)) ||
        bool(localStorage.getItem(stepKey(eq, "ccs")))
      );

    }

    /* =========================
       MEG SPECIAL LOGIC
       ========================= */

    if(step === "meg"){

      const mainMeg =
        bool(localStorage.getItem(stepKey(eq, "meg")));

      const line =
        bool(localStorage.getItem(
          `nexus_${eq}_step_megohmmeter_line`
        ));

      const load =
        bool(localStorage.getItem(
          `nexus_${eq}_step_megohmmeter_load`
        ));

      return mainMeg || (line && load);

    }

    /* =========================
       FPV SPECIAL LOGIC
       ========================= */

    if(step === "fpv"){

      return (
        bool(localStorage.getItem(stepKey(eq, "fpv"))) ||
        bool(localStorage.getItem(
          `nexus_${eq}_step_fpv_photo`
        ))
      );

    }

    /* =========================
       STANDARD LOGIC
       ========================= */

    return bool(localStorage.getItem(
      stepKey(eq, step)
    ));

  }

  /* =========================================================
     SET STEP COMPLETE
     ========================================================= */

  function setStepComplete(eq, step, complete){

    eq = safeEq(eq);

    if(!eq || !step){
      return false;
    }

    try{

      if(complete){

        localStorage.setItem(
          stepKey(eq, step),
          "1"
        );

      }else{

        localStorage.removeItem(
          stepKey(eq, step)
        );

      }

      notifyWorkflowChange(eq, step);

      return true;

    }catch(e){

      console.error(
        "Failed to set workflow step:",
        e
      );

      return false;
    }

  }

  /* =========================================================
     ALL STEP DATA
     ========================================================= */

  function getAllSteps(eq){

    eq = safeEq(eq);

    const out = [];

    STEP_ORDER.forEach(step => {

      out.push({
        id: step,
        label: STEP_LABELS[step] || step,
        complete: getStepStatus(eq, step)
      });

    });

    return out;

  }

  /* =========================================================
     PROGRESS
     ========================================================= */

  function getProgress(eq){

    eq = safeEq(eq);

    const steps = getAllSteps(eq);

    const total = steps.length;

    let complete = 0;

    steps.forEach(step => {
      if(step.complete){
        complete++;
      }
    });

    const remaining =
      total - complete;

    const percent =
      total
        ? Math.round((complete / total) * 100)
        : 0;

    return {
      equipment: eq,
      total,
      complete,
      remaining,
      percent
    };

  }

  /* =========================================================
     PACKAGE READINESS
     ========================================================= */

  function getPackageReadiness(eq){

    eq = safeEq(eq);

    const progress =
      getProgress(eq);

    let status = "REVIEW";

    if(progress.complete >= progress.total){
      status = "READY";
    }

    return {
      equipment: eq,
      status,
      progress
    };

  }

  /* =========================================================
     EVENT NOTIFICATION
     ========================================================= */

  function notifyWorkflowChange(eq, step){

    try{

      window.dispatchEvent(
        new CustomEvent(
          "nexus-workflow-change",
          {
            detail:{
              equipment:eq,
              step
            }
          }
        )
      );

    }catch(e){}
  }

  /* =========================================================
     PUBLIC API
     ========================================================= */

  window.NEXUS_WORKFLOW = {

    VERSION: "1.0.0",

    STEP_ORDER,
    STEP_LABELS,

    getEquipmentId: safeEq,

    getStepStatus,

    setStepComplete,

    getAllSteps,

    getProgress,

    getPackageReadiness

  };

  console.log(
    "NEXUS_WORKFLOW initialized"
  );

})();
