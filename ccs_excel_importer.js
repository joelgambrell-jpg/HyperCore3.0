/*
  assets/js/ccs_excel_importer.js
  NEXUS CCS Excel Importer

  Purpose:
  - Parses drag/drop CCS Excel templates into normalized checklist steps.
  - Supports a simple single-tab template and the existing two-tab template.
  - Generates a downloadable Excel template in the browser when XLSX is loaded.
  - Additive only; does not replace page rendering or existing save logic.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_CCS_EXCEL_IMPORTER && window.NEXUS_CCS_EXCEL_IMPORTER.__installed) return;

  var VERSION = '0.2.0-vanguard-ccs-importer';

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
    return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'required' || v === 'x';
  }

  function normalizeStatus(raw) {
    var statusRaw = clean(raw).toUpperCase();
    if (['PASS', 'PASSED', 'P', 'YES', 'Y', 'GO', 'TRUE', 'COMPLETE', 'COMPLETED'].indexOf(statusRaw) !== -1) return 'PASS';
    if (['FAIL', 'FAILED', 'F', 'NO', 'N', 'FALSE', 'NG'].indexOf(statusRaw) !== -1) return 'FAIL';
    if (['REVIEW', 'REV', 'PENDING', 'HOLD', 'NA', 'N/A'].indexOf(statusRaw) !== -1) return 'REVIEW';
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
    return {
      name: clean(ref.name || ref.referenceName || ref['Reference Name'] || ref.Name || 'Reference'),
      type: clean(ref.type || ref.referenceType || ref['Reference Type'] || ref.Type || ''),
      url: clean(ref.url || ref.referenceUrl || ref['Reference URL'] || ref.link || ref.Link || ref.File || ''),
      notes: clean(ref.notes || ref.Notes || ref.Description || ref.Comments || '')
    };
  }

  function rowsToRefsByStep(refRows) {
    var refsByStep = {};

    (refRows || []).forEach(function (row, idx) {
      var stepId = clean(firstValue(row, ['Step ID', 'Step', 'Step Number', 'Step #', 'ID', 'Item', 'No', 'No.']));
      if (!stepId) return;

      var ref = normalizeReference({
        name: firstValue(row, ['Reference Name', 'Name', 'Document Name', 'File Name', 'Title']) || ('Reference ' + (idx + 1)),
        type: firstValue(row, ['Reference Type', 'Type', 'Document Type', 'File Type']),
        url: firstValue(row, ['Reference URL', 'File URL', 'Document URL', 'Link', 'Hyperlink', 'Open File', 'File']),
        notes: firstValue(row, ['Notes', 'Description', 'Comments', 'Remarks'])
      });

      if (!refsByStep[stepId]) refsByStep[stepId] = [];
      refsByStep[stepId].push(ref);
    });

    return refsByStep;
  }

  function buildAiPrecheck(step, reason) {
    var refs = Array.isArray(step.references) ? step.references : [];
    var hasReference = refs.some(function (r) { return clean((r && r.url) || '') || clean((r && r.name) || ''); });
    var issues = [];

    if (!clean(step.title)) issues.push('Missing task/title.');
    if (!clean(step.description)) issues.push('Missing field instruction/description.');
    if (!clean(step.source)) issues.push('Missing source/requirement.');
    if (!hasReference) issues.push('No linked reference document/page.');

    return {
      required: true,
      autoChecked: true,
      status: issues.length ? 'REVIEW' : 'PENDING',
      reason: clean(reason || 'Excel import precheck complete.'),
      message: issues.length ? issues.join(' ') : 'Step has source and reference data. Ready for Vanguard validation.',
      issues: issues,
      checks: {
        hasTitle: !!clean(step.title),
        hasDescription: !!clean(step.description),
        hasSource: !!clean(step.source),
        hasReference: hasReference,
        referenceCount: refs.length
      },
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
    var validationRule = clean(firstValue(row, ['Validation Rule', 'Rule', 'Gate', 'Acceptance Criteria']));
    var status = normalizeStatus(firstValue(row, ['Status', 'Pass/Fail/N/A', 'Result', 'Pass Fail', 'PassFail', 'Pass/Fail']));
    var note = clean(firstValue(row, ['Notes', 'Comments', 'Remarks']));
    var technician = clean(firstValue(row, ['Technician', 'Tech', 'Inspector', 'Signed Off By', 'SignedOffBy']));
    var references = Array.isArray(refsByStep[id]) ? refsByStep[id].slice() : [];
    var inlineUrl = firstValue(row, ['Reference URL', 'File URL', 'Document URL', 'Link', 'Hyperlink', 'Open File', 'File']);

    if (inlineUrl || firstValue(row, ['Reference Name', 'Document Name'])) {
      references.push(normalizeReference({
        name: firstValue(row, ['Reference Name', 'Document Reference', 'Reference', 'Source', 'Document Name']) || 'Reference',
        type: firstValue(row, ['Reference Type', 'Document Type', 'Type']) || 'Inline Reference',
        url: inlineUrl,
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

    return {
      fileName: file.name || 'Imported CCS workbook',
      stepsSheet: stepsSheetName,
      referencesSheet: refsSheetName || '',
      stepCount: steps.length,
      referenceCount: referenceCount,
      importedAt: nowISO(),
      steps: steps,
      workbookSheets: workbook.SheetNames ? workbook.SheetNames.slice() : []
    };
  }

  function buildTemplateWorkbook() {
    if (!window.XLSX) throw new Error('XLSX parser is not loaded.');

    var stepsRows = [
      STEP_HEADERS,
      ['CCS-001', 'RIF', '1', 'Receipt inspection complete', 'Equipment received, identified, and inspected.', 'YES', 'Tech', 'RIF completed', 'Step must be PASS or REVIEW', 'Receipt Inspection Form', 'Receipt Inspection Form', 'RIF.html', 'Default starter row', 1],
      ['CCS-002', 'PHENOLIC', '2', 'Phenolic labeling complete', 'Labels match equipment ID, fed-from, feeds, and color code.', 'YES', 'Tech', 'Photo or visual verification', 'Step must be PASS or REVIEW', 'Equipment setup / labeling rules', 'Phenolic Display', 'phenolic_display.html', '', 2],
      ['CCS-003', 'TORQUE', '3', 'Torque application complete', 'Torque proof exists and matches approved requirements.', 'YES', 'Foreman', 'Torque log complete', 'Requires foreman verification', 'Torque Log', 'Torque Log', 'torque_log.html', '', 3],
      ['CCS-004', 'L2', '4', 'L2 installation verification complete', 'L2 verification is complete and exceptions are handled.', 'YES', 'Tech', 'L2 complete', 'Open exceptions require REVIEW notes', 'L2 Verification', 'L2 Verification', 'l2_no_procore.html', '', 4],
      ['CCS-005', 'MEG', '5', 'Megohmmeter testing complete', 'Line/load meg testing is complete and readings meet threshold.', 'YES', 'Tech', 'Meg log complete', 'Line and load must be confirmed', 'Meg Log', 'Meg Log', 'meg_log.html', '', 5],
      ['CCS-006', 'PREFOD', '6', 'Pre-FOD inspection complete', 'Foreign object and debris inspection is complete.', 'YES', 'Tech', 'Pre-FOD complete', 'Step must be PASS or REVIEW', 'Pre-FOD', 'Pre-FOD Inspection', 'prefod.html', '', 6],
      ['CCS-007', 'FPV', '7', 'Finished product verification photo complete', 'Final product photo proof exists.', 'YES', 'Tech', 'Final photo', 'Photo required', 'FPV Photo', 'FPV Photo', 'fpv_photo_capture.html', '', 7],
      ['CCS-008', 'FINAL_CCS', '8', 'Final CCS review', 'All construction-side checks are ready for final package review.', 'YES', 'Foreman', 'Final signoff', 'All required items must be PASS or REVIEW', 'NEXUS Vanguard Final Gate', 'Package Readiness', 'package_readiness.html', '', 8]
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
    normalizeStep: normalizeStep,
    rowsToSteps: rowsToSteps,
    rowsToRefsByStep: rowsToRefsByStep,
    parseFile: parseFile,
    buildTemplateWorkbook: buildTemplateWorkbook,
    downloadTemplate: downloadTemplate
  };

  window.NEXUS_CCS_EXCEL_IMPORTER = api;
  window.CCSExcelImporter = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.CCSExcelImporter = api;
})();
