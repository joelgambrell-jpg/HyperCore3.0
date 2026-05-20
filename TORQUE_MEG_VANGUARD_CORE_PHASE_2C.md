# Phase 2C — Torque + Meg VanguardCore Evidence Registration

## Build Target
Wire Torque and Meg into the VanguardCore platform layer without stripping or simplifying the original field-user pages.

## Files Updated
- `torque_log.html`
- `meg_log.html`

## Torque Updates
- Added `syncTorqueEvidenceToVanguardCore(payload)` bridge.
- Registers torque evidence snapshots through `Vanguard.registerEvidence("torque", ...)` when material torque state changes.
- Writes latest torque evidence summary through `Vanguard.setEvidence("torque", ...)`.
- Writes torque validation state through `Vanguard.setValidation("torque", ...)`.
- Syncs torque step completion through `Vanguard.setStepComplete("torque", ...)`.
- Corrected Vanguard torque completion sync to use the full existing page gate via `isTorquePageComplete()` instead of only checking primary torque and foreman state.
- Preserved existing torque UI, styling, Tilt checks, two-person signoff, foreman spot checks, localStorage mirrors, Firebase mirrors, and export payloads.

## Meg Updates
- Added `syncMegEvidenceToVanguardCore(overallComplete, lineComplete, loadComplete)` bridge.
- Registers meg evidence snapshots through `Vanguard.registerEvidence("meg", ...)` when material meg state changes.
- Writes latest meg evidence summary through `Vanguard.setEvidence("meg", ...)`.
- Writes meg validation state through `Vanguard.setValidation("meg", ...)`.
- Syncs meg step completion through `Vanguard.setStepComplete("meg", ...)`.
- Captures line/load/equipment row counts, verification gates, threshold, status, failures, and optional equipment sheet status.
- Preserved existing Meg UI, styling, line/load gates, optional equipment sheet behavior, localStorage mirrors, Firebase mirrors, and export payloads.

## Regression Checks Run
- `node --check assets/js/vanguard_core.js`
- Inline script syntax checks for:
  - `torque_log.html`
  - `meg_log.html`
  - `equipment.html`
  - `construction_check_sheet_import.html`
- Local `href/src` reference scan across HTML files.

## Results
- JavaScript syntax checks passed.
- Inline script checks passed.
- Missing local references: 0.
- CSS/styling files were not modified.
- Firebase config/privacy intentionally unchanged.

## Notes
This phase is additive. Torque and Meg still operate with their existing page-level logic, but now publish their evidence, validation, and completion state into the central VanguardCore engine for Equipment, Package Export, and later AI requirement enforcement to consume.
