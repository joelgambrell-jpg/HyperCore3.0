# NEXUS / Vanguard Update Notes

## Current stabilization changes

- Kept the legacy root paths working:
  - `nexus-core.css`
  - `nexus-core.js`
  - `nexus-firebase-bridge.js`

- Kept the newer asset-folder paths working:
  - `assets/css/nexus-core.css`
  - `assets/js/nexus-core.js`
  - `assets/js/nexus-firebase-bridge.js`

- Fixed the moved CSS background path:
  - Root CSS uses `transformer.jpg`
  - Asset CSS uses `../../transformer.jpg`

- Updated `assets/js/vanguard_loader.js` so it no longer loads every Vanguard panel by default.
  - Default mode is now `minimal`.
  - This prevents the dark dashboard/control-panel UI from taking over normal field pages.

## Vanguard loader modes

Normal field pages:

```html
<script src="assets/js/vanguard_loader.js"></script>
```

CCS import page when ready:

```html
<script src="assets/js/vanguard_loader.js" data-vanguard-mode="ccs"></script>
```

Package export page when ready:

```html
<script src="assets/js/vanguard_loader.js" data-vanguard-mode="export"></script>
```

Dashboard/control center page:

```html
<script src="assets/js/vanguard_loader.js" data-vanguard-mode="dashboard"></script>
```

Full testing only:

```html
<script src="assets/js/vanguard_loader.js" data-vanguard-mode="full"></script>
```

Test harness only:

```html
<script src="assets/js/vanguard_loader.js" data-vanguard-mode="test"></script>
```

## Intentional decision

The old CCS variant pages are not repaired in this pass because the active plan is to replace them with an Excel drag/drop CCS import workflow using `construction_check_sheet_import.html` as the canonical CCS engine.

## 2026-05-19 CCS Excel Import Build

Added functional CCS Excel drag/drop foundation without rewriting legacy CCS variants.

Changed/added:
- `assets/js/ccs_excel_importer.js`
- `assets/js/ccs_template_renderer.js`
- `templates/NEXUS_CCS_Template.xlsx`
- `construction_check_sheet_import.html`
- `assets/js/vanguard_loader.js`

Behavior:
- `construction_check_sheet_import.html` now loads the dedicated CCS Excel importer and renderer helpers.
- Added a `Download Excel Template` button.
- Excel imports now prefer the shared importer module and fall back to the original inline parser if needed.
- Imported rows are normalized into CCS/Vanguard-compatible step objects.
- Imported steps are pushed into Vanguard CCS items when Vanguard core is available.
- Existing localStorage/Firebase save behavior remains in place.

Verified:
- Full JavaScript syntax check passes across all `.js` files.
- Inline JavaScript in `construction_check_sheet_import.html` passes syntax check.
- Local HTML path scan reports no real missing local references from the updated page set.
- Template workbook created with `CCS_Steps` and `Step_References` tabs.

## CCS Firebase Sync Build
- Added `assets/js/ccs_firebase_sync.js`.
- Wired `construction_check_sheet_import.html` to use the centralized CCS sync module.
- CCS now saves local cache, Vanguard export payload, validation payload, package status, Firebase/LiveSync payloads, and offline queue fallback through one bridge.
- Remote hydration is defensive and only applies newer CCS data.


## CCS Approval Layer Build
- Added `assets/js/ccs_approval_engine.js`.
- Added CCS lifecycle states: DRAFT, IMPORTED, REVIEW_REQUIRED, APPROVED, ACTIVE, LOCKED.
- Wired approval panel into `construction_check_sheet_import.html`.
- Wired approval readout into `package_export.html`.
- Approval metadata now mirrors into `nexus_<eq>_ccs_vanguard_export` and package status.
- Foreman+ can approve/activate/lock; Superintendent+ can reopen locked templates.


## CCS Vanguard Rule Mapping Build
- Added `assets/js/ccs_vanguard_rule_engine.js`.
- Added simple field states for imported CCS rows: GOOD, CHECK, STOP.
- Mapped Excel `Validation Rule` values into Vanguard validation states.
- Supported rules: REQUIRED, PHOTO_REQUIRED, FOREMAN_APPROVAL, TORQUE_COMPLETE, MEG_COMPLETE, L2_COMPLETE, PREFOD_COMPLETE, FPV_COMPLETE, DOCUMENT_REFERENCE_REQUIRED.
- Updated CCS import page to show large readable validation boxes on each card.
- Updated package export to include a CCS Vanguard field validation summary.
- Kept legacy CCS behavior additive; no full-page rebuild.

## CCS Supervisor Review Layer
- Added `assets/js/ccs_supervisor_review_engine.js`.
- Added simple "Why? / Supervisor Review" drawer to imported CCS cards.
- Added Approve with Comment, Send Back / Fix, and Override actions.
- Added supervisor review history to each row and package export.
- Vanguard CCS rule evaluation now treats approved supervisor decisions/overrides as accepted gates.
- Preserved existing CCS import, save, final sign-off, Firebase sync, and package export behavior.

## CCS Evidence / Reference Attachment Build

Added additive evidence layer for imported CCS rows:

- `assets/js/ccs_evidence_engine.js`
  - Attach reference/document/photo/requirement/note evidence per CCS row.
  - Stores evidence in `step.evidenceRecords`.
  - Provides field-friendly evidence drawer.

Updated:

- `construction_check_sheet_import.html`
  - Loads evidence engine.
  - Adds Attach Evidence / References drawer to every CCS card.
  - Adds quick attach from current row source/reference.
  - Saves evidence with the CCS payload and Vanguard export payload.

- `assets/js/ccs_vanguard_rule_engine.js`
  - PHOTO_REQUIRED and DOCUMENT_REFERENCE_REQUIRED now read evidence records.

- `assets/js/ccs_template_renderer.js`
  - Includes evidence records in Vanguard item conversion.

- `assets/js/ccs_supervisor_review_engine.js`
  - Why drawer now shows attached evidence count.

- `assets/js/ccs_package_export_bridge.js`
  - Package export now shows evidence/reference details per CCS row.

- `assets/js/vanguard_loader.js`
  - CCS/export/test loader modes now include the evidence engine.


## Integration hardening pass
- Updated `assets/js/vanguard_core.js` so imported Excel CCS templates do not receive legacy default gate rows that create false STOP/BLOCKED states.
- Reordered `assets/js/vanguard_loader.js` groups so Vanguard core loads before CCS/export bridge modules.
- Added CCS package export bridge to loader export/test modes.
- Re-ran syntax, reference, loader, and runtime communication checks.
