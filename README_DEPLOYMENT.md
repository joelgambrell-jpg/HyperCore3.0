# HyperCore / NEXUS Vanguard — Release Candidate Deployment Notes

## Release Candidate

**Version:** RC-2026-05-20  
**Primary entry page:** `index.html`  
**Recommended GitHub branch:** `release/hypercore-vanguard-rc-2026-05-20`

This package is a release-candidate build for branch testing before merge to `main`.

## Deployment Method

1. Create a new branch from the current working repository.
2. Extract this ZIP locally.
3. Copy the extracted files into the repository root.
4. Do not overwrite production Firebase settings unless intentionally deploying to that Firebase project.
5. Commit to the release branch.
6. Test in browser before merging into `main`.

## Startup Path

Start here:

```text
index.html
```

Expected field/operator flow:

```text
Setup / Equipment Intake
→ Equipment Page
→ CCS Import
→ Torque
→ Meg
→ L2 / Pre-FOD / FPV
→ Package Export
```

Expected office/customer-facing flow:

```text
Vanguard Control Center
→ AI Fill / Document Intake
→ Requirement Review Gate
→ Approved Rules Enforcement
→ Package Export Traceability
```

## Vanguard Architecture Included

This release candidate includes:

- VanguardCore platform engine
- Centralized state/evidence layer
- CCS Vanguard bridge
- Torque evidence registration
- Meg evidence registration
- Package Export as read-only evidence consumer
- Real AI Fill client/backend flow with browser fallback
- Requirement Review + Approval Gate
- Approved Rules Enforcement
- Deployment cleanup and consolidation pass

## Field UX Rule

Field pages should remain simple:

```text
Ready / Missing / Blocked / Complete
```

Field users should not see unnecessary AI complexity. Engineering and review complexity belongs in office-facing pages.

## Known Deferred Work

These items are intentionally not completed in this release candidate:

- Firebase config/privacy hardening
- Full production authentication/authorization hardening
- Live cloud deployment verification
- Customer-specific branding/legal review
- Full offline replacement for CDN-based Excel parsing

## Pre-Merge Checklist

Before merging to `main`, manually test:

- `index.html` loads cleanly
- Create/open one equipment record
- Equipment page shows workflow cards/buttons
- CCS Import opens and saves checklist evidence
- Torque page saves rows and registers evidence
- Meg page saves results and registers evidence
- Requirement Review page can approve/publish rules
- Package Export reads evidence without creating completion state
- Mobile/iPad layout remains usable
- Firebase behavior is intentional for the target environment

## Important

Package Export should consume workflow completion/evidence. It should not silently create completion state.
