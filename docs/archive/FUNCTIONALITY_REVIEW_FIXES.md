# HyperCore 2.0 Functionality Review Fixes

Applied after full functionality review. Firebase config/privacy was intentionally not changed.

## Fixed

1. Vanguard loader mode handling
   - `assets/js/vanguard_loader.js` is now mode-aware.
   - Supported modes: `minimal`, `core`, `ccs`, `export`, `dashboard`, `full`.
   - Loader mode can be set by `data-vanguard-mode`, query string, body attribute, or window variable.
   - `package_export.html` now loads Vanguard in `export` mode.
   - `vanguard_control_center.html` now loads Vanguard in `dashboard` mode.

2. CCS completion key normalization
   - Equipment, form gating, and Energization now read CCS completion from the active keys:
     - `nexus_<eq>_ccs_vanguard_export`
     - `nexus_<eq>_ccs_two_tab_v1`
     - `nexus_<eq>_ccs_excel`
     - `nexus_<eq>_construction_check_sheet`
   - Completion requires signed/complete status and zero issue rows.

3. Legacy CCS references removed
   - Replaced `construction_check_sheet.html` references with `construction_check_sheet_import.html` in:
     - `config.js`
     - `index.html`
     - `index_equipment_registry.html`

4. Package export completion writes tightened
   - Package import/mirror no longer marks RIF, L2, Meg, Torque, FPV, or Pre-FOD complete merely because data exists.
   - Imported package sections only mark steps complete when the section is explicitly verified/approved/complete/pass/ready.
   - CCS imported package data only marks complete when verified and issue count is zero.

5. Automated checks
   - All standalone JavaScript files passed `node --check`.
   - All inline HTML scripts passed syntax checks.
   - Local `href`/`src` references checked: no missing local files found.

## Not changed

- `firebase-config.js` was left untouched by request. This should be addressed after the system is functionally locked.
