# Approved Rules Enforcement Update

Package: HyperCore2.0_approved_rules_enforcement.zip

## Purpose
Engineer-approved requirements now become the only rules allowed to enforce field workflow. AI/document extractions remain office-side review data until approved and published.

## Added
- `assets/js/vanguard_approved_rules_enforcement.js`
  - Reads published/approved rules from the Requirement Review Gate.
  - Groups rules by workflow target: Torque, Meg, CCS, FPV, General.
  - Evaluates field evidence against approved requirements.
  - Writes enforcement results into VanguardCore validations/evidence.
  - Blocks completion when approved rules fail.
  - Provides simple field status: READY / BLOCKED / COMPLETE.
  - Provides export trace: approved rule -> evidence -> validation result.

## Wired
- `assets/js/vanguard_loader.js`
  - Loads Approved Rules Enforcement with the core Vanguard module set.

- `torque_log.html`
  - Adds approved-rule field gate panel.
  - Syncs torque rows against approved torque rules.
  - Clears torque completion if approved torque rule enforcement fails.

- `meg_log.html`
  - Adds approved-rule field gate panel.
  - Syncs meg readings against approved meg/insulation resistance rules.
  - Clears meg completion if approved meg rule enforcement fails.

- `construction_check_sheet_import.html`
  - Adds approved-rule field gate panel.
  - Syncs CCS checklist evidence against approved CCS/checklist rules.
  - Clears CCS completion if approved CCS rule enforcement fails.

- `package_export.html`
  - Adds approved-rule enforcement result traceability inside the Approved Requirement Traceability section.

## Preserved
- Existing field page styling and workflow layout.
- Existing torque, meg, and CCS data entry behavior.
- Existing Vanguard evidence registration.
- Existing Package Export layout.
- Firebase config/privacy unchanged.

## Mantra Alignment
- Engineers approve rules.
- Field users see simple READY / BLOCKED / COMPLETE status.
- Customers receive NASA-grade traceability in export output.

## Validation Performed
- JS syntax check passed for new enforcement module and loader.
- Inline HTML script syntax check passed across root HTML files.
- Smoke test verified:
  - Approved torque rule publishes.
  - Matching torque evidence completes.
  - Failing torque evidence blocks completion.
