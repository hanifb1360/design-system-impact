# Research notes

Research was performed before implementation in September 2026.

## Sibling package

The public `design-system-guard` package is an ESLint-based design-system policy validator. Its published material emphasizes local deterministic validation, CI use, human output, stable rule findings, and SARIF 2.1.0. Impact adopts the same local/CI posture and diagnostic-code discipline, but does not duplicate enforcement rules or depend on Guard.

## Existing ecosystem

- Microsoft API Extractor is mature at rollups and review of TypeScript package API surfaces. Its scope is broader package contracts and release review; it does not connect React prop/token evolution to consumer instances or agent migration tasks.
- `react-docgen-typescript` demonstrates compiler-checker-based React prop extraction. For this vertical slice, the TypeScript compiler API already supplies the required export, prop, union, and JSDoc information with fewer dependencies.
- `sigdiff` and related API-diff tools validate demand for structured compatibility changes. The distinct value here is design-system-specific subjects plus consumer reachability and migration evidence.
- DTCG standardizes portable JSON token exchange. The extractor accepts `$value` and aliases now while leaving full 2025.10 validation for a dedicated future adapter.
- Design-system codemod ecosystems, including Atlassian guidance and Tokens Studio tooling, reinforce that intended mappings should come from maintainers and that ambiguous cases require review.
- API Extractor, Changesets, and semantic-release solve adjacent release-management problems; none replaces the snapshot → consumer impact → constrained agent task pipeline.

## Dependency decision

Use `typescript` as the sole production dependency. Avoid API Extractor and react-docgen in v0.1 because their additional models are not needed for the proven slice. Reassess when declaration rollups, complex wrappers, or cross-package type resolution become requirements. Testing and lint dependencies do not ship at runtime.

## Package name

The working name is retained. Availability must be rechecked immediately before publication; nothing in this repository publishes automatically.
