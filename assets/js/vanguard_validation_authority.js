/*
  assets/js/vanguard_validation_authority.js
  HyperCore / NEXUS Vanguard Validation Authority

  Purpose:
  - Single deterministic authority for PASS / REVIEW / BLOCKED decisions.
  - AI may extract requirements and evidence, but this engine decides whether a field/module/package can pass.
  - Front-end only. No Firebase backend required.
  - Additive: does not replace existing page logic until callers opt into it.

  Core rule:
  - No source/citation/reference = no enforcement.
  - No approved/enforced requirement = review, not pass.
  - Numeric mismatch = blocked unless authorized override exists.
  - N/A requires reason + reference + review/override trail.
  - Open conflicts block package readiness.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_VALIDATION_AUTHORITY && window.NEXUS_VANGUARD_VALIDATION_AUTHORITY.__installed) return;

  var VERSION = '1.0.0-validation-authority';
  var REQUIREMENTS_KEY = 'nexus_vanguard_requirements';
  var CONFLICTS_KEY = 'nexus_vanguard_conflicts_v1';
  var AUTHORITY_KEY_PREFIX = 'nexus_vanguard_authority_';

  var STATUS = {
    PASS: 'PASS',
    REVIEW: 'REVIEW',
    BLOCKED: 'BLOCKED'
  };

  var SEVERITY = {
    INFO: 'INFO',
    REVIEW: 'REVIEW',
    BLOCKER: 'BLOCKER'
  };

  var MODULE_SEQUENCE = [
    { id:'rif', label:'Receipt Inspection' },
    { id:'phenolic', label:'Phenolic Display' },
    { id:'torque', label:'Torque' },
    { id:'l2', label:'L2 Verification' },
    { id:'meg', label:'Megohmmeter Testing' },
    { id:'prefod', label:'Pre-FOD' },
    { id:'fpv', label:'Finished Product Verification' },
    { id:'ccs', label:'Construction Check Sheet' }
  ];

  function clean(value){ return String(value == null ? '' : value).trim(); }
  function lower(value){ return clean(value).toLowerCase(); }
  function upper(value){ return clean(value).toUpperCase(); }
  function nowISO(){ return new Date().toISOString(); }
  function id(prefix){ return (prefix || 'VAL') + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,8).toUpperCase(); }

  function readJSON(key, fallback){
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch(e){
      return fallback;
    }
  }

  function writeJSON(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
    return value;
  }

  function getEq(input){
    if (input && typeof input === 'object') {
      var fromInput = clean(input.eq || input.equipmentId || input.equipment || '');
      if (fromInput) return fromInput;
    }
    try {
      var p = new URLSearchParams(location.search);
      var fromUrl = clean(p.get('eq') || p.get('equipment') || p.get('equipmentId') || '');
      if (fromUrl) return fromUrl;
    } catch(e) {}
    return clean(localStorage.getItem('nexus_active_equipment') || localStorage.getItem('nexus_active_eq') || 'NO_EQ') || 'NO_EQ';
  }

  function numeric(value){
    if (value == null || value === '') return null;
    if (typeof value === 'number' && isFinite(value)) return value;
    var match = clean(value).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function normalizeStatus(value){
    var s = upper(value);
    if (['PASS','PASSED','GO','GOOD','YES','Y','COMPLETE','COMPLETED','READY'].indexOf(s) !== -1) return 'PASS';
    if (['FAIL','FAILED','NO','N','NG','BAD'].indexOf(s) !== -1) return 'FAIL';
    if (['NA','N/A','NOT APPLICABLE','NOT-APPLICABLE'].indexOf(s) !== -1) return 'NA';
    if (['REVIEW','CHECK','HOLD','PENDING','UNKNOWN'].indexOf(s) !== -1) return 'REVIEW';
    return s || '';
  }

  function normalizeUnit(unit){
    var u = lower(unit).replace(/\s+/g,'').replace(/Ω/g,'ω');
    if (['ftlb','ft-lb','ftlbs','footpounds','foot-pound','lbft','lb-ft'].indexOf(u) !== -1) return 'ft-lb';
    if (['inlb','in-lb','inlbs','inchpounds','inch-pound','lbin','lb-in'].indexOf(u) !== -1) return 'in-lb';
    if (['nm','n-m','n·m'].indexOf(u) !== -1) return 'N·m';
    if (['mω','mohm','megohm','megohms','mω','mωs','mω'].indexOf(u) !== -1) return 'MΩ';
    if (u === 'mΩ'.toLowerCase()) return 'MΩ';
    return clean(unit);
  }

  function convertNumeric(value, fromUnit, toUnit){
    var n = numeric(value);
    if (n == null) return null;
    var from = normalizeUnit(fromUnit);
    var to = normalizeUnit(toUnit);
    if (!from || !to || from === to) return n;
    if (from === 'ft-lb' && to === 'in-lb') return n * 12;
    if (from === 'in-lb' && to === 'ft-lb') return n / 12;
    if (from === 'N·m' && to === 'ft-lb') return n * 0.737562149;
    if (from === 'ft-lb' && to === 'N·m') return n * 1.3558179483;
    if (from === 'N·m' && to === 'in-lb') return n * 8.85074579;
    if (from === 'in-lb' && to === 'N·m') return n * 0.112984829;
    return n;
  }

  function issue(code, severity, message, detail){
    return Object.assign({
      id: id('ISSUE'),
      code: clean(code || 'GENERAL'),
      severity: severity || SEVERITY.REVIEW,
      message: clean(message || ''),
      createdAt: nowISO()
    }, detail || {});
  }

  function citationFromRequirement(req){
    req = req || {};
    var citations = Array.isArray(req.citations) ? req.citations : [];
    if (citations.length) return citations[0];
    return {
      source: clean(req.sourceName || req.sourceDocument || req.document || ''),
      locator: clean(req.page || req.section || req.locator || ''),
      quote: clean(req.text || req.exactText || req.title || req.value || ''),
      confidence: Number(req.confidence == null ? 0 : req.confidence)
    };
  }

  function hasCitation(req){
    var c = citationFromRequirement(req || {});
    return !!(clean(c.source) && (clean(c.locator) || clean(c.quote)));
  }

  function hasReference(item){
    item = item || {};
    if (clean(item.source) && lower(item.source) !== 'nexus vanguard') return true;
    if (clean(item.sourceName || item.sourceDocument || item.documentReference || item.reference)) return true;
    if (Array.isArray(item.references) && item.references.some(function(r){ return clean(r && (r.url || r.name || r.notes || r.page || r.section)); })) return true;
    if (Array.isArray(item.evidenceRecords) && item.evidenceRecords.some(function(r){ return clean(r && (r.url || r.reference || r.sourceDocument || r.page || r.notes)); })) return true;
    if (item.aiCheck && Array.isArray(item.aiCheck.citations) && item.aiCheck.citations.length) return true;
    if (item.vanguardRule && Array.isArray(item.vanguardRule.citations) && item.vanguardRule.citations.length) return true;
    return false;
  }

  function hasReason(item){
    item = item || {};
    return !!clean(item.reason || item.note || item.notes || item.comment || (item.supervisorReview && item.supervisorReview.comment));
  }

  function hasOverride(item){
    item = item || {};
    var decision = upper(item.supervisorReview && item.supervisorReview.decision);
    if (decision === 'OVERRIDE') return true;
    if (item.supervisorOverride && item.supervisorOverride.active) return true;
    if (item.override && (item.override.active || item.override.status === 'OVERRIDDEN')) return true;
    return false;
  }

  function result(scope, status, message, issues, extra){
    issues = Array.isArray(issues) ? issues : [];
    var blockers = issues.filter(function(i){ return i.severity === SEVERITY.BLOCKER; });
    var reviews = issues.filter(function(i){ return i.severity === SEVERITY.REVIEW; });
    var finalStatus = status || (blockers.length ? STATUS.BLOCKED : reviews.length ? STATUS.REVIEW : STATUS.PASS);
    return Object.assign({
      id: id('AUTH'),
      authorityVersion: VERSION,
      scope: clean(scope || 'general'),
      status: finalStatus,
      canPass: finalStatus === STATUS.PASS,
      blocking: finalStatus === STATUS.BLOCKED,
      reviewRequired: finalStatus === STATUS.REVIEW,
      message: clean(message || ''),
      issues: issues,
      blockerCount: blockers.length,
      reviewCount: reviews.length,
      createdAt: nowISO()
    }, extra || {});
  }

  function requirementsAsArray(){
    var raw = readJSON(REQUIREMENTS_KEY, {});
    if (Array.isArray(raw)) return raw;
    return Object.keys(raw || {}).map(function(k){ return raw[k]; }).filter(Boolean);
  }

  function approvedRequirements(filter){
    filter = filter || {};
    var type = upper(filter.type || filter.requirementType || '');
    var eq = clean(filter.eq || filter.equipmentId || '');
    return requirementsAsArray().filter(function(req){
      if (!req) return false;
      if (!(req.approved || req.enforce || lower(req.state) === 'approved')) return false;
      if (type && upper(req.type || req.requirementType) !== type) return false;
      var reqEq = clean(req.equipmentId || req.equipment || req.appliesTo || '');
      if (eq && reqEq && reqEq !== eq) return false;
      return true;
    });
  }

  function requireApprovedRequirement(type, eq){
    var reqs = approvedRequirements({ type:type, eq:eq });
    if (!reqs.length) {
      return {
        requirement:null,
        issues:[issue('NO_APPROVED_REQUIREMENT', SEVERITY.REVIEW, 'No approved ' + type + ' requirement is available for enforcement.', { type:type })]
      };
    }
    var withCitation = reqs.filter(hasCitation);
    if (!withCitation.length) {
      return {
        requirement:reqs[0],
        issues:[issue('MISSING_REQUIREMENT_CITATION', SEVERITY.BLOCKER, 'Approved ' + type + ' requirement is missing a source citation.', { requirement:reqs[0] })]
      };
    }
    return { requirement:withCitation[0], issues:[] };
  }

  function compareNumeric(entry, requirement, options){
    options = options || {};
    requirement = requirement || {};
    var type = upper(options.type || requirement.type || requirement.requirementType || 'GENERAL');
    var reqUnit = normalizeUnit(requirement.unit || requirement.units || options.unit || '');
    var enteredUnit = normalizeUnit(entry && (entry.unit || entry.units || entry.uom || options.enteredUnit || reqUnit));
    var reqValue = requirement.value != null && requirement.value !== '' ? numeric(requirement.value) : numeric(requirement.numericValue || requirement.requiredValue);
    var enteredValue = entry && (entry.value != null ? entry.value : entry.measuredValue != null ? entry.measuredValue : entry.reading != null ? entry.reading : entry.torque != null ? entry.torque : entry.resistance);
    var entered = convertNumeric(enteredValue, enteredUnit, reqUnit);
    var issues = [];

    if (reqValue == null) {
      issues.push(issue('MISSING_REQUIRED_NUMERIC_VALUE', SEVERITY.BLOCKER, 'Approved requirement is missing a numeric value.', { requirement:requirement }));
    }
    if (entered == null) {
      issues.push(issue('MISSING_ENTERED_NUMERIC_VALUE', SEVERITY.BLOCKER, 'Entered field value is missing or not numeric.', { entry:entry }));
    }
    if (issues.length) return { pass:false, issues:issues, enteredValue:entered, requiredValue:reqValue, unit:reqUnit };

    var comparator = lower(requirement.comparator || requirement.operator || '');
    var tolerancePercent = numeric(requirement.tolerancePercent);
    var pass = false;
    var low = reqValue;
    var high = reqValue;
    var rule = '';

    if (comparator === '=' || comparator === 'equals' || comparator === 'exact') {
      pass = entered === reqValue;
      rule = 'exact match';
    } else if (comparator === '<=' || comparator === 'max' || comparator === 'maximum') {
      pass = entered <= reqValue;
      rule = 'maximum';
    } else if (comparator === '>=' || comparator === 'min' || comparator === 'minimum' || type === 'MEG' || type === 'INSULATION') {
      pass = entered >= reqValue;
      rule = 'minimum';
    } else if (type === 'TORQUE') {
      var tol = tolerancePercent == null ? numeric(options.defaultTorqueTolerancePercent) : tolerancePercent;
      if (tol == null) tol = 0;
      low = reqValue * (1 - tol / 100);
      high = reqValue * (1 + tol / 100);
      pass = entered >= low && entered <= high;
      rule = tol ? ('±' + tol + '% tolerance') : 'exact torque value';
    } else {
      pass = entered >= reqValue;
      rule = 'minimum default';
    }

    if (!pass) {
      issues.push(issue('NUMERIC_MISMATCH', SEVERITY.BLOCKER, 'Entered value does not meet the approved ' + type + ' requirement.', {
        enteredValue: entered,
        requiredValue: reqValue,
        lowLimit: low,
        highLimit: high,
        unit: reqUnit,
        rule: rule,
        requirement: requirement,
        citation: citationFromRequirement(requirement)
      }));
    }

    return { pass:pass, issues:issues, enteredValue:entered, requiredValue:reqValue, lowLimit:low, highLimit:high, unit:reqUnit, rule:rule };
  }

  function validateNumericEntry(entry, options){
    options = options || {};
    var type = upper(options.type || entry && (entry.type || entry.requirementType || entry.module) || 'GENERAL');
    var eq = clean(options.eq || options.equipmentId || entry && (entry.eq || entry.equipmentId) || getEq());
    var req = options.requirement || null;
    var issues = [];

    if (!req) {
      var reqLookup = requireApprovedRequirement(type, eq);
      req = reqLookup.requirement;
      issues = issues.concat(reqLookup.issues || []);
    } else if (!hasCitation(req)) {
      issues.push(issue('MISSING_REQUIREMENT_CITATION', SEVERITY.BLOCKER, 'Requirement used for validation is missing citation/source.', { requirement:req }));
    }

    if (!req) {
      return result('numeric:' + type.toLowerCase(), issues.some(function(i){ return i.severity === SEVERITY.BLOCKER; }) ? STATUS.BLOCKED : STATUS.REVIEW, 'Numeric validation requires an approved source requirement.', issues, { type:type, eq:eq, entry:entry });
    }

    var comparison = compareNumeric(entry || {}, req, options);
    issues = issues.concat(comparison.issues || []);

    if (issues.some(function(i){ return i.severity === SEVERITY.BLOCKER; }) && hasOverride(entry)) {
      issues.push(issue('AUTHORIZED_OVERRIDE', SEVERITY.REVIEW, 'Numeric blocker has an authorized override and remains review/audit visible.', { entry:entry }));
      return result('numeric:' + type.toLowerCase(), STATUS.REVIEW, 'Numeric mismatch cleared only by override; review remains required.', issues.filter(function(i){ return i.code !== 'NUMERIC_MISMATCH'; }).concat((comparison.issues || []).map(function(i){ return Object.assign({}, i, { severity:SEVERITY.REVIEW }); })), { type:type, eq:eq, entry:entry, requirement:req, comparison:comparison });
    }

    var finalStatus = issues.some(function(i){ return i.severity === SEVERITY.BLOCKER; }) ? STATUS.BLOCKED : issues.length ? STATUS.REVIEW : STATUS.PASS;
    return result('numeric:' + type.toLowerCase(), finalStatus, finalStatus === STATUS.PASS ? type + ' numeric validation passed.' : type + ' numeric validation did not pass.', issues, { type:type, eq:eq, entry:entry, requirement:req, comparison:comparison, citation:citationFromRequirement(req) });
  }

  function validateChecklistItem(item, options){
    options = options || {};
    item = item || {};
    var status = normalizeStatus(item.status || item.result || item.passFail || '');
    var issues = [];

    if (!status) issues.push(issue('MISSING_STATUS', SEVERITY.BLOCKER, 'Checklist item has no PASS / FAIL / REVIEW / N/A selection.', { item:item }));
    if (status === 'FAIL') issues.push(issue('FAILED_ITEM', SEVERITY.BLOCKER, 'Checklist item is marked FAIL.', { item:item }));
    if (status === 'NA') {
      if (!hasReason(item)) issues.push(issue('NA_MISSING_REASON', SEVERITY.BLOCKER, 'N/A requires a reason.', { item:item }));
      if (!hasReference(item)) issues.push(issue('NA_MISSING_REFERENCE', SEVERITY.BLOCKER, 'N/A requires a supporting reference.', { item:item }));
      issues.push(issue('NA_REVIEW_REQUIRED', SEVERITY.REVIEW, 'N/A remains visible for review/audit.', { item:item }));
    }
    if ((status === 'REVIEW' || status === 'FAIL') && !hasReason(item)) issues.push(issue('REVIEW_MISSING_NOTES', SEVERITY.REVIEW, 'Review/fail item should include notes.', { item:item }));

    var textForRules = upper([item.validationRule, item.rule, item.evidenceRequired, item.source, item.title, item.description].join(' '));
    var referenceRequired = /DOCUMENT|REFERENCE|SOURCE|DRAWING|SPEC|SUBMITTAL|REQUIREMENT/.test(textForRules) || status === 'PASS';
    if (referenceRequired && !hasReference(item)) {
      issues.push(issue('MISSING_REFERENCE', SEVERITY.BLOCKER, 'Checklist item requires a source/reference before it can pass.', { item:item }));
    }

    if (item.aiCheck) {
      var aiStatus = upper(item.aiCheck.status || item.aiCheck.state || '');
      if (aiStatus === 'BLOCKED' || aiStatus === 'FAIL' || aiStatus === 'FAILED') issues.push(issue('AI_CHECK_BLOCKED', SEVERITY.BLOCKER, clean(item.aiCheck.message || 'AI/Vanguard check is blocked.'), { aiCheck:item.aiCheck }));
      var conf = numeric(item.aiCheck.confidence);
      if (conf != null && conf > 1) conf = conf / 100;
      if (conf != null && conf > 0 && conf < (options.minimumConfidence || 0.82)) issues.push(issue('LOW_CONFIDENCE', SEVERITY.BLOCKER, 'Validation confidence is below threshold.', { confidence:conf, aiCheck:item.aiCheck }));
    }

    if (issues.some(function(i){ return i.severity === SEVERITY.BLOCKER; }) && hasOverride(item)) {
      issues = issues.map(function(i){ return i.severity === SEVERITY.BLOCKER ? Object.assign({}, i, { severity:SEVERITY.REVIEW, overridden:true }) : i; });
      issues.push(issue('AUTHORIZED_OVERRIDE', SEVERITY.REVIEW, 'Hard gate cleared by authorized override.', { item:item }));
    }

    var finalStatus = issues.some(function(i){ return i.severity === SEVERITY.BLOCKER; }) ? STATUS.BLOCKED : issues.length ? STATUS.REVIEW : STATUS.PASS;
    return result('checklist:item', finalStatus, finalStatus === STATUS.PASS ? 'Checklist item passed authority checks.' : 'Checklist item requires action.', issues, { item:item });
  }

  function validateChecklist(items, options){
    options = options || {};
    var list = Array.isArray(items) ? items : (items && Array.isArray(items.steps) ? items.steps : []);
    var itemResults = list.map(function(item, index){
      var r = validateChecklistItem(item, options);
      r.index = index;
      r.stepId = clean(item && (item.id || item.stepId || item.step));
      r.title = clean(item && (item.title || item.description || item.stepDescription));
      return r;
    });
    var issues = [];
    itemResults.forEach(function(r){
      if (r.status !== STATUS.PASS) {
        issues.push(issue('CHECKLIST_ITEM_' + r.status, r.status === STATUS.BLOCKED ? SEVERITY.BLOCKER : SEVERITY.REVIEW, 'Step ' + (r.index + 1) + ': ' + (r.message || 'Review required.'), { itemResult:r }));
      }
    });
    var finalStatus = issues.some(function(i){ return i.severity === SEVERITY.BLOCKER; }) ? STATUS.BLOCKED : issues.length ? STATUS.REVIEW : STATUS.PASS;
    return result('checklist', finalStatus, finalStatus === STATUS.PASS ? 'Checklist passed authority checks.' : 'Checklist is not ready.', issues, { itemResults:itemResults, total:list.length });
  }

  function validateConflicts(){
    var raw = readJSON(CONFLICTS_KEY, { conflicts:[] });
    var conflicts = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.conflicts) ? raw.conflicts : []);
    var open = conflicts.filter(function(c){
      var s = upper(c.status || c.state || 'REVIEW');
      return !(s === 'PASS' || s === 'RESOLVED' || s === 'APPROVED' || s === 'CLOSED' || s === 'OVERRIDDEN');
    });
    var issues = open.map(function(c){ return issue('OPEN_DOCUMENT_CONFLICT', SEVERITY.BLOCKER, clean(c.message || c.reason || 'Open document conflict requires review.'), { conflict:c }); });
    return result('documents:conflicts', issues.length ? STATUS.BLOCKED : STATUS.PASS, issues.length ? 'Open document conflicts block package readiness.' : 'No open document conflicts.', issues, { conflicts:conflicts, openConflicts:open });
  }

  function localStepComplete(eq, step){
    var keys = [
      'nexus_' + eq + '_step_' + step,
      'nexus_' + eq + '_' + step + '_complete',
      'nexus_' + eq + '_' + step + '_completed',
      'nexus_' + eq + '_' + step + '_done',
      'nexus_' + eq + '_' + step + '_validated',
      'nexus_' + eq + '_' + step + '_signed_off'
    ];
    if (step === 'meg') {
      keys.push('nexus_' + eq + '_step_megohmmeter_line');
      keys.push('nexus_' + eq + '_step_megohmmeter_load');
    }
    return keys.some(function(k){ return ['1','true','yes','complete','completed','done','pass','passed','validated'].indexOf(lower(localStorage.getItem(k))) !== -1; });
  }

  function validateWorkflow(eq){
    eq = clean(eq || getEq());
    var issues = [];
    var checks = MODULE_SEQUENCE.map(function(step){
      var complete = localStepComplete(eq, step.id);
      if (!complete) issues.push(issue('WORKFLOW_STEP_INCOMPLETE', SEVERITY.BLOCKER, step.label + ' is not complete.', { step:step.id, label:step.label }));
      return { step:step.id, label:step.label, complete:complete };
    });
    return result('workflow', issues.length ? STATUS.BLOCKED : STATUS.PASS, issues.length ? 'Workflow has incomplete required steps.' : 'Workflow required steps are complete.', issues, { eq:eq, checks:checks });
  }

  function validatePackage(eq, options){
    options = options || {};
    eq = clean(eq || getEq());
    var checks = [];
    checks.push(validateWorkflow(eq));
    checks.push(validateConflicts());

    var ccsPayload = readJSON('nexus_' + eq + '_ccs_vanguard_export', null);
    if (ccsPayload && Array.isArray(ccsPayload.steps)) checks.push(validateChecklist(ccsPayload.steps, { eq:eq }));
    else checks.push(result('checklist', STATUS.REVIEW, 'No CCS validation payload found for package authority review.', [issue('MISSING_CCS_PAYLOAD', SEVERITY.REVIEW, 'CCS Vanguard export payload is missing.', { eq:eq })], { eq:eq }));

    var torqueValidation = readJSON('nexus_' + eq + '_torque_vanguard_validation_v1', null);
    if (torqueValidation && upper(torqueValidation.state || torqueValidation.status) === 'BLOCKED') {
      checks.push(result('torque', STATUS.BLOCKED, torqueValidation.summary || 'Torque Vanguard validation is blocked.', [issue('TORQUE_BLOCKED', SEVERITY.BLOCKER, torqueValidation.summary || 'Torque validation blocked.', { validation:torqueValidation })], { eq:eq }));
    }

    var blockers = [];
    var reviews = [];
    checks.forEach(function(check){
      (check.issues || []).forEach(function(i){
        if (i.severity === SEVERITY.BLOCKER) blockers.push(i);
        else if (i.severity === SEVERITY.REVIEW) reviews.push(i);
      });
    });
    var finalStatus = blockers.length ? STATUS.BLOCKED : reviews.length ? STATUS.REVIEW : STATUS.PASS;
    var out = result('package', finalStatus, finalStatus === STATUS.PASS ? 'Package authority passed. Ready for release review.' : finalStatus === STATUS.BLOCKED ? 'Package authority blocked release.' : 'Package authority requires review.', blockers.concat(reviews), { eq:eq, checks:checks });
    writeJSON(AUTHORITY_KEY_PREFIX + eq, out);
    return out;
  }

  function explain(authorityResult){
    authorityResult = authorityResult || {};
    var lines = [];
    lines.push((authorityResult.status || 'REVIEW') + ': ' + (authorityResult.message || 'Validation authority result.'));
    (authorityResult.issues || []).slice(0, 8).forEach(function(i){ lines.push('- ' + i.message); });
    return lines.join('\n');
  }

  function assertCanPass(scope, payload, options){
    var out;
    var s = lower(scope);
    if (s === 'checklist' || s === 'ccs') out = validateChecklist(payload, options || {});
    else if (s === 'package') out = validatePackage(payload && (payload.eq || payload.equipmentId) || getEq(payload), options || {});
    else if (s === 'numeric' || s === 'torque' || s === 'meg') out = validateNumericEntry(payload, Object.assign({}, options || {}, { type:s === 'numeric' ? (options && options.type) : upper(s) }));
    else out = result(scope, STATUS.REVIEW, 'No authority validator exists for scope: ' + scope, [issue('UNKNOWN_AUTHORITY_SCOPE', SEVERITY.REVIEW, 'No validator exists for this scope.', { scope:scope })]);
    if (!out.canPass) {
      var err = new Error(explain(out));
      err.authorityResult = out;
      throw err;
    }
    return out;
  }

  var api = {
    __installed:true,
    version:VERSION,
    STATUS:STATUS,
    SEVERITY:SEVERITY,
    normalizeStatus:normalizeStatus,
    normalizeUnit:normalizeUnit,
    convertNumeric:convertNumeric,
    compareNumeric:compareNumeric,
    approvedRequirements:approvedRequirements,
    requireApprovedRequirement:requireApprovedRequirement,
    validateNumericEntry:validateNumericEntry,
    validateChecklistItem:validateChecklistItem,
    validateChecklist:validateChecklist,
    validateConflicts:validateConflicts,
    validateWorkflow:validateWorkflow,
    validatePackage:validatePackage,
    assertCanPass:assertCanPass,
    explain:explain
  };

  window.NEXUS_VANGUARD_VALIDATION_AUTHORITY = api;
  window.VanguardValidationAuthority = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardValidationAuthority = api;

  try { window.dispatchEvent(new CustomEvent('vanguard:validation-authority-ready', { detail:{ version:VERSION } })); } catch(e) {}
})();
