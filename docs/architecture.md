# Architecture decision record: deterministic impact pipeline

## Context and decision

Design-system upgrades need inspectable evidence that can survive CI, review, and later automation. The package therefore uses five immutable stages: source → snapshot → semantic diff → consumer impacts → migration manifest. Each machine artifact is independently serializable and schema-versioned. CLI handlers only coordinate exported library functions.

The TypeScript compiler API provides syntax, module exports, symbols, type resolution, JSDoc, and JSX parsing without recreating TypeScript's type system. It is the only runtime dependency. Source files and JSON are parsed, never imported or executed. Token support begins with nested JSON/DTCG values and CSS custom properties.

## Semantic model

Changes are discriminated by category and change type and receive stable, content-addressable subject IDs such as `component.Button.prop.tone.removed`. Severity describes compatibility, not lint priority. Source observations always carry `evidence: "observed"`. Rename inference is not implemented: an addition next to a removal is not proof of identity.

Migration hints are separate author guidance. A planner may combine an observed removal, an exact consumer literal, and a complete author mapping into a high-confidence automatic task. Missing value mappings result in review work. This preserves a future slot for explicitly labeled heuristic hypotheses without conflating them with facts.

## React and consumers

Public entry exports are resolved through the compiler checker. Explicit `package.json` subpaths are inspected as additional public entry points, including declaration targets inside otherwise ignored build directories. Callable exports with a first parameter are initially treated as component candidates and their prop symbols become contracts. Consumer scanning builds a per-file named-import map for the package root and subpaths, then walks JSX AST nodes. Token lookup is textual because CSS custom-property references and JSON token identifiers are not TypeScript syntax; results identify their confidence.

Traversal is sorted, bounded to configured consumer roots, and excludes dependencies and common generated directories. Serialized paths are repository-relative POSIX paths. Parsing is performed once per stage; a future analysis session/cache can share programs across stages without changing public schemas.

## Ownership and reporting

Ownership is an isolated `OwnershipResolver`; CODEOWNERS is the first adapter. Nearest package metadata supplies workspace names. JSON, terminal, and Markdown reporters consume public artifacts and never perform analysis. stdout is reserved for requested output; stderr is reserved for failures.

## Relationship to Design System Guard

Design System Guard enforces usage policy and already demonstrates CI-friendly human/SARIF reporting. Impact shares the deterministic, local-first philosophy and stable diagnostics, but has no runtime coupling. A future shared vocabulary package or SARIF convention can be introduced only when both schemas are mature enough to avoid synchronized releases.

## Extension points

Future work can add richer component recognizers, module/data-flow analysis, GitLab ownership, DTCG 2025.10 validation, package-export subpaths, SARIF, incremental caches, and codemod emitters behind the current stages. Codemod execution remains separate from planning.
