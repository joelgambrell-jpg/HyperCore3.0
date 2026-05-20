# Release Candidate Changelog — RC-2026-05-20

## Summary

This release candidate consolidates HyperCore / NEXUS Vanguard from a page-driven tool into a VanguardCore-driven workflow platform while preserving the field-user experience.

## Added

- `VERSION.txt`
- `README_DEPLOYMENT.md`
- `CHANGELOG_RELEASE_CANDIDATE.md`
- VanguardCore platform layer
- Requirement Review + Approval Gate
- Approved Rules Enforcement
- Real AI Fill intake path
- Package Export evidence traceability
- Deployment-readiness notes

## Consolidated

- Older build/update logs were moved to `docs/archive/`.
- Vanguard evidence and completion logic are now centralized through compatibility-safe platform hooks.
- Package Export is treated as a read-only consumer of workflow evidence.

## Preserved

- Existing field-page styling philosophy
- Large-button workflow UX
- CCS import flow
- Torque workflow
- Meg workflow
- Equipment page workflow cards
- Firebase config files, unchanged by request

## Removed / Neutralized

- Active mock AI Fill behavior
- Fake hardcoded publish behavior from Vanguard Control Center
- Duplicate Package Export loader behavior
- Demo-data invention paths that could contaminate real workflow records

## Verification Completed

- JavaScript syntax checks
- Inline HTML script syntax checks
- Local static reference scan
- Duplicate script review
- Mock/demo active-code scan
- Release documentation creation

## Known Deferred Items

- Firebase/privacy hardening
- Live browser click-through in production environment
- Final customer/legal branding review
- CDN/offline dependency decision for Excel import

## Release Candidate Final Fixes

- Added compatibility redirect page: `scan_qr.html` → `scan.html`
- Added compatibility redirect page: `submission_history.html` → `submit.html`
- Added energization support pages:
  - `energization_mop.html`
  - `energization_sop.html`
  - `energization_documents.html` → `supporting_docs.html`
- Moved historical build logs into `docs/archive/` so the repository root is cleaner while keeping the audit trail.
