# Agent Handoff — Implement Agent-Driven Development Workflow

## Metadata

- Issue: N/A (repository workflow initiative)
- Plan: `docs/plans/agent-driven-development-workflow.md`
- Plan document revision: 2
- Base branch: `dev`
- Working branch: N/A
- Current phase: plan revised; implementation not started
- Risk level: medium for control-plane documentation; high when write-capable automation is enabled
- Prepared by: Codex
- Prepared at: 2026-07-10

## Goal

Implement the revised TREK Agent-driven development workflow incrementally, beginning with repository policy and manual handoff controls and ending with a permission-isolated Issue-to-Draft-PR automation path.

## Acceptance Criteria

- Follow the phase ordering and task breakdown in the plan.
- Implement one focused task or PR at a time.
- Bind plan approval to an immutable plan commit SHA and content digest.
- Keep model and test processes separated from repository write credentials.
- Enforce approved scope before a generated patch is pushed.
- Reuse existing CI and preserve human merge and release authority.
- Record actual commands, results, changed files, decisions, and unresolved questions in the task handoff.

## Constraints

- Do not implement all proposed files merely to reproduce the target directory tree.
- Do not enable automated implementation before the minimum policy parser and scope guard are enforcing.
- Do not use a maintainer personal access token as the normal automation credential.
- Do not expose GitHub write credentials, model credentials, or release secrets to generated code or test processes.
- Do not replace the existing human PR template with the Agent PR body template.
- Do not modify branch protections, merge PRs, push to `main`, publish releases, or access production credentials.
- Treat Issue, PR, handoff artifact, and model output as untrusted until validated.
- The current plan and handoff files are untracked in the local worktree; do not assume they are already committed.

## Repo Facts

- The local Git remote is `git@github.com:JT-G3601/TREK.git`.
- `CONTRIBUTING.md` links project documentation and Discord associated with `mauriceboe/TREK`; the intended automation target repository is not yet confirmed.
- `CONTRIBUTING.md` requires Discord discussion before code or PR submission and requires branches to be up to date with `dev`.
- Existing PR CI includes `.github/workflows/test.yml` and `.github/workflows/lint-prettier.yml`, both targeting `dev` and `main` PRs with different path-filter behavior.
- Stable release behavior remains in `.github/workflows/docker.yml` and is triggered from `main`.
- No `.agents/`, `.claude/`, `AGENTS.md`, or `CLAUDE.md` implementation exists yet.
- Repository branch/ruleset configuration was not verified from local files.
- GitHub CLI is not installed in the current environment, so remote protection settings were not queried.

## Decisions

1. Use a hybrid architecture: keep TREK-specific workflows in this repository while designing provider and policy interfaces for possible later extraction.
2. Use `ai:admitted` as a verified maintainer admission signal. A Discord URL alone is not approval evidence.
3. Publish plans on `ai-plan/<issue>-<slug>` and bind approval to the plan commit SHA plus a deterministic digest through an App-owned approval record.
4. Create the implementation branch separately from the latest `dev` after plan approval.
5. Split automation into preflight, generate, verify, policy-check, and publish trust boundaries.
6. Keep the implementation provider and reviewer without repository write credentials. Give a short-lived write token only to deterministic controller or publisher jobs.
7. Move the minimum enforcing scope guard before Phase 4. Phase 6 hardens it but is not its first enforcement point.
8. Use a dedicated GitHub App for the target automated CI path. Permit `GITHUB_TOKEN` only as a documented pilot fallback with an explicit human CI-approval state.
9. Resolve concurrent and stale PR correctness through strict up-to-date checks or a merge queue, with a fail-closed freshness check as fallback.
10. Treat hooks as reusable logical validation points. Local Git hooks are optional convenience and never the server-side security boundary.

## Implementation Plan

- [ ] Confirm the target repository, upstream/fork relationship, admission policy, CI credential mode, and `dev` ruleset behavior.
- [ ] Add `AGENTS.md`, `CLAUDE.md`, `.agents/README.md`, policy draft, handoff template, Agent PR body template, and implementation-provider contract.
- [ ] Run and document at least two manual low-risk Claude-plan, Codex-implement, Claude-review walkthroughs.
- [ ] Add the Agent task issue form, label documentation, and deterministic issue validator.
- [ ] Implement triage and maintainer admission without an AI model.
- [ ] Implement and test handoff validation, approval validation, policy parsing, and the minimum enforcing scope guard.
- [ ] Add read-only planning, deterministic plan publication, and plan-revision approval binding.
- [ ] Configure the GitHub App or explicitly select the `GITHUB_TOKEN` pilot fallback.
- [ ] Add isolated implementation and Draft PR publication.
- [ ] Add independent review and human-authorized repair.
- [ ] Add state reconciliation, freshness checks, inactivity reminders, hardening, and runbooks.
- [ ] Evaluate reusable extraction only after several real low-risk issues complete the workflow.

## Changed Files

- `docs/plans/agent-driven-development-workflow.md` — revised architecture, authorization, plan binding, permission isolation, CI behavior, phased implementation, and verification strategy.
- `handoff/handoff-implement-agent-driven-development-workflow.md` — implementation handoff for the next Agent.

## Verification

| Command | Result | Notes |
|---|---|---|
| `rg -n '^#{1,4} ' docs/plans/agent-driven-development-workflow.md` | Passed | Reviewed heading order and section numbering. |
| `rg -n '[[:blank:]]+$' docs/plans/agent-driven-development-workflow.md handoff/handoff-implement-agent-driven-development-workflow.md handoff/handoff-review-agent-driven-development-workflow.md` | Passed | No trailing whitespace matches. `rg` exits 1 when no matches are found. |
| `awk '/^```/{count++} END{print FILENAME, count, count%2}' docs/plans/agent-driven-development-workflow.md` | Passed | Found 42 fence markers; parity is even. The implementation handoff contains no fenced blocks. |
| `git diff --check` | Passed | No whitespace errors in tracked diffs; the explicit `rg` check covers the currently untracked Markdown files. |

## Review Findings

- Incorporated the valid findings from `handoff/handoff-review-agent-driven-development-workflow.md` with revised severity and remediation.
- Added missing blockers for durable plan publication, approval binding, credential isolation, deterministic publishing, and CI triggering from automation-created PRs.
- Corrected the PR-template assumption and treated branch protection as remote configuration that still requires verification.

## Open Issues

1. Which repository is the actual automation target: `JT-G3601/TREK`, `mauriceboe/TREK`, or another repository?
2. Does verified `ai:admitted` supplement Discord approval, or does it replace Discord approval for Agent tasks after `CONTRIBUTING.md` is amended?
3. Will the first automated deployment install a dedicated GitHub App, or begin with the manual CI-approval fallback?
4. Does `dev` use strict required checks or a merge queue, and which exact check names are required?
5. What exact Codex runner, version, invocation interface, credential broker, network policy, and sandbox will implement the provider adapter?
6. Where will completed plan branches be archived or when may they be safely deleted?

## Next Steps

Start with implementation task 1 only. Record the human decisions above in a repository configuration document and `.agents/policy.yml` placeholders before scaffolding model-invoking workflows. Update this handoff or create an issue-specific handoff with actual decisions and verification; do not infer missing repository settings.
