# TREK Agent-Driven Development Workflow Plan

## Document Status

- Status: Draft for implementation
- Revision: 2 (review findings incorporated)
- Last revised: 2026-07-10
- Scope: GitHub Issue to PR-ready automation
- Target repository: TREK; the deployment repository identity must be confirmed in Phase 1
- Base branch: `dev`
- Production release branch: `main`
- Intended implementers: Codex, Claude Code, or other engineering agents
- Architecture diagram: `docs/plans/agent-workflow-architecture.md`
- Test guide: `docs/plans/agent-workflow-test-guide.md`

## 1. Purpose

This plan defines a recoverable, reviewable, and permission-bounded workflow for using Codex and Claude Code to turn an approved GitHub Issue into a pull request that is ready for human review.

The workflow follows this engineering loop:

```text
clear goal
  -> read-only exploration
  -> file-based handoff
  -> isolated implementation
  -> independent review
  -> test verification
  -> persisted state
  -> human merge and release gate
```

The first implementation must stop at a PR targeting `dev`. Agents must not merge changes, push to `main`, create release tags, or trigger production publication.

## 2. Current Repository Constraints

Implementers must preserve the following existing behavior:

- Contributors must obtain maintainer direction through the project's documented Discord process before writing code or opening a PR.
- Contributor pull requests target `dev`, not `main`.
- A contributor branch must be up to date with `dev` before submission and merge.
- Changes must remain backward compatible.
- Each pull request should address one issue.
- Changes require tests and must not reduce the expected coverage level.
- Existing test workflows validate shared contracts, server code, client code, and i18n parity.
- A push to `main` starts the stable release workflow.
- The stable release workflow updates versions, creates a Git tag, builds multi-architecture Docker images, and publishes the Helm chart.
- Major releases require explicit human confirmation.

The agent workflow must reuse existing CI checks. It must not duplicate the test and release implementation inside agent-specific workflows.

Repository configuration is part of the operating environment and cannot be inferred from committed workflow files. Before enabling automation, a maintainer must verify and record:

- the exact GitHub repository in which the workflow will run;
- whether that repository is the upstream project or a fork;
- protection or ruleset settings for `dev` and `main`;
- whether required checks are strict or a merge queue is enabled;
- the installed GitHub App identity, if one is used.

The current local checkout points to `JT-G3601/TREK`, while contribution links refer to `mauriceboe/TREK`. Phase 1 must resolve this identity explicitly instead of assuming that settings and secrets are shared between the two repositories.

## 3. Goals

The workflow must:

1. Accept only explicitly approved GitHub Issues.
2. Validate that the issue has a goal and testable acceptance criteria.
3. Separate exploration, implementation, and review responsibilities.
4. Persist task state in a concise handoff file.
5. Create an isolated branch and Draft PR targeting `dev`.
6. Run existing repository checks and record verification results.
7. Require an independent review after implementation.
8. Require humans to approve the plan, merge the PR, and initiate the release path.
9. Be idempotent and recoverable after failed or interrupted runs.
10. Collect enough operational evidence to decide whether the generic portion should later move to a reusable workflow repository.
11. Bind every approval to one immutable plan revision.
12. Prevent model processes and test processes from receiving repository write credentials.
13. Enforce approved scope deterministically before any generated change is published.

## 4. Non-Goals

The first version must not:

- merge pull requests automatically;
- push or open agent-authored pull requests directly against `main`;
- modify branch protection rules;
- publish Docker images, Helm charts, packages, or GitHub releases;
- rotate or expose secrets;
- execute production data operations;
- approve major version releases;
- accept arbitrary shell commands from issue content;
- allow an agent to expand the scope beyond the approved plan;
- automate Discord itself or treat the presence of a Discord URL as proof of approval;
- use a maintainer's personal access token as the normal automation credential;
- build a separate reusable workflow project before TREK has validated the workflow with real tasks.

## 5. Responsibility Model

### 5.1 Claude Code

Default responsibilities:

- read-only repository exploration;
- identification of repository facts, constraints, affected modules, and risks;
- preparation of the implementation plan;
- independent review of the completed diff;
- optional specialized review coordination for tests or security.

During exploration and review, Claude Code must not modify source files.

### 5.2 Codex

Default responsibilities:

- read the approved handoff;
- implement only the accepted plan;
- add or update tests;
- run applicable verification commands;
- return structured changed-file and verification facts so the controller can update the handoff;
- prepare a PR-ready branch and Draft PR;
- apply explicitly accepted review fixes.

`Codex` means the implementation-provider role, not a Claude Code sub-agent. Phase 1 must define a provider adapter before automated implementation begins. The adapter contract must specify:

- the product or runner being invoked and a pinned version;
- the command, action, API, or container entry point;
- authentication secret names and where they are exposed;
- input files and the approved-plan revision supplied to the runner;
- output format, including the generated patch and structured execution summary;
- timeout, retry, network, filesystem, and sandbox behavior;
- exit-code and partial-failure semantics.

The first adapter may target Codex, but orchestration must refer to an `implementation-provider` interface so a later provider change does not alter workflow state semantics.

In automated mode, authoritative verification runs in the separate verification job. The generation job must not execute generated repository code while a reusable model credential is available to child processes. If the provider requires tool execution during generation, the adapter must use a credential broker or equivalent isolation that prevents spawned commands from reading the provider credential.

### 5.3 Humans

Humans retain authority over:

- deciding whether an issue may enter the agent workflow;
- answering material product or architecture questions;
- approving the implementation plan;
- accepting changes that expand scope;
- approving high-risk work;
- final PR review and merge;
- promotion from `dev` to `main`;
- production releases and rollback decisions.

### 5.4 Independence Rule

The implementation agent must not act as the sole reviewer of its own change. The review agent should cold-start from:

- the GitHub Issue;
- the approved handoff;
- the current PR diff;
- CI results.

Full chat history must not be required for review or recovery.

### 5.5 Deterministic Controller and Publisher

Non-model code owns authorization and repository mutation. Its responsibilities are:

- verify repository identity, actor permission, issue state, and plan revision;
- validate handoff structure and policy syntax;
- enforce changed-path, change-size, and protected-path rules;
- create approval records and state transitions;
- apply a validated patch without executing generated code;
- push the implementation branch and create or update the Draft PR.

Claude Code and Codex may recommend or generate changes, but they must not decide whether their own output satisfies the authorization boundary.

## 6. End-to-End State Machine

```text
Issue opened or edited
  -> ai:triage
  -> ai:awaiting-admission
  -> authorized maintainer adds ai:admitted
  -> ai:planning
  -> ai:plan-ready
  -> human approves the current plan revision
  -> ai:implementing
  -> Draft PR to dev
  -> existing CI
  -> ai:reviewing
  -> ai:ready-for-human
  -> human merge
  -> ai:done
```

Exception transitions:

```text
any state -> ai:needs-info
any state -> ai:blocked
Draft PR -> ai:ci-awaiting-approval (only in GITHUB_TOKEN fallback mode)
ai:reviewing -> ai:changes-requested
ai:changes-requested -> human authorizes repair -> ai:implementing
```

The system must avoid inferring state only from free-form comments. Phase labels, Git refs and commits, checks from the expected GitHub App, pull request state, and validated handoff metadata are authoritative signals.

Exactly one phase label should be active at a time. Authorization labels may coexist with a phase label, but they are valid only when accompanied by the corresponding verified event or check record.

## 7. Labels

### 7.1 Phase Labels

Create and document these labels:

```text
ai:triage
ai:awaiting-admission
ai:planning
ai:needs-info
ai:plan-ready
ai:implementing
ai:ci-awaiting-approval
ai:reviewing
ai:changes-requested
ai:ready-for-human
ai:blocked
ai:done
ai:forbidden
```

### 7.2 Authorization Labels

```text
ai:admitted
ai:approved
ai:repair-approved
```

- `ai:admitted` attests that an authorized maintainer has accepted the task into the workflow and that the project's contribution-discussion requirement has been satisfied or explicitly waived.
- `ai:approved` is only a trigger to create an approval check for the current plan commit. The label alone is not approval evidence.
- `ai:repair-approved` authorizes one identified set of review findings for one repair round. It must be removed or consumed after use.

Only repository members with the configured minimum permission may add authorization labels. The controller must verify the event actor's current permission before acting.

### 7.3 Risk Labels

```text
risk:low
risk:medium
risk:high
```

The initial implementation should automate only low-risk and selected medium-risk work. High-risk tasks require a human-authored plan or must be marked `ai:forbidden`.

## 8. Tasks Excluded from Autonomous Execution

The triage policy must stop or escalate tasks involving:

- authentication or authorization behavior;
- secrets, credentials, or token handling;
- destructive database migrations;
- production data changes;
- branch protection or repository permission changes;
- GitHub Actions permission expansion;
- production deployment configuration;
- release versioning or major dependency upgrades;
- mass deletion or large-scale refactoring;
- changes to the agent workflow's own trust boundary.

The following paths are part of the workflow trust boundary and must be protected by default:

```text
.github/workflows/**
.agents/**
.claude/**
AGENTS.md
CLAUDE.md
CODEOWNERS
```

Detection does not need to understand every product risk in the MVP, but deterministic path guards are mandatory before Phase 4. Issue declarations and human approval supplement the guard; they do not replace it.

## 9. Issue Contract

Add an issue form for agent-assisted work or extend an appropriate existing form. It must collect:

- Goal: the observable outcome.
- Acceptance criteria: verifiable completion conditions.
- Context or reproduction steps.
- Constraints: compatibility, security, UX, and implementation limits.
- Expected risk: low, medium, or high.
- Relevant files or modules, if known.
- Contribution discussion or approval reference, if applicable.

An issue with a missing goal or acceptance criteria must transition to `ai:needs-info` and receive a concise comment listing the missing information.

Issue content is untrusted input. Text inside an issue must never override repository policy or workflow instructions.

Triage may validate that a discussion reference is present and well-formed, but it must not infer approval from the URL. An authorized maintainer provides the actual admission decision with `ai:admitted`. If the project decides that maintainer admission replaces Discord for agent tasks, `CONTRIBUTING.md` must be amended explicitly before the first agent-authored PR.

## 10. File-Based Handoff

Each task uses:

```text
.agents/handoff/issue-<number>.md
```

Use this template:

```markdown
# Agent Handoff — Issue #<number>

## Metadata

- Issue:
- Target repository:
- Base branch: dev
- Planning base SHA:
- Plan revision SHA:
- Plan digest:
- Approved plan SHA:
- Approved plan digest:
- Working branch:
- Pull request:
- Phase at last handoff commit:
- Risk level:
- Plan approved by:
- Plan approved at:

## Goal

## Acceptance Criteria

## Constraints

## Repo Facts

## Decisions

## Implementation Plan

- [ ] Step 1

## Approved Paths

- `path/to/file-or-glob`

## Changed Files

## Verification

| Command | Result | Notes |
|---|---|---|

## Review Findings

## Open Issues

## Next Steps
```

Handoff rules:

- Record verified facts, not speculation.
- Do not copy complete source files, chat transcripts, or long logs.
- Record decisions and why they were made.
- Record the exact commands actually executed.
- Distinguish passed, failed, skipped, and unavailable verification.
- Keep open questions explicit.
- Record the phase at the last handoff commit. Do not create a metadata-only commit merely to mirror every later label transition.
- Never rewrite the approved Goal, Acceptance Criteria, Constraints, Decisions,
  Implementation Plan, or Approved Paths in place. A material plan change creates
  a new plan revision and invalidates the previous approval.

### 10.1 Plan Publication and Approval Binding

The planning model job has read-only repository permission and produces a candidate handoff as an artifact. A separate deterministic publisher must:

1. validate the handoff schema and reject unexpected paths or files;
2. create or update `ai-plan/<issue-number>-<short-slug>` from the planning base SHA;
3. commit only `.agents/handoff/issue-<number>.md`;
4. record that commit SHA as the plan revision;
5. compute a SHA-256 digest over the normalized approved-plan fields;
6. publish the revision SHA and digest for human inspection;
7. move the issue to `ai:plan-ready`.

The plan digest covers only the approval-bearing data: schema version, issue
number, target repository, planning base SHA, Goal, Acceptance Criteria,
Constraints, Decisions, Implementation Plan, and Approved Paths. The validator
must convert these fields to a documented, stable-key-order UTF-8 JSON
representation before hashing. Execution results, review findings, and mutable
metadata are excluded.

A commit cannot contain its own commit SHA. Therefore the handoff on the plan commit leaves `Plan revision SHA`, approval fields, working branch, and PR fields unset. The publisher reports the resulting commit SHA externally, and the App-owned approval record binds it to the digest. The exact handoff copied to the implementation branch may then populate those metadata fields without altering digest-covered content.

When an authorized maintainer adds `ai:approved`, the approval controller must verify the actor and create an `AI Plan Approval` check or equivalent App-owned record on the current plan commit. The record must include:

- issue number;
- plan revision SHA and digest;
- approver identity and verified permission;
- approval timestamp;
- expected target repository.

Implementation may start only when the approval record comes from the configured App, targets the current plan commit, and matches the recomputed digest. A new plan commit invalidates the old approval and returns the issue to `ai:plan-ready`.

### 10.2 Handoff Lifecycle

- Planning state is stored on the plan branch, not only in an expiring Actions artifact or editable issue comment.
- The implementation branch is created separately from the current `dev` head after approval.
- The publisher copies the exact approved handoff blob into the implementation branch and records its source plan SHA and digest.
- Before the Draft PR is published, the controller appends implementation facts, changed files, and verification without changing the approved-plan fields.
- Independent review findings are authoritative in an App-owned check or PR review tied to the reviewed head SHA. Do not push a handoff-only commit after review, because that would change the reviewed head and retrigger CI.
- If repair is authorized, the accepted finding identifiers and repair results are added by the controller as part of the repair commit, after which CI and independent review run on the new head.
- The final audit record is the implementation-complete handoff plus App-owned approval, CI, and review records. The handoff is not required to duplicate every external transition.
- After merge or closure, state reconciliation may delete the plan branch only after the approved revision and final handoff are reachable from the PR history or an explicitly configured durable archive.

## 11. Branch and Pull Request Contract

Agent branches use:

```text
ai/<issue-number>-<short-slug>
```

Planning branches use:

```text
ai-plan/<issue-number>-<short-slug>
```

Rules:

- Create the implementation branch from the current `dev` head after approval.
- Allow one plan branch and one active implementation branch per issue; allow only one open PR per issue.
- Pull requests must target `dev`.
- Initial pull requests must be Drafts.
- The PR must link the issue.
- The PR must identify the approved plan SHA and digest.
- Commits must follow the repository's Conventional Commit convention.
- The agent must not change the base branch to `main`.
- The agent must not enable auto-merge.
- Before `ai:ready-for-human`, the branch must satisfy the repository's up-to-date rule through strict required checks or a merge queue. If neither is configured, readiness must fail closed and request maintainer action.

PR body template:

```markdown
## Summary

## Linked Issue

Closes #<number>

## Accepted Plan

## Changes

## Verification

## Risks

## Rollback

## Agent Handoff

`.agents/handoff/issue-<number>.md`
```

This is an Agent-generated PR body contract, not a replacement for `.github/PULL_REQUEST_TEMPLATE.md`. The publisher supplies the body directly when it creates the Draft PR. Human-authored PRs continue to use the existing repository template.

## 12. Proposed Repository Files

The implementation should introduce the following structure incrementally:

```text
AGENTS.md
CLAUDE.md
.agents/
  README.md
  policy.yml
  handoff/
    TEMPLATE.md
  templates/
    agent-pr.md
  scripts/
    validate-issue.mjs
    validate-handoff.mjs
    validate-approval.mjs
    scope-guard.mjs
  providers/
    implementation-provider.md
.claude/
  agents/
    code-reviewer.md
    test-debugger.md
    security-auditor.md
  rules/
    trek-architecture.md
    review-policy.md
  skills/
    issue-planning/
    pr-review/
.github/
  ISSUE_TEMPLATE/
    agent_task.yml
  workflows/
    ai-issue-triage.yml
    ai-plan.yml
    ai-plan-approval.yml
    ai-implement.yml
    ai-review.yml
    ai-repair.yml
    ai-state-sync.yml
```

Do not create all files merely to match the target tree. Each phase should add only the files needed for an executable, testable increment.

## 13. Machine-Readable Policy

Introduce `.agents/policy.yml` as the shared policy contract. Initial shape:

```yaml
version: 1

repository:
  expected_full_name: "<owner>/TREK"
  base_branch: dev
  release_branch: main

contribution:
  require_maintainer_admission: true
  require_discussion_reference: true

approval:
  minimum_permission: write
  expected_app_slug: "<agent-workflow-app>"

execution:
  implementation_provider: codex
  ci_trigger_mode: github-app

limits:
  max_changed_files: 20
  max_changed_lines: 1200
  max_repair_rounds: 2

protected_paths:
  - ".github/workflows/**"
  - ".agents/**"
  - ".claude/**"
  - "AGENTS.md"
  - "CLAUDE.md"
  - "CODEOWNERS"
  - "server/**/migrations/**"
  - "**/*secret*"
  - "docker-compose.yml"

generated_path_exceptions:
  handoff: ".agents/handoff/issue-{issue_number}.md"

require_human_review:
  - authentication
  - authorization
  - database-migration
  - dependency-major-update
  - release
  - workflow-permissions

release:
  agent_may_merge: false
  agent_may_trigger: false
```

Phase 1 may introduce this file as documentation, but Phase 4 must not start until the controller implements and tests its enforcement. The minimum enforcing version must:

- validate the policy schema and version;
- use repository-root-relative, normalized POSIX paths;
- reject absolute paths, `..` traversal, symlink escapes, submodule changes, and malformed patches;
- define glob matching and case-sensitivity explicitly;
- fail closed on missing or invalid policy;
- compare the patch against the approved plan's declared scope;
- reject model-generated changes to protected paths;
- allow the deterministic controller to update only the exact issue-matched handoff path declared by `generated_path_exceptions`;
- enforce changed-file and changed-line limits;
- produce machine-readable reasons and test fixtures.

The same policy library must run before publication and again as an `AI Scope Guard` PR check. Phase 6 may harden and extend it, but cannot be the first phase that enforces it.

## 14. Proposed GitHub Workflows

### 14.1 `ai-issue-triage.yml`

Trigger on creation or edits of the Agent task issue form and on relevant Agent labels. Do not enroll every repository issue automatically.

Responsibilities:

- validate required issue fields;
- verify label actors where authorization is implied;
- assign or validate a risk label;
- prevent duplicate runs;
- comment with missing information;
- move valid tasks to `ai:awaiting-admission`;
- move an admitted task to `ai:planning` only after verifying the `ai:admitted` actor.

### 14.2 `ai-plan.yml`

Trigger when a valid task enters `ai:planning`.

Responsibilities:

- run a model job that checks out `dev` with `contents: read` and `persist-credentials: false`;
- run Claude Code in explore/plan-only mode without repository write credentials;
- create a candidate handoff without modifying application code;
- pass only the candidate handoff and structured summary to a deterministic publisher job;
- validate and commit the handoff to the plan branch;
- publish the plan SHA and digest for human inspection;
- move the issue to `ai:plan-ready`.

The workflow must not treat an agent-produced plan as approved.

### 14.3 `ai-plan-approval.yml`

Trigger when `ai:approved` is added to an issue in `ai:plan-ready`.

Responsibilities:

- verify repository identity and the event actor's current permission;
- resolve the current plan branch head;
- recompute and verify the plan digest;
- create the App-owned `AI Plan Approval` record on that exact commit;
- record approver and timestamp without rewriting approved-plan fields;
- consume or remove stale approval labels when the plan changes;
- dispatch implementation for the approved plan revision exactly once.

### 14.4 `ai-implement.yml`

Trigger only from the approval controller after it creates and verifies the App-owned approval record for the current plan revision.

Responsibilities:

- confirm the issue, admission, App-owned approval, and plan digest are current;
- confirm there is no active implementation branch or PR for the issue;
- create a local worktree from the latest `dev` and copy the approved handoff into it;
- run the implementation provider without repository write credentials;
- export an application-code patch that excludes protected and controller-owned paths, plus a structured execution summary;
- verify the patch in a fresh job without model secrets or write credentials;
- run the enforcing scope guard;
- pass only validated artifacts to a publisher job that does not execute generated code;
- commit and push the implementation from the publisher job;
- create a Draft PR targeting `dev` with the configured CI-trigger credential;
- update the handoff and issue state.

Required job boundaries:

```text
preflight(read-only)
  -> generate(model secret, no write token)
  -> verify(no model secret, no write token)
  -> policy-check(deterministic, no write token)
  -> publish(short-lived write token, no generated code execution)
```

Publisher input must be a validated patch plus metadata, not an arbitrary workspace archive. `git apply --check` and the scope guard must run before commit. The publisher must not run package scripts, tests, hooks, or executables from the generated tree.

### 14.5 `ai-review.yml`

Trigger after the Draft PR and required CI results are available.

Responsibilities:

- provide the issue, handoff, diff, and CI summary to Claude Code;
- request findings-first review;
- prioritize correctness, security, regression, and missing-test findings;
- avoid style-only noise;
- return structured actionable findings with file and line references when possible;
- allow a deterministic controller, without the model credential, to publish the validated findings and state transition;
- transition to `ai:changes-requested` or `ai:ready-for-human`.

An agent review is advisory and must not submit the final human approval.

### 14.6 `ai-repair.yml`

Trigger only after a human adds `ai:repair-approved`.

Responsibilities:

- provide accepted review findings to Codex;
- use the same generate, verify, policy-check, and publish isolation as initial implementation;
- modify only the existing task branch and the approved finding set;
- rerun affected verification without model secrets or write credentials;
- update the handoff;
- return to `ai:reviewing`.

Limit automated repair to two rounds. Further failure transitions to `ai:blocked`.

### 14.7 `ai-state-sync.yml`

Responsibilities:

- reconcile issue labels with branch, PR, and check state;
- recover from interrupted workflows;
- avoid duplicate PRs or repeated implementations;
- mark merged or closed tasks appropriately;
- detect plan changes after approval and invalidate stale approvals;
- report PRs whose base is stale or whose required checks no longer apply to the current head;
- remind maintainers about inactive PRs without adding a new phase state in the MVP;
- report inconsistent states without guessing destructive corrections.

### 14.8 Hook Strategy

The MVP does not require a developer-local Git hook, and no local hook is an authorization or security boundary. GitHub event triggers start lifecycle phases; deterministic workflow checks enforce policy.

The reusable hook points are logical controller interfaces:

```text
pre-plan      -> validate issue, admission, repository identity
post-plan     -> validate handoff, publish revision and digest
pre-generate  -> validate approval binding and scope inputs
post-generate -> validate patch and structured summary
pre-publish   -> run scope guard, credential-isolation assertions, idempotency checks
post-ci       -> reconcile checks, review eligibility, and base freshness
```

Optional local wrappers may invoke the same validators for fast feedback, but bypassing them locally must not bypass the required server-side checks.

## 15. CI Integration

The new workflows must use the repository's existing CI as the source of truth. Required checks should include the applicable existing checks plus agent-specific safeguards. Implementers must inventory the actual check names and path filters before configuring them as required; a skipped path-filtered workflow must not leave an impossible required check.

Candidate required checks:

```text
i18n Key Parity
Shared Contracts
Server Tests
Client Tests
Lint / Prettier
AI Scope Guard
AI Approved Plan Binding
AI Base Freshness
Claude Independent Review
```

`AI Scope Guard` must verify before the first automated implementation is published:

- one linked issue;
- PR base is `dev`;
- changed files are within the accepted scope;
- model-generated changes do not touch protected paths, except the exact controller-owned handoff path;
- the handoff is present and updated;
- verification results are recorded;
- change size does not exceed configured limits without explicit approval.

`AI Approved Plan Binding` runs on the PR head and verifies that the handoff references a valid App-owned approval record on the source plan commit. The original `AI Plan Approval` record remains attached to the plan commit and is not itself assumed to be a branch-protection check on the PR head.

### 15.1 CI Trigger Credential

The target automated mode uses a dedicated GitHub App installation token to create or update the PR so existing `pull_request` workflows run normally. The App must have only the repository permissions required to create the implementation branch, PR, issue state, and approval/check records. Tokens must be minted only in the relevant publisher or controller job and expire after the job.

For manual pilots, `GITHUB_TOKEN` is an allowed fallback. In that mode, pull-request CI may require a maintainer to select **Approve workflows to run**. The issue must transition to `ai:ci-awaiting-approval`, and review must not start until the checks actually run. This fallback is an explicit human gate, not an error-retry loop.

A maintainer personal access token is not an approved steady-state credential.

### 15.2 Base Freshness and Concurrent PRs

Before Phase 4 is enabled, maintainers must verify one of these controls for `dev`:

1. strict required status checks that require the branch to be up to date; or
2. a merge queue configured with the required workflows also listening for `merge_group` where necessary.

If neither control is available, `AI Base Freshness` must block `ai:ready-for-human` when `dev` has advanced beyond the base tested for the current PR head. Agents must not automatically resolve merge conflicts or rewrite an approved plan to accommodate unrelated merged work.

State synchronization may comment after a configurable inactivity period, such as seven days, but the MVP does not add `ai:stale` as a separate phase.

## 16. Release Boundary

The only supported release path remains:

```text
agent PR -> human merge to dev -> human-controlled promotion to main
  -> existing main release workflow
```

Agent workflows must not receive Docker Hub credentials or release-environment credentials. They must not call the stable release workflow directly.

## 17. Permission Model

All workflows and jobs should start from read-only access:

```yaml
permissions:
  contents: read
```

Grant additional permissions only to a small deterministic job that requires them. Do not grant workflow-wide write permissions when only the publisher needs them.

| Job class | Repository token | Model secret | Executes generated code | May mutate GitHub |
|---|---|---|---|---|
| Explore / plan | `contents: read` | planning-provider credential | No application code | No |
| Generate / repair | `contents: read` | implementation-provider credential | Agent process only | No |
| Verify tests | `contents: read` | None | Yes, in an isolated runner | No |
| Policy check | `contents: read` | None | No | No |
| Review model | `contents: read`, checks read | review-provider credential | No | No; findings pass to controller |
| Publisher / state controller | Short-lived scoped write token | None | No | Only defined state and PR operations |

Additional requirements:

- Do not expose model secrets to workflows triggered from forks.
- Treat issue and PR content as prompt-injection-capable input.
- Use `persist-credentials: false` in every checkout available to a model or test process.
- Do not pass `github.token`, App tokens, or cloud credentials into model prompts, Agent environments, package scripts, or test processes.
- Remove model credentials before executing generated code; preferably execute verification in a fresh job.
- Treat cross-job artifacts as untrusted until their schema, size, paths, and digest are validated.
- The publisher must apply data, not execute generated scripts or reuse an Agent workspace.
- Privileged controller and publisher jobs must execute workflow code and validator scripts from a trusted protected base revision, never from the generated implementation head.
- Do not print secrets, environment values, or token-bearing URLs.
- Prefer a dedicated GitHub App with short-lived installation tokens for automated PR creation and App-owned checks.
- Pin third-party Actions introduced by the Agent workflows to reviewed immutable commit SHAs; version tags alone are not a trust boundary.
- Require CODEOWNERS review for workflow, policy, and agent-instruction changes.
- Protect `dev` and `main` with required checks and human reviews.
- Use a protected GitHub Environment for production publication.

## 18. Idempotency and Recovery

Each phase must be safe to rerun.

Use a logical execution key derived from:

```text
target repository + issue number + phase + relevant commit SHA or approved plan revision
```

Use GitHub Actions `concurrency` keyed by repository, issue number, and phase to serialize duplicate deliveries for the same task. Concurrency is an optimization; every mutating operation must still perform compare-before-write checks.

Before changing state, workflows must check:

- current issue labels;
- target repository identity;
- plan branch and current plan SHA;
- App-owned approval record and plan digest;
- existing agent branch;
- existing PR for the issue;
- current PR head SHA;
- completed checks;
- current handoff phase.

Recovery source priority:

```text
Configured repository identity and policy
  -> Git refs and commits
  -> App-owned approval and required checks
  -> PR state
  -> validated handoff file
  -> issue labels
  -> issue comments
  -> chat history, which must not be required
```

Issue comments may explain state but are not authorization evidence. Actions artifacts are transport between jobs, not the only durable recovery source.

After three repeated phase failures, transition to `ai:blocked` and provide a concise diagnostic. Do not expand scope automatically to bypass the failure.

## 19. Implementation Phases

### Phase 1: Repository Control Plane

Deliverables:

- `AGENTS.md` with TREK commands, constraints, boundaries, and handoff rules;
- `CLAUDE.md` with exploration and review rules;
- `.agents/README.md`;
- `.agents/policy.yml` documented as non-enforcing initially;
- `.agents/handoff/TEMPLATE.md`;
- implementation-provider adapter contract;
- Agent-generated PR body template that does not replace the existing human PR template;
- repository-configuration record covering target repository identity, contribution admission, CI credential mode, and branch/ruleset prerequisites.

Acceptance criteria:

- A fresh Codex session can identify the correct install, build, lint, and test commands.
- A fresh Claude Code session can perform read-only exploration and produce the expected handoff format.
- Neither instruction file authorizes merge or release actions.
- A human can manually execute the complete Claude-plan, Codex-implement, Claude-review loop using only repository files for handoff.
- The documented target repository and upstream/fork relationship are unambiguous.
- Maintainers decide whether `ai:admitted` supplements or replaces Discord approval for Agent tasks, and contribution documentation is consistent with that decision.
- The Codex provider adapter has explicit inputs, outputs, credentials, sandbox, and failure semantics.
- At least two low-risk manual walkthroughs validate the handoff before model-invoking workflow YAML is enabled.

### Phase 2: Issue Contract and Triage

Deliverables:

- agent task issue form;
- documented labels;
- triage workflow;
- tests or fixtures for required-field, actor-permission, and duplicate-state behavior.

Acceptance criteria:

- Incomplete issues receive `ai:needs-info` with actionable feedback.
- Valid issues enter `ai:awaiting-admission` exactly once.
- Only a verified maintainer admission moves an issue into planning.
- Unauthorized use of approval labels does not start implementation.
- Issue text cannot alter workflow policy.

### Phase 3: Automated Planning

Deliverables:

- planning workflow;
- Claude Code planning prompt or skill;
- deterministic handoff validator and publisher;
- plan branch, revision SHA, and digest;
- App-owned approval record bound to the plan revision.

Acceptance criteria:

- The planning model job has read-only repository permissions and no persisted Git credential.
- No application source changes are produced.
- The output includes goal, acceptance criteria, facts, risks, plan, and open questions.
- Only the publisher job may commit the validated handoff to the plan branch.
- Implementation cannot start until a verified human approves the current plan SHA and digest.
- Editing the plan invalidates its prior approval.

### Phase 4: Automated Implementation to Draft PR

Deliverables:

- enforcing policy parser and scope guard with fixtures;
- implementation workflow;
- branch and Draft PR creation;
- implementation-provider adapter and Codex instructions;
- isolated generate, verify, policy-check, and publish jobs;
- verification summary and artifact handling;
- state synchronization for interrupted implementation.

Acceptance criteria:

- The branch starts from the current `dev`.
- The PR targets `dev` and remains Draft.
- Model and test processes have no repository write credential.
- The publisher has no model secret and does not execute generated code.
- Only approved scope is modified.
- Invalid policy, malformed patch, protected-path changes, plan mismatch, or scope expansion fail closed before push.
- Applicable tests execute and their real results appear in the handoff and PR.
- Failed verification cannot be represented as success.
- Re-running the workflow does not create a duplicate branch or PR.
- Existing CI is observed on the published PR under the configured GitHub App mode or the documented manual-approval fallback.

### Phase 5: Independent Review and Repair

Deliverables:

- review workflow and reviewer definition;
- structured review finding format;
- human-authorized repair workflow;
- isolated repair publication using the same security boundaries as implementation;
- repair-round limit.

Acceptance criteria:

- The reviewer sees the issue, handoff, diff, and CI results.
- Findings prioritize functional and security impact.
- Blocking findings prevent `ai:ready-for-human`.
- Repair requires explicit authorization.
- More than two repair rounds transition to `ai:blocked`.

### Phase 6: Hardening and Evaluation

Deliverables:

- scope-guard hardening and expanded policy coverage;
- CODEOWNERS updates;
- branch protection checklist;
- operational metrics;
- runbook for blocked and failed tasks;
- inactivity reminders and stale-base diagnostics;
- decision record on extracting reusable components.

Acceptance criteria:

- Model-generated protected-path changes cannot pass; any such maintenance uses a separate human-controlled workflow outside this autonomous path.
- The policy parser and scope guard reject all documented malformed-path and plan-mismatch fixtures.
- Fork-based executions cannot access model or release secrets.
- Maintainers can recover or cancel an interrupted task using documented steps.
- At least several real low-risk issues have completed the workflow.
- The team can identify which components are TREK-specific and which are candidates for extraction.

## 20. Suggested Implementation Task Breakdown

Agents should implement one focused PR per task:

1. Record the target repository, contribution-admission decision, branch/ruleset prerequisites, and CI credential mode.
2. Add `AGENTS.md`, `CLAUDE.md`, handoff template, policy draft, PR body template, and implementation-provider contract.
3. Run and document at least two manual Claude-plan, Codex-implement, Claude-review walkthroughs.
4. Add the Agent task issue form, label documentation, and deterministic issue validator.
5. Implement triage and maintainer admission without invoking an AI model.
6. Implement and test the handoff validator, approval validator, policy parser, and minimum enforcing scope guard.
7. Add read-only automated planning, deterministic plan publication, and plan-revision approval binding.
8. Configure the dedicated GitHub App or explicitly enable the documented `GITHUB_TOKEN` pilot fallback.
9. Add isolated implementation to Draft PR with generate, verify, policy-check, and publish boundaries.
10. Add independent review reporting and human-authorized repair with a round limit.
11. Add state reconciliation, base-freshness handling, inactivity reminders, security hardening, and maintainer runbooks.
12. Evaluate extraction only after real workflow usage.

Each implementation PR must update this document if it changes an agreed contract.

## 21. Verification Strategy

Workflow changes should be verified with fixtures or a dedicated test repository before receiving production-capable permissions.

Minimum scenarios:

1. Valid low-risk issue.
2. Missing acceptance criteria.
3. Approval label added by an unauthorized actor.
4. Duplicate workflow delivery.
5. Existing branch but missing PR.
6. Existing PR with a newer head SHA.
7. CI failure.
8. Review requests changes.
9. Repair round limit reached.
10. Protected file changed.
11. Fork-originated request.
12. Prompt injection inside issue text.
13. Workflow interrupted after branch push but before PR creation.
14. Issue closed while an implementation is active.
15. Plan edited after approval.
16. Approval record points to a different plan SHA or digest.
17. Approval label added by an authorized actor but the App-owned approval check is missing.
18. Candidate handoff contains an unexpected file or malformed metadata.
19. Generated patch attempts an absolute path, path traversal, symlink escape, submodule update, or protected-path change.
20. Model process attempts an authenticated Git operation and has no usable write credential.
21. Test process attempts to read a model or publisher credential and none is present.
22. Publisher receives a valid patch and does not run generated package scripts or hooks.
23. PR created with `GITHUB_TOKEN` waits for human CI approval without entering a retry loop.
24. PR created with the configured GitHub App triggers applicable CI.
25. `dev` advances after CI or review, making the PR stale.
26. Two Agent PRs are active and one merges before the other.
27. Existing path-filtered checks are not applicable to the changed paths.
28. AI plan is technically infeasible and returns to `ai:needs-info` or `ai:blocked` before implementation.
29. Generated tests are trivial or do not prove an acceptance criterion.
30. Implementation passes tests but solves a different problem from the approved acceptance criteria.

For action logic, prefer testable scripts with small inputs over large inline shell blocks embedded in workflow YAML.

## 22. Operational Metrics

Track:

- time from approval to Draft PR;
- time waiting for maintainer admission, plan approval, CI approval, and final review separately;
- first-pass CI success rate;
- number of valid findings from independent review;
- defects found by humans but missed by agents;
- average repair rounds;
- blocked-task rate and reason;
- scope-expansion attempts;
- merged PR rollback rate;
- model and CI cost per completed issue;
- percentage of sessions recoverable from handoff without chat history;
- number of plan revisions per issue and stale approvals invalidated;
- publisher rejections by policy reason;
- maintainer minutes spent per completed issue.

Metrics should guide policy and skill refinement. They must not be used to encourage agents to hide failures or reduce necessary testing.

## 23. Extraction Decision

Keep the workflow physically inside TREK during initial implementation. Design the state machine, handoff schema, and policy interface so they can later be extracted.

Consider a separate reusable workflow project only when:

- a second repository is ready to adopt it;
- inputs and outputs have stabilized through real use;
- TREK-specific behavior is isolated behind configuration;
- permission and failure semantics are documented and tested;
- the reusable portion can be independently versioned.

Likely reusable components:

- issue validation;
- state transitions;
- plan and review schemas;
- approval verification;
- idempotency and recovery helpers;
- generic AI invocation wrappers.

TREK-specific components that should remain local:

- branch and contribution policy;
- repository commands;
- path risk classification;
- test selection;
- Docker and Helm release behavior;
- production credentials and environments.

### 23.1 Post-MVP Backlog: Provider-Neutral Model Routing

The initial workflow pins Claude Code with DeepSeek's Anthropic-compatible API
for planning and review, and Codex with OpenAI credentials for implementation
and repair. A
follow-up optimization should make the model platform replaceable per role
without changing the issue state machine, approval binding, handoff schema, or
verification and publication boundaries.

The provider abstraction should:

- map `planning`, `review`, `implementation`, and `repair` roles to named provider
  adapters in protected repository configuration;
- define each adapter's pinned runner/action, API protocol, endpoint, model,
  capability requirements, Secret name, arguments, and structured output schema;
- support direct providers and compatible gateways, beginning with Anthropic,
  DeepSeek's Anthropic-compatible endpoint, and OpenAI Codex;
- keep credentials scoped to the corresponding model job and refer to Secrets by
  name only; provider configuration must never contain Secret values;
- keep deterministic controllers provider-neutral by accepting the same validated
  plan, patch, and review-finding contracts from every adapter;
- reject unsupported tool, structured-output, context, or authentication
  capabilities before invoking a provider;
- allow provider selection only through reviewed control-plane changes, never from
  Issue text, labels, prompts, or other untrusted runtime input;
- restrict custom endpoints to a reviewed allowlist and preserve the existing
  no-write-credential and fail-closed security boundaries.

Acceptance criteria for this optimization:

1. A maintainer can switch planning/review between DeepSeek and another reviewed
   provider by changing protected provider configuration and Secret setup,
   without editing the state-machine workflows.
2. Contract tests cover missing Secrets, unsupported capabilities, invalid model
   names, disallowed endpoints, malformed provider output, and one successful
   fixture for each supported adapter.
3. Handoff, approval digest, scope guard, authoritative verification, and App-owned
   publishing behavior remain identical across providers.
4. Runbook and setup documentation describe provider-specific billing,
   credentials, model selection, compatibility limitations, and rollback.

This work should begin only after the first live dry run establishes a stable
baseline for the pinned MVP providers. It should be implemented as a separate
human-reviewed control-plane plan and PR.

## 24. Definition of Done

This plan is fully implemented when:

- an authorized maintainer can mark a valid Issue for agent handling;
- Claude Code produces a reviewable, read-only implementation plan;
- the validated plan is stored durably with a revision SHA and digest;
- a verified human approval is bound to that specific revision through the expected App;
- Codex implements the accepted plan on an isolated branch;
- model and test processes cannot access repository write credentials;
- a deterministic scope guard approves the patch before a credentialed publisher pushes it;
- the publisher cannot access model secrets and does not execute generated code;
- the system creates one Draft PR targeting `dev`;
- existing CI verifies the change;
- concurrent or stale Agent PRs cannot be marked ready without the configured up-to-date control;
- Claude Code independently reviews the diff;
- accepted review fixes can be applied with human authorization;
- a human remains responsible for final merge and release;
- all phases are recoverable from repository and GitHub state without chat history;
- no agent workflow can access or trigger TREK's production release path.
