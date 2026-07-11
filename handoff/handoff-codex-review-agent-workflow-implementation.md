# Agent Handoff — Codex Review: Agent Workflow Implementation

## Metadata

- Review date: 2026-07-11
- Reviewer: Codex
- Repository: `JT-G3601/TREK`
- Base branch: `dev`
- Reviewed working branch: `ai/walkthrough-2-handoff-gitignore`
- Review result: Changes requested
- Human authorization: godot explicitly requested that the review be recorded and the protected control-plane files be repaired in review order

## Scope

Independent review of the implementation reported complete in `status.md`, covering the Agent Task issue form, deterministic validators, planning and approval workflows, implementation publisher, independent review and repair workflows, GitHub App setup, state reconciliation, and operational documentation.

## Findings

### F1 — P0 — Issue triage cannot produce valid validator input

The quoted heredoc in `ai-issue-triage.yml` preserves `${ISSUE_TITLE_JSON}`, `${ISSUE_BODY_JSON}`, and `${ISSUE_LABELS_JSON}` literally. The validator therefore receives invalid JSON. Its non-zero invalid-result exit also prevents the result-parsing and `ai:needs-info` paths from running.

### F2 — P0 — Planning does not invoke a planner or publish the handoff

`ai-plan.yml` only prints placeholder messages. A new Issue has no candidate handoff to upload. The publisher creates/reset a branch but does not commit the validated handoff before setting `ai:plan-ready`.

### F3 — P0 — Approval is not bound to immutable plan content

The approval workflow does not fetch the handoff, recompute its digest, or call `validate-approval.mjs`. Because the plan branch has no plan commit, the check record is effectively attached to the `dev` SHA and does not bind approval to the reviewed plan content.

### F4 — P0 — Policy result cannot reach the publisher

The `policy-check` job does not expose a job output, while `publish` reads `needs.policy-check.outputs.valid`. The publish job is therefore skipped. The scope-failure handler is inside that same skipped job and is unreachable.

### F5 — P0 — Verification failures are discarded

Tests are piped through `tee` without `pipefail` and run with `continue-on-error`; lint and format explicitly use `|| true`; publish does not gate on their results. Failed verification can therefore be represented as successful or ignored.

### F6 — P0 — Implementation and independent review report placeholder success

The implementation provider produces an empty summary and patch. The review provider always writes an empty findings array, posts “No Findings,” and advances the Issue to `ai:ready-for-human`. Missing provider integration must fail closed instead of generating success evidence.

### F7 — P1 — Review triggering does not wait for CI

The review workflow listens to `check_suite` but dereferences `github.event.pull_request`, which is absent for that event. It also runs on PR open/synchronize without proving required CI completed successfully.

### F8 — P1 — Configured GitHub App identity is not used

Policy selects GitHub App mode, but publishing and approval use the workflow `GITHUB_TOKEN`. This contradicts the recorded credential model and may suppress downstream workflow triggers.

### F9 — P2 — Validator and status inconsistencies

The Issue validator accepts a completely missing Scope Acknowledgment section. The first walkthrough handoff fails validation because `Risk level` is missing. `status.md` simultaneously says Tasks 8–12 remain and marks Tasks 8–11 complete.

## Required Repair Order

1. Repair deterministic triage input and fail paths.
2. Make plan publication commit the validated handoff and bind digest to that exact revision.
3. Verify approval against the plan commit and digest before implementation.
4. Make generation, verification, scope checking, and publishing fail closed and propagate explicit job outputs.
5. Use the configured GitHub App token for repository mutations.
6. Trigger review only after authoritative CI success; never publish placeholder review success.
7. Repair authorization, reconciliation, validator edge cases, fixtures, and status documentation.

## Verification Expectations

- All workflow YAML parses successfully.
- Validator fixtures cover valid, invalid, missing-checkbox, approval mismatch, protected path, size limit, and rename/delete patch cases.
- Invalid Issue input reaches `ai:needs-info` rather than terminating before state handling.
- A plan branch contains the exact handoff blob whose digest is approved.
- Implementation cannot start without a valid App-owned approval record for that plan revision.
- Failed tests, lint, formatting, patch application, or scope checks prevent publication.
- Missing planner, implementation provider, or reviewer integration blocks the task and never produces success evidence.

## Review Decision

Do not enable these workflows for real Issues until every P0/P1 finding is repaired and an end-to-end dry run succeeds. Task completion claims must distinguish implemented deterministic infrastructure from external provider integrations that remain unavailable.

## Repair Record

Repairs were authorized by godot and applied locally on 2026-07-11 in the order
listed above.

| Finding | Local status | Evidence |
|---|---|---|
| F1 | Repaired | Safe Node serialization; validator result schema checked; invalid state handler remains reachable |
| F2 | Repaired | Claude structured output is deterministically rendered, validated, digested, and committed through the GitHub API |
| F3 | Repaired | Approval reloads the exact plan blob and creates an App-owned check with a machine-readable SHA/digest payload |
| F4 | Repaired | Scope guard exposes a job output; publisher and failure reporter consume it from separate jobs |
| F5 | Repaired | Tests, lint, and format preserve exit status and gate publishing |
| F6 | Repaired | Official Claude/Codex actions replace placeholder success; empty or malformed output fails closed |
| F7 | Repaired | Review uses `workflow_run`, verifies applicable CI for the same head SHA, and rejects stale findings |
| F8 | Repaired locally | All repository mutations use short-lived GitHub App tokens; external App installation remains required |
| F9 | Repaired | Missing scope fixture added, both walkthrough handoffs validate, status claims corrected |

### Verification

- `node .agents/scripts/test-workflow-contracts.mjs` — passed
- `actionlint` v1.7.12 over all workflows — passed with no findings
- YAML syntax parse for all Agent workflows and the Issue form — passed
- `git diff --check` — passed

### Remaining activation gate

The review remains **changes requested for activation**, not for the local code
repair. GitHub App creation, provider secrets, committed workflows, repository
ruleset verification, and one live low-risk end-to-end walkthrough are still
required before production use.
