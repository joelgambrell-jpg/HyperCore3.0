# Vanguard Consolidation Cleanup Audit

## Purpose
Clean up the approved-rules build before deployment so the platform does not drift into a legacy/new-engine nightmare.

Core mantra preserved:
- Field people get simple Ready / Missing / Blocked / Complete behavior.
- Office users get review/approval screens that avoid computer-science complexity.
- Customers get polished requirement/evidence/export traceability.

## Corrections made

### 1. Requirement review gate tightened
- Removed foreman/QCx approval from the engineer requirement review gate.
- Requirement approval is now limited to engineer/admin/superintendent/manager-style roles.
- Fixed duplicate `approvedRulesPublishedAt` assignment.

### 2. Real AI Fill now feeds Requirement Review
- Equipment setup AI document fill now writes extracted requirements into:
  - `nexus_<EQ>_vanguard_system.documents`
  - `nexus_<EQ>_vanguard_documents`
- Requirement Review can now see actual extracted requirements from setup instead of only seeing data if a separate core path happened to run.
- Added the Vanguard loader to setup pages so VanguardCore can sync when available while still preserving local-first behavior.

### 3. Package Export cleanup
- Removed duplicate `vanguard_loader.js` inclusion from `package_export.html`.
- Package Export remains a read-only consumer of workflow/evidence state.
- No completion state generation was added back into Package Export.

### 4. Control Center demo-data hardening
- Prevented the Control Center from falling back to fake TR/SWGR/UPS demo cards when no real documents are loaded.
- Empty states now say no real project data is loaded and direct the user to upload/project-map actual documents.
- No fake publish records are generated.

### 5. Styling/UX preservation
- No CSS files were changed.
- Major field-page button/input/select/textarea counts were preserved.
- Equipment, CCS, Torque, Meg, and Export layouts were not stripped down.

## Validation performed

### Static checks
- JavaScript syntax: PASS
- Inline HTML script syntax: PASS
- Local href/src reference check: PASS
- Duplicate script includes: PASS
- Backend syntax and smoke test: PASS

### Functional smoke tests
- VanguardCore loads and stores equipment state.
- Requirement Review approves and publishes an approved torque rule.
- Approved Rules Enforcement allows passing torque evidence.
- Approved Rules Enforcement blocks failing torque evidence.
- Backend requirement extraction smoke test returns requirements successfully.

## Known remaining deployment items
These were intentionally not changed in this pass:
- Firebase config/privacy hardening remains deferred per prior instruction.
- Full live browser click-through should still be performed after GitHub deployment because this environment cannot perform a true iPad/browser workflow test.
- CDN-based Excel parsing should be reviewed later if the site must run in restricted/offline project environments.

## Deployment status
This package is cleaner and safer than the prior approved-rules build. It is still a local-first field platform with backend-capable AI extraction, not a fully hardened enterprise cloud deployment.
