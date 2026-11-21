# Canary Project-Scoped Production Receipt

Date: 2026-08-04

## Artifact identity

- Producer repository: CodexGameAssetWorkbench
- Producer branch: `codex/runtime-bundle-rights-gate-v1`
- Producer commit: `5d33ba89f141303072e2bc782c8f54302c6fd572`
- Pack: `lowpass-readability-canary-v1`
- GLB SHA-256: `54b10bf450971139a9cfe8302f671d29bc37fda6f2631dbf5545ef69e1b4d102`
- Manifest SHA-256: `9b2e9b87805456f72ca66fd0e4915bff1b23c1c4f4f4c6e7052fdfb4c8ee9f05`
- Rights: `LicenseRef-LOWPASS-Project-Owned-Procedural-Canary-v1`

## Local verification

- `npm run typecheck`: PASS
- `npm test`: 34 files / 203 tests PASS
- `npm run build`: PASS, 79 modules
- `npm run build:external`: PASS
- External bundle readback: exact GLB present, project-scoped `DECLARED` rights present, distribution approved for LOWPASS game builds
- `git diff --check`: PASS

## External-mode browser receipt

Opened the Vite runtime in `external` mode with `asset-mode=canary-v1`, applied the 28U QA loadout, and deployed a watchful mission.

Observed:

- asset selector: `canary-v1 · LOWPASS APPROVED`
- active pack: `CANARY-V1`
- runtime hash prefix: `54b10bf45097`
- GLB load completed without primitive fallback
- mission scene, five-role visual adapters, HUD, and Security Cell remained operational
- visual geometry remained a projection of simulation state

## Boundary

This receipt establishes local technical consumption and the owner-approved LOWPASS project scope. It does not establish standalone asset redistribution, general third-party reuse, independent human readability scoring, PR/main integration, release, deployment, or publication.
