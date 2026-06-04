/*
  assets/js/ccs_excel_importer.js
  NEXUS CCS Excel Importer

  Purpose:
  - Parses drag/drop CCS Excel templates into normalized checklist steps.
  - Supports a simple single-tab template and the existing two-tab template.
  - Generates a downloadable Excel template in the browser when XLSX is loaded.
  - Additive only; does not replace page rendering or existing save logic.
  - Front-end hardened: preserves N/A, normalizes references/requirements, and attaches import-time Vanguard gate precheck.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_CCS_EXCEL_IMPORTER && window.NEXUS_CCS_EXCEL_IMPORTER.__installed) return;

  var VERSION = '0.3.0-hard-gate-importer';

  var STEP_SHEET_CANDIDATES = [
    'CCS_Steps',
    'CCS Steps',
    'Steps',
    'CCS_Template',
    'Checklist',
    'Sheet1'
  ];

  var REF_SHEET_CANDIDATES = [
    'Step_References',
    'Step References',
    'References',
    'Reference Docs',
    'Reference_Docs',
    'Docs',
    'Sheet2'
  ];

  var STEP_HEADERS = [
    'Step ID',
    'Section',
    'Step',
    'Task',
    'Description',
    'Required',
    'Role',
    'Evidence Required',
    'Validation Rule',
    'Source / Requirement',
    'Reference Name',
    'Reference URL',
    'Notes',
    'Sort Order'
  ];

  var REF_HEADERS = [
    'Step ID',
    'Reference Name',
    'Reference Type',
    'Reference URL',
    'Notes'
  ];

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function lower(value) {
    return clean(value).toLowerCase();
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function slug(value) {
    return clean(value)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function truthy(value) {
    var v = lower(value);
    if (!v) return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'n' || v === 'optional') return false;
    return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'required' || v === 'x' || v === 'mandatory';
  }

  function normalizeStatus(raw) {
    var statusRaw = clean(raw).toUpperCase();
    if (['PASS', 'PASSED', 'P', 'YES', 'Y', 'GO', 'TRUE', 'COMPLETE', 'COMPLETED'].indexOf(statusRaw) !== -1) return 'PASS';
    if (['FAIL', 'FAILED', 'F', 'NO', 'N', 'FALSE', 'NG'].indexOf(statusRaw) !== -1) return 'FAIL';
    if (['NA', 'N/A', 'NOT APPLICABLE', 'NOT-APPLICABLE'].indexOf(statusRaw) !== -1) return 'NA';
    if (['REVIEW', 'REV', 'PENDING', 'HOLD', 'CHECK'].indexOf(statusRaw) !== -1) return 'REVIEW';
    return '';
  }

  function normalizeSheetKey(key) {
    return lower(key).replace(/[^a-z0-9]+/g, '');
  }

  function firstValue(row, names) {
    var normalized = {};
    Object.keys(row || {}).forEach(function (key) {
      normalized[normalizeSheetKey(key)] = row[key];
    });

    for (var i = 0; i < names.length; i += 1) {
      var direct = row[names[i]];
      if (direct != null && clean(direct) !== '') return direct;

      var normalizedHit = normalized[normalizeSheetKey(names[i])];
      if (normalizedHit != null && clean(normalizedHit) !== '') return normalizedHit;
    }

    return '';
  }

  function findSheetName(workbook, candidates, fallbackIndex) {
    var names = workbook && workbook.SheetNames ? workbook.SheetNames : [];
    var lowerMap = {};

    names.forEach(function (name) {
      lowerMap[lower(name)] = name;
    });

    for (var i = 0; i < candidates.length; i += 1) {
      var hit = lowerMap[lower(candidates[i])];
      if (hit) return hit;
    }

    return names[fallbackIndex] || names[0] || '';
  }

  function normalizeReference(ref) {
    ref = ref || {};
    return {
      name: clean(ref.name || ref.referenceName || ref['Reference Name'] || ref.Name || ref.documentName || ref.title || 'Reference'),
      type: clean(ref.type || ref.referenceType || ref['Reference Type'] || ref.Type || ref.documentType || ''),
      url: clean(ref.url || ref.referenceUrl || ref['Reference URL'] || ref.link || ref.Link || ref.File || ref.file || ''),
      page: clean(ref.page || ref.Page || ref.pageNumber || ref['Page'] || ref['Page Number'] || ''),
      section: clean(ref.section || ref.Section || ref.paragraph || ref['Section'] || ''),
      notes: clean(ref.notes || ref.Notes || ref.Description || ref.Comments || ref.excerpt || '')
    };
  }

  function rowsToRefsByStep(refRows) {
    var refsByStep = {};

    (refRows || []).forEach(function (row, idx) {
      var stepId = clean(firstValue(row, ['Step ID', 'StepID', 'Step', 'Step Number', 'Step #', 'ID', 'Item', 'No', 'No.']));
      if (!stepId) return;

      var ref = normalizeReference({
        name: firstValue(row, ['Reference Name', 'Name', 'Document Name', 'File Name', 'Title']) || ('Reference ' + (idx + 1)),
        type: firstValue(row, ['Reference Type', 'Type', 'Document Type', 'File Type']),
        url: firstValue(row, ['Reference URL', 'File URL', 'Document URL', 'Link', 'Hyperlink', 'Open File', 'File']),
        page: firstValue(row, ['Page', 'Page Number', 'Sheet', 'Drawing Page']),
        section: firstValue(row, ['Section', 'Spec Section', 'Paragraph', 'Locator']),
        notes: firstValue(row, ['Notes', 'Description', 'Comments', 'Remarks', 'Excerpt'])
      });

      if (!refsByStep[stepId]) refsByStep[stepId] = [];
      refsByStep[stepId].push(ref);
    });

    return refsByStep;
  }

  function hasReference(step) {
    var refs = Array.isArray(step && step.references) ? step.references : [];
    if (refs.some(function (r) { return clean((r && r.url) || '') || clean((r && r.name) || '') || clean((r && r.page) || '') || clean((r && r.section) || ''); })) return true;
    return !!clean(step && (step.source || step.documentReference || step.reference));
  }

  function hardGatePrecheck(step) {
    try {
      if (window.NEXUS_VANGUARD_HARD_GATES && typeof window.NEXUS_VANGUARD_HARD_GATES.validateStep === 'function') {
        return window.NEXUS_VANGUARD_HARD_GATES.validateStep(step || {}, { requireNaApproval: false, requireLocator: false });
      }
    } catch (err) {}
    return null;
  }

  function normalizeRequirementFromStep(step) {
    var raw = {
      id: step.id,
      type: step.validationRule || 'ccs',
      title: step.title,
      text: step.description || step.title,
      sourceName: step.source || 'Imported Excel file',
      sourceType: 'CCS Excel Import',
      citations: (Array.isArray(step.references) ? step.references : []).map(function (ref) {
        return {
          source: ref.name || step.source || 'Imported Excel file',
          locator: [ref.page ? ('p. ' + ref.page) : '', ref.section || ref.url || ''].filter(Boolean).join(' '),
          quote: ref.notes || step.description || step.title || '',
          confidence: 0.7
        };
      }),
      confidence: 0.7,
      state: 'review'
    };

    try {
      if (window.NEXUS_REQUIREMENT_NORMALIZER && typeof window.NEXUS_REQUIREMENT_NORMALIZER.normalizeRequirement === 'function') {
        return window.NEXUS_REQUIREMENT_NORMALIZER.normalizeRequirement(raw, { name: step.source || 'Imported Excel file', type: 'CCS Excel Import' });
      }
    } catch (err) {}

    return raw;
  }

  function buildAiPrecheck(step, reason) {
    var refs = Array.isArray(step.references) ? step.references : [];
    var referencePresent = hasReference(step);
    var issues = [];
    var warnings = [];

    if (!clean(step.title)) issues.push('Missing task/title.');
    if (!clean(step.description)) issues.push('Missing field instruction/description.');
    if (!clean(step.source)) issues.push('Missing source/requirement.');
    if (!referencePresent) warnings.push('No linked reference document/page.');
    if (step.status === 'NA' && !clean(step.note)) issues.push('N/A imported without a reason/note.');
    if (step.status === 'FAIL') issues.push('Imported row is marked FAIL and cannot pass without correction or authorized override.');

    var hardGate = hardGatePrecheck(step);
    if (hardGate) {
      if (hardGate.status === 'BLOCKED') {
        issues = issues.concat(Array.isArray(hardGate.issues) ? hardGate.issues : [hardGate.message || 'Vanguard hard gate blocked this imported row.']);
      } else if (hardGate.status === 'REVIEW') {
        warnings = warnings.concat(Array.isArray(hardGate.warnings) ? hardGate.warnings : [hardGate.message || 'Vanguard hard gate requires review.']);
      }
    }

    return {
      required: true,
      autoChecked: true,
      status: issues.length ? 'BLOCKED' : (warnings.length ? 'REVIEW' : 'PENDING'),
      fieldLabel: issues.length ? 'STOP' : (warnings.length ? 'CHECK' : 'CHECK'),
      tone: issues.length ? 'stop' : (warnings.length ? 'check' : 'check'),
      reason: clean(reason || 'Excel import precheck complete.'),
      message: issues.length ? issues.join(' ') : (warnings.length ? warnings.join(' ') : 'Step has source/reference data. Ready for Vanguard validation.'),
      issues: issues,
      warnings: warnings,
      hardGate: hardGate || null,
      checks: {
        hasTitle: !!clean(step.title),
        hasDescription: !!clean(step.description),
        hasSource: !!clean(step.source),
        hasReference: referencePresent,
        referenceCount: refs.length,
        importedStatus: step.status || ''
      },
      requirement: normalizeRequirementFromStep(step),
      checkedAt: nowISO(),
      checkedBy: 'NEXUS_CCS_EXCEL_IMPORTER'
    };
  }

  function normalizeStep(row, idx, refsByStep) {
    var rawId = firstValue(row, ['Step ID', 'StepID', 'Step', 'Step Number', 'Step #', 'ID', 'Item', 'No', 'No.']);
    var order = firstValue(row, ['Sort Order', 'Order', 'Sequence', 'Seq']);
    var id = clean(rawId) || ('XLSX-' + String(idx + 1).padStart(3, '0'));
    var section = clean(firstValue(row, ['Section', 'Category', 'Group', 'Phase', 'Discipline'])) || 'GENERAL';
    var task = clean(firstValue(row, ['Task', 'Inspection Item', 'Title', 'Checklist Item', 'Item Description', 'Step Description', 'Work Item', 'Requirement'])) || ('Imported Step ' + (idx + 1));
    var description = clean(firstValue(row, ['Description', 'Instruction', 'Instructions', 'Requirement', 'Comments', 'Notes', 'Remarks'])) || task;
    var source = clean(firstValue(row, ['Source / Requirement', 'Source', 'Document Reference', 'Reference', 'Spec', 'Drawing', 'Doc Ref', 'Requirement Source'])) || 'Imported Excel file';
    var requiredValue = firstValue(row, ['Required', 'Is Required', 'Mandatory']);
    var role = clean(firstValue(row, ['Role', 'Responsible Role', 'Owner'])) || 'field';
    var evidenceRequired = clean(firstValue(row, ['Evidence Required', 'Evidence', 'Photo Required', 'Proof Required']));
    var validationRule = clean(firstValue(row, ['Validation Rule', 'Rule', 'Gate', 'Acceptance Criteria'])) || 'REQUIRED';
    var status = normalizeStatus(firstValue(row, ['Status', 'Pass/Fail/N/A', 'Result', 'Pass Fail', 'PassFail', 'Pass/Fail', 'State']));
    var note = clean(firstValue(row, ['Notes', 'Comments', 'Remarks', 'N/A Reason', 'Reason']));
    var technician = clean(firstValue(row, ['Technician', 'Tech', 'Inspector', 'Signed Off By', 'SignedOffBy']));
    var references = Array.isArray(refsByStep[id]) ? refsByStep[id].slice() : [];
    var inlineUrl = firstValue(row, ['Reference URL', 'File URL', 'Document URL', 'Link', 'Hyperlink', 'Open File', 'File']);
    var inlinePage = firstValue(row, ['Page', 'Page Number', 'Sheet', 'Drawing Page']);
    var inlineSection = firstValue(row, ['Section Reference', 'Spec Section', 'Paragraph', 'Locator']);

    if (inlineUrl || firstValue(row, ['Reference Name', 'Document Name']) || inlinePage || inlineSection) {
      references.push(normalizeReference({
        name: firstValue(row, ['Reference Name', 'Document Reference', 'Reference', 'Source', 'Document Name']) || source || 'Reference',
        type: firstValue(row, ['Reference Type', 'Document Type', 'Type']) || 'Inline Reference',
        url: inlineUrl,
        page: inlinePage,
        section: inlineSection,
        notes: 'Inline reference from CCS_Steps'
      }));
    }

    var step = {
      id: id,
      section: section,
      title: section && task.indexOf(section + ' — ') !== 0 ? section + ' — ' + task : task,
      task: task,
      description: description,
      source: source,
      required: requiredValue === '' ? true : truthy(requiredValue),
      role: role,
      evidenceRequired: evidenceRequired,
      validationRule: validationRule,
      references: references,
      status: status,
      note: note,
      updatedAt: status ? nowISO() : '',
      updatedBy: status ? (technician || 'import') : '',
      manuallyAdded: false,
      order: Number(order) || idx + 1,
      importSource: 'NEXUS_CCS_EXCEL_IMPORTER'
    };

    step.aiCheck = buildAiPrecheck(step, 'Excel import. Automatic Vanguard validation queued.');
    return step;
  }

  function rowsToSteps(stepRows, refsByStep) {
    return (stepRows || [])
      .filter(function (row) {
        return Object.keys(row || {}).some(function (key) { return clean(row[key]) !== ''; });
      })
      .map(function (row, idx) { return normalizeStep(row, idx, refsByStep || {}); })
      .filter(function (step) { return clean(step.title) !== ''; })
      .sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
  }

  function buildPrecheckSummary(steps) {
    var summary = {
      status: 'PASS',
      total: steps.length,
      blocked: 0,
      review: 0,
      missingReference: 0,
      missingSource: 0,
      naWithoutReason: 0,
      failImported: 0,
      issues: [],
      warnings: [],
      checkedAt: nowISO(),
      checkedBy: 'NEXUS_CCS_EXCEL_IMPORTER'
    };

    (steps || []).forEach(function (step, idx) {
      var ai = step.aiCheck || {};
      var status = clean(ai.status).toUpperCase();
      if (status === 'BLOCKED') summary.blocked += 1;
      if (status === 'REVIEW') summary.review += 1;
      if (!ai.checks || !ai.checks.hasReference) summary.missingReference += 1;
      if (!ai.checks || !ai.checks.hasSource) summary.missingSource += 1;
      if (step.status === 'NA' && !clean(step.note)) summary.naWithoutReason += 1;
      if (step.status === 'FAIL') summary.failImported += 1;

      (Array.isArray(ai.issues) ? ai.issues : []).forEach(function (issue) {
        summary.issues.push({ row: idx + 1, step: step.id, title: step.title, issue: issue });
      });
      (Array.isArray(ai.warnings) ? ai.warnings : []).forEach(function (warning) {
        summary.warnings.push({ row: idx + 1, step: step.id, title: step.title, warning: warning });
      });
    });

    if (summary.blocked) summary.status = 'BLOCKED';
    else if (summary.review || summary.warnings.length) summary.status = 'REVIEW';
    return summary;
  }

  async function parseFile(file) {
    if (!file) throw new Error('No file selected.');
    if (!window.XLSX) throw new Error('XLSX parser is not loaded.');

    var data = await file.arrayBuffer();
    var workbook = window.XLSX.read(data, { type: 'array', cellDates: true });
    var stepsSheetName = findSheetName(workbook, STEP_SHEET_CANDIDATES, 0);
    var refsSheetName = findSheetName(workbook, REF_SHEET_CANDIDATES, 1);

    if (!stepsSheetName || !workbook.Sheets[stepsSheetName]) {
      throw new Error('No usable steps sheet found. Use a first tab named CCS_Steps.');
    }

    var stepRows = window.XLSX.utils.sheet_to_json(workbook.Sheets[stepsSheetName], { defval: '' });
    var refRows = refsSheetName && workbook.Sheets[refsSheetName]
      ? window.XLSX.utils.sheet_to_json(workbook.Sheets[refsSheetName], { defval: '' })
      : [];
    var refsByStep = rowsToRefsByStep(refRows);
    var steps = rowsToSteps(stepRows, refsByStep);
    var referenceCount = steps.reduce(function (sum, step) {
      return sum + (Array.isArray(step.references) ? step.references.length : 0);
    }, 0);
    var precheck = buildPrecheckSummary(steps);

    return {
      fileName: file.name || 'Imported CCS workbook',
      stepsSheet: stepsSheetName,
      referencesSheet: refsSheetName || '',
      stepCount: steps.length,
      referenceCount: referenceCount,
      importedAt: nowISO(),
      steps: steps,
      precheck: precheck,
      source: 'NEXUS_CCS_EXCEL_IMPORTER',
      workbookSheets: workbook.SheetNames ? workbook.SheetNames.slice() : []
    };
  }

  function fromWorkbook(workbook, options) {
    options = options || {};
    if (!workbook || !workbook.Sheets) throw new Error('No workbook supplied.');

    var stepsSheetName = findSheetName(workbook, STEP_SHEET_CANDIDATES, 0);
    var refsSheetName = findSheetName(workbook, REF_SHEET_CANDIDATES, 1);

    if (!stepsSheetName || !workbook.Sheets[stepsSheetName]) {
      throw new Error('No usable steps sheet found. Use a first tab named CCS_Steps.');
    }

    var stepRows = window.XLSX.utils.sheet_to_json(workbook.Sheets[stepsSheetName], { defval: '' });
    var refRows = refsSheetName && workbook.Sheets[refsSheetName]
      ? window.XLSX.utils.sheet_to_json(workbook.Sheets[refsSheetName], { defval: '' })
      : [];
    var refsByStep = rowsToRefsByStep(refRows);
    var steps = rowsToSteps(stepRows, refsByStep);
    var referenceCount = steps.reduce(function (sum, step) {
      return sum + (Array.isArray(step.references) ? step.references.length : 0);
    }, 0);
    var precheck = buildPrecheckSummary(steps);

    return {
      fileName: options.fileName || 'Imported CCS workbook',
      stepsSheet: stepsSheetName,
      referencesSheet: refsSheetName || '',
      stepCount: steps.length,
      referenceCount: referenceCount,
      importedAt: nowISO(),
      steps: steps,
      precheck: precheck,
      source: 'NEXUS_CCS_EXCEL_IMPORTER',
      workbookSheets: workbook.SheetNames ? workbook.SheetNames.slice() : []
    };
  }

  function buildTemplateWorkbook() {
    if (!window.XLSX) throw new Error('XLSX parser is not loaded.');

    var stepsRows = [
      STEP_HEADERS,
      ['CCS-001', 'RIF', '1', 'Receipt inspection complete', 'Equipment received, identified, and inspected.', 'YES', 'Tech', 'RIF completed', 'Step must be PASS, REVIEW, or documented N/A', 'Receipt Inspection Form', 'Receipt Inspection Form', 'RIF.html', 'Default starter row', 1],
      ['CCS-002', 'PHENOLIC', '2', 'Phenolic labeling complete', 'Labels match equipment ID, fed-from, feeds, and color code.', 'YES', 'Tech', 'Photo or visual verification', 'Step must be PASS, REVIEW, or documented N/A', 'Equipment setup / labeling rules', 'Phenolic Display', 'phenolic_display.html', '', 2],
      ['CCS-003', 'TORQUE', '3', 'Torque application complete', 'Torque proof exists and matches approved requirements.', 'YES', 'Foreman', 'Torque log complete', 'Requires foreman verification and approved numeric requirements', 'Torque Log', 'Torque Log', 'torque_log.html', '', 3],
      ['CCS-004', 'L2', '4', 'L2 installation verification complete', 'L2 verification is complete and exceptions are handled.', 'YES', 'Tech', 'L2 complete', 'Open exceptions require REVIEW notes', 'L2 Verification', 'L2 Verification', 'l2_no_procore.html', '', 4],
      ['CCS-005', 'MEG', '5', 'Megohmmeter testing complete', 'Line/load meg testing is complete and readings meet threshold.', 'YES', 'Tech', 'Meg log complete', 'Line and load must be confirmed against approved requirement', 'Meg Log', 'Meg Log', 'meg_log.html', '', 5],
      ['CCS-006', 'PREFOD', '6', 'Pre-FOD inspection complete', 'Foreign object and debris inspection is complete.', 'YES', 'Tech', 'Pre-FOD complete', 'Step must be PASS, REVIEW, or documented N/A', 'Pre-FOD', 'Pre-FOD Inspection', 'prefod.html', '', 6],
      ['CCS-007', 'FPV', '7', 'Finished product verification photo complete', 'Final product photo proof exists.', 'YES', 'Tech', 'Final photo', 'Photo required', 'FPV Photo', 'FPV Photo', 'fpv_photo_capture.html', '', 7],
      ['CCS-008', 'FINAL_CCS', '8', 'Final CCS review', 'All construction-side checks are ready for final package review.', 'YES', 'Foreman', 'Final signoff', 'All required items must be PASS, REVIEW, or documented N/A', 'NEXUS Vanguard Final Gate', 'Package Readiness', 'package_readiness.html', '', 8]
    ];

    var refRows = [
      REF_HEADERS,
      ['CCS-001', 'Receipt Inspection Form', 'NEXUS Page', 'RIF.html', 'Opens RIF for this equipment.'],
      ['CCS-003', 'Torque Log', 'NEXUS Page', 'torque_log.html', 'Opens torque log for this equipment.'],
      ['CCS-005', 'Meg Log', 'NEXUS Page', 'meg_log.html', 'Opens megohmmeter log.']
    ];

    var wb = window.XLSX.utils.book_new();
    var wsSteps = window.XLSX.utils.aoa_to_sheet(stepsRows);
    var wsRefs = window.XLSX.utils.aoa_to_sheet(refRows);
    wsSteps['!cols'] = STEP_HEADERS.map(function (header) {
      return { wch: header.indexOf('Description') !== -1 || header.indexOf('Notes') !== -1 ? 34 : 20 };
    });
    wsRefs['!cols'] = REF_HEADERS.map(function () { return { wch: 24 }; });

    window.XLSX.utils.book_append_sheet(wb, wsSteps, 'CCS_Steps');
    window.XLSX.utils.book_append_sheet(wb, wsRefs, 'Step_References');
    return wb;
  }

  function downloadTemplate(filename) {
    if (!window.XLSX) throw new Error('XLSX parser is not loaded.');
    var wb = buildTemplateWorkbook();
    window.XLSX.writeFile(wb, filename || 'NEXUS_CCS_Template.xlsx');
    return true;
  }

  var api = {
    __installed: true,
    version: VERSION,
    STEP_HEADERS: STEP_HEADERS.slice(),
    REF_HEADERS: REF_HEADERS.slice(),
    normalizeStatus: normalizeStatus,
    normalizeReference: normalizeReference,
    normalizeStep: normalizeStep,
    rowsToSteps: rowsToSteps,
    rowsToRefsByStep: rowsToRefsByStep,
    buildPrecheckSummary: buildPrecheckSummary,
    parseFile: parseFile,
    fromWorkbook: fromWorkbook,
    buildTemplateWorkbook: buildTemplateWorkbook,
    downloadTemplate: downloadTemplate
  };

  window.NEXUS_CCS_EXCEL_IMPORTER = api;
  window.CCSExcelImporter = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.CCSExcelImporter = api;
})();
