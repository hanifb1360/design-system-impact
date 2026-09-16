# v0.1.0 release checklist

This checklist prepares the first public release without making publication implicit or automatic.

## Automated gate

Run on Node.js 20 or newer:

```sh
npm ci
npm run release:check
```

The gate runs strict typechecking, linting, build, behavior tests, compiled CLI tests, JSON Schema compatibility, packed-package smoke tests, a production dependency audit, and `npm pack --dry-run`.

## Repository prerequisites

- `main` CI is green at the intended release commit.
- The GitHub `npm` environment exists and has a required reviewer.
- The npm package name is still available.
- npm trusted publishing names repository `hanifb1360/design-system-impact` and workflow `publish.yml`.
- No long-lived npm token is stored in repository or environment secrets.

## Release review

- Confirm `package.json` version and `CHANGELOG.md` both say `0.1.0`.
- Confirm README capability and limitation claims match the dogfood repository.
- Review the exact `npm pack --dry-run` file list.
- Install the tarball in a temporary project and run the CLI and programmatic API smoke test.
- Confirm all serialized paths are relative and slash-normalized.
- Confirm JSON output contains no logs or ANSI sequences.
- Confirm no fixture, source repository, secret, or local artifact is packaged.
- Confirm production dependency audit reports zero vulnerabilities.

## Tag and publish

Only after explicit release approval:

1. Change the changelog heading from `Unreleased` to the release date and commit it.
2. Create and push the signed `v0.1.0` tag at the reviewed commit.
3. Manually run **Publish to npm** with `tag` set to `v0.1.0`.
4. Approve the protected `npm` environment deployment.
5. Verify npm provenance, package contents, executable aliases, and README rendering.
6. Create GitHub release notes from `docs/v0.1.0-release-notes.md`.

The workflow validates that the selected tag exactly matches the package version. It never publishes from an untagged branch.
