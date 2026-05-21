/*
  assets/js/vanguard_requirement_review_gate.js
  NEXUS Vanguard Requirement Review + Approval Gate

  Purpose:
  - Keeps AI/document extracted requirements out of active field workflow until reviewed.
  - Engineers can approve, correct, or reject requirements.
  - Approved requirements become the only published requirement rules for field workflow and export traceability.
  - Additive/local-first. Does not change Firebase config.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_REQUIREMENT_REVIEW && window.NEXUS_VANGUARD_REQUIREMENT_REVIEW.__installed) return;

  var VERSION = '0.1.0-approval-gate';

  function clean(value){ return String(value == null ? '' : value).trim(); }
  function upper(value){ return clean(value).toUpperCase(); }
  function nowISO(){ return new Date().toISOString(); }
  function core(){ return window.NEXUS_VANGUARD || window.Vanguard || (window.NEXUS && window.NEXUS.Vanguard) || null; }

  function role(){
    var vg = core();
    if (vg && typeof vg.getRole === 'function') return clean(vg.getRole() || 'viewer');
    try { return clean(localStorage.getItem('nexus_role') || localStorage.getItem('nexus_user_role') || 'viewer'); } catch(e){ return 'viewer'; }
  }

  function canEngineerReview(){
    var r = role().toLowerCase();
    return r === 'engineer' || r === 'admin' || r === 'superintendent' || r === 'manager';
  }

  function readState(){
    var vg = core();
    if (vg && typeof vg.getState === 'function') return vg.getState() || {};
    return {};
  }

  function writePatch(patch, action){
    var vg = core();
    if (vg && typeof vg.updateState === 'function') return vg.updateState(patch || {}, action || 'requirement-review:update');
    return null;
  }

  function normalizeRequirement(req, index){
    req = req && typeof req === 'object' ? req : {};
    var id = clean(req.id || req.requirementId || ('REQ-' + String(index + 1).padStart(3, '0')));
    return {
      id: id,
      requirementId: id,
      requirementType: upper(req.requirementType || req.type || req.section || 'GENERAL'),
      value: clean(req.value || req.requirement || req.text || ''),
      numericValue: req.numericValue != null && req.numericValue !== '' ? Number(req.numericValue) : null,
      units: clean(req.units || ''),
      appliesTo: clean(req.appliesTo || req.equipment || req.component || ''),
      sourceDocument: clean(req.sourceDocument || req.document || req.file || ''),
      sourceType: clean(req.sourceType || ''),
      page: clean(req.page || ''),
      section: clean(req.section || ''),
      exactText: clean(req.exactText || req.text || req.value || ''),
      confidence: Math.max(0, Math.min(100, Number(req.confidence == null ? 0 : req.confidence))),
      createdAt: clean(req.createdAt || nowISO()),
      updatedAt: clean(req.updatedAt || req.createdAt || nowISO())
    };
  }

  function normalizeReview(input){
    input = input && typeof input === 'object' ? input : {};
    return {
      requirementId: clean(input.requirementId || input.id || ''),
      status: upper(input.status || 'PENDING_REVIEW'),
      reviewer: clean(input.reviewer || input.reviewedBy || role()),
      reviewedAt: clean(input.reviewedAt || ''),
      reason: clean(input.reason || input.note || ''),
      correctedRequirement: input.correctedRequirement && typeof input.correctedRequirement === 'object' ? input.correctedRequirement : null,
      source: clean(input.source || 'vanguard_requirement_review_gate')
    };
  }

  function documents(){
    var state = readState();
    return state.documents && typeof state.documents === 'object' ? state.documents : {};
  }

  function allRequirements(){
    var docs = documents();
    var list = Array.isArray(docs.requirements) ? docs.requirements : [];
    return list.map(normalizeRequirement);
  }

  function reviewMap(){
    var docs = documents();
    var map = {};
    var list = Array.isArray(docs.requirementReviews) ? docs.requirementReviews : [];
    list.forEach(function(item){
      var r = normalizeReview(item);
      if (r.requirementId) map[r.requirementId] = r;
    });
    return map;
  }

  function approvedRequirements(){
    var docs = documents();
    var approved = Array.isArray(docs.approvedRequirements) ? docs.approvedRequirements : [];
    if (approved.length) return approved.map(normalizeRequirement);

    var reviews = reviewMap();
    return allRequirements().filter(function(req){
      var r = reviews[req.id];
      return r && r.status === 'APPROVED';
    });
  }

  function pendingRequirements(){
    var reviews = reviewMap();
    return allRequirements().filter(function(req){
      var r = reviews[req.id];
      return !r || r.status === 'PENDING_REVIEW' || r.status === 'CORRECTED_PENDING_REVIEW';
    });
  }

  function rejectedRequirements(){
    var reviews = reviewMap();
    return allRequirements().filter(function(req){
      var r = reviews[req.id];
      return r && r.status === 'REJECTED';
    });
  }

  function saveReview(requirementId, status, reason, correctedRequirement){
    if (!canEngineerReview()) {
      return { ok:false, message:'Engineer review permission required.', status:'BLOCKED' };
    }

    var id = clean(requirementId);
    var docs = documents();
    var reviews = Array.isArray(docs.requirementReviews) ? docs.requirementReviews.map(normalizeReview) : [];
    var found = false;
    var item = {
      requirementId: id,
      status: upper(status || 'PENDING_REVIEW'),
      reviewer: role(),
      reviewedAt: nowISO(),
      reason: clean(reason || ''),
      correctedRequirement: correctedRequirement && typeof correctedRequirement === 'object' ? normalizeRequirement(correctedRequirement, 0) : null,
      source: 'vanguard_requirement_review_gate'
    };

    reviews = reviews.map(function(r){
      if (r.requirementId === id) { found = true; return item; }
      return r;
    });
    if (!found) reviews.push(item);

    var requirements = allRequirements();
    if (item.correctedRequirement) {
      var replaced = false;
      requirements = requirements.map(function(req){
        if (req.id === id) { replaced = true; return Object.assign({}, req, item.correctedRequirement, { id:id, requirementId:id, updatedAt:nowISO() }); }
        return req;
      });
      if (!replaced) requirements.push(Object.assign({}, item.correctedRequirement, { id:id, requirementId:id, updatedAt:nowISO() }));
    }

    var approved = requirements.filter(function(req){
      var r = reviews.filter(function(x){ return x.requirementId === req.id; })[0];
      return r && r.status === 'APPROVED';
    });

    var patch = {
      documents: {
        requirements: requirements,
        requirementReviews: reviews,
        approvedRequirements: approved,
        selectedRequirements: approved,
        reviewGate: gateStatusFrom(requirements, reviews, approved),
        approvedRulesPublishedAt: docs.approvedRulesPublishedAt || null
      }
    };

    var state = writePatch(patch, 'requirement-review:' + item.status.toLowerCase());
    return { ok:true, review:item, state:state };
  }

  function approve(id, reason){ return saveReview(id, 'APPROVED', reason || 'Approved by engineer review.', null); }
  function reject(id, reason){ return saveReview(id, 'REJECTED', reason || 'Rejected by engineer review.', null); }
  function correct(id, correctedRequirement, reason){ return saveReview(id, 'APPROVED', reason || 'Corrected and approved by engineer review.', correctedRequirement || {}); }
  function sendBack(id, reason){ return saveReview(id, 'CORRECTED_PENDING_REVIEW', reason || 'Correction required before approval.', null); }

  function gateStatusFrom(requirements, reviews, approved){
    requirements = Array.isArray(requirements) ? requirements : [];
    reviews = Array.isArray(reviews) ? reviews : [];
    approved = Array.isArray(approved) ? approved : [];
    var byId = {};
    reviews.forEach(function(r){ byId[r.requirementId] = normalizeReview(r); });
    var pending = requirements.filter(function(req){ return !byId[req.id] || byId[req.id].status === 'PENDING_REVIEW' || byId[req.id].status === 'CORRECTED_PENDING_REVIEW'; }).length;
    var rejected = requirements.filter(function(req){ return byId[req.id] && byId[req.id].status === 'REJECTED'; }).length;
    var status = pending ? 'REVIEW_REQUIRED' : (approved.length ? 'APPROVED' : 'NO_APPROVED_REQUIREMENTS');
    if (rejected && !approved.length && !pending) status = 'REJECTED';
    return {
      status: status,
      total: requirements.length,
      approved: approved.length,
      pending: pending,
      rejected: rejected,
      lockedForField: pending > 0,
      updatedAt: nowISO(),
      mantra: 'Engineer approves. Field sees simple. Customer gets NASA-grade traceability.'
    };
  }

  function gateStatus(){
    var reqs = allRequirements();
    var docs = documents();
    var reviews = Array.isArray(docs.requirementReviews) ? docs.requirementReviews : [];
    var approved = approvedRequirements();
    return gateStatusFrom(reqs, reviews, approved);
  }

  function publishApprovedRules(){
    if (!canEngineerReview()) {
      return { ok:false, message:'Engineer review permission required.', status:'BLOCKED' };
    }
    var approved = approvedRequirements();
    var gate = gateStatus();
    if (!approved.length) {
      return { ok:false, message:'No approved requirements to publish.', status:'NO_APPROVED_REQUIREMENTS', gate:gate };
    }
    if (gate.pending > 0) {
      return { ok:false, message:'Pending requirements must be approved, corrected, or rejected before publishing.', status:'REVIEW_REQUIRED', gate:gate };
    }

    var rules = {};
    approved.forEach(function(req){
      var type = upper(req.requirementType || 'GENERAL');
      rules[type] = rules[type] || [];
      rules[type].push({
        id: req.id,
        requirementType: type,
        value: req.value,
        numericValue: req.numericValue,
        units: req.units,
        appliesTo: req.appliesTo,
        sourceDocument: req.sourceDocument,
        page: req.page,
        exactText: req.exactText,
        approved: true,
        approvedAt: nowISO(),
        approvedBy: role()
      });
    });

    var patch = {
      documents: {
        approvedRequirements: approved,
        selectedRequirements: approved,
        approvedRules: rules,
        activeRequirementRules: rules,
        approvedRulesPublishedAt: nowISO(),
        reviewGate: Object.assign({}, gate, { status:'PUBLISHED', lockedForField:false, publishedAt:nowISO() })
      },
      registry: {
        approvedRequirementRules: rules
      }
    };

    var vg = core();
    if (vg && typeof vg.registerEvidence === 'function') {
      try {
        vg.registerEvidence('requirements', {
          type: 'approved_requirement_rules',
          status: 'PUBLISHED',
          count: approved.length,
          reviewer: role(),
          at: nowISO(),
          source: 'vanguard_requirement_review_gate'
        });
      } catch(e) {}
    }

    var state = writePatch(patch, 'requirement-review:publish-approved');
    return { ok:true, status:'PUBLISHED', count:approved.length, rules:rules, state:state };
  }

  function getFieldRules(){
    var docs = documents();
    return docs.activeRequirementRules || docs.approvedRules || {};
  }

  function summary(){
    var g = gateStatus();
    return {
      version: VERSION,
      canReview: canEngineerReview(),
      role: role(),
      gate: g,
      requirements: allRequirements(),
      approvedRequirements: approvedRequirements(),
      pendingRequirements: pendingRequirements(),
      rejectedRequirements: rejectedRequirements(),
      fieldRules: getFieldRules()
    };
  }

  var api = {
    __installed: true,
    version: VERSION,
    canEngineerReview: canEngineerReview,
    allRequirements: allRequirements,
    approvedRequirements: approvedRequirements,
    pendingRequirements: pendingRequirements,
    rejectedRequirements: rejectedRequirements,
    reviewMap: reviewMap,
    gateStatus: gateStatus,
    approve: approve,
    reject: reject,
    correct: correct,
    sendBack: sendBack,
    publishApprovedRules: publishApprovedRules,
    getFieldRules: getFieldRules,
    summary: summary
  };

  window.NEXUS_VANGUARD_REQUIREMENT_REVIEW = api;
  window.VanguardRequirementReview = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardRequirementReview = api;
  try { window.dispatchEvent(new CustomEvent('vanguard:requirement-review-ready', { detail: api.summary() })); } catch(e) {}
})();
