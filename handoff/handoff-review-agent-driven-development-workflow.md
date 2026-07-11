# Agent Handoff — Review: agent-driven-development-workflow.md

## Metadata

- Issue: N/A (plan review, not issue-driven)
- Plan under review: `docs/plans/agent-driven-development-workflow.md`
- Base branch: dev
- Working branch: N/A (read-only review)
- Current phase: ai:reviewing
- Risk level: low (review is read-only, no code changes)
- Plan approved by: N/A
- Plan approved at: N/A
- Reviewer: Claude (Fable 5)
- Review started at: 2026-07-10

## Goal

Evaluate the agent-driven development workflow plan for correctness, completeness, and implementability within the TREK repository. Identify gaps, conflicts, and risks before Phase 1 implementation begins.

## Acceptance Criteria

- [x] All sections of the plan assessed against existing repository state
- [x] Conflicts with existing policies documented with specific file references
- [x] Ambiguous definitions flagged with suggested resolutions
- [x] Missing edge cases identified
- [x] Findings recorded in a format consumable by Codex for follow-up

## Constraints

- Read-only review — no source files modified
- Follow handoff rules defined in the plan itself (Section 10)
- Record verified facts, not speculation
- Record decisions and why they were made

## Repo Facts

Verified by reading repository files (not assumed):

1. **Existing contribution policy** (`CONTRIBUTING.md`): Requires Discord discussion in `#github-pr` before any PR. PRs without prior discussion "will be closed." This is a hard gate the plan does not mention.

2. **Existing workflows** (`.github/workflows/`): 11 workflows already present — `close-stale-invalid-titles.yml`, `close-stale-wrong-branch.yml`, `close-untitled-issues.yml`, `docker-dev.yml`, `docker.yml`, `enforce-target-branch.yml`, `lint-prettier.yml`, `publish-plugin-sdk.yml`, `security.yml`, `test.yml`, `wiki.yml`. The plan proposes 6 new workflows that must coexist.

3. **Existing issue templates** (`.github/ISSUE_TEMPLATE/`): `bug_report.yml` and `config.yml` exist. The plan proposes adding `agent_task.yml`.

4. **No `.agents/` directory exists** — the plan starts from zero for agent infrastructure.

5. **No `.claude/` directory exists** — the plan starts from zero for Claude-specific configuration.

6. **Existing PR template** (`.github/PULL_REQUEST_TEMPLATE.md`): Already has Summary, Test plan, Linked issue sections. The plan's proposed PR body template (Section 11) overlaps but adds Accepted Plan, Risks, Rollback, and Agent Handoff sections.

7. **Branch protections**: `dev` and `main` are protected. `enforce-target-branch.yml` already gates PRs targeting wrong branches. The plan correctly preserves this.

8. **Release workflow** (`docker.yml`): Triggered on push to `main`. Builds multi-arch Docker images, publishes Helm chart. Plan correctly identifies this must not be agent-accessible.

## Decisions

### D1: Overall assessment — B+

**Why**: The plan's core architecture (state machine, handoff, least-privilege permissions, idempotency) is well-designed and security-conscious. The phased implementation strategy is pragmatic. However, one blocking conflict and several definitional gaps exist that should be resolved before Phase 1.

### D2: CONTRIBUTING.md conflict is the highest-priority finding

**Why**: The existing CONTRIBUTING.md mandates Discord pre-approval. The plan's triage workflow bypasses this entirely. If Phase 2 automation goes live without addressing this, it will either (a) produce PRs that get closed under existing policy, or (b) force a policy change the plan does not acknowledge. Either outcome should be explicit.

### D3: "Codex" must be defined before Phase 4

**Why**: The plan assigns implementation responsibility to "Codex" as distinct from "Claude Code" (Section 5.2), but never defines what Codex is — a different model, a different CLI tool, or a Claude Code sub-agent configuration. `.claude/agents/` only defines code-reviewer, test-debugger, security-auditor. An implementer reaching Phase 4 will encounter ambiguity.

### D4: Concurrent agent PRs are an unhandled edge case

**Why**: Two issues simultaneously in `ai:implementing` will both branch from `dev`, both create PRs targeting `dev`. When one merges first, the second PR's base is stale. Without a rebase-or-recheck gate, the second PR could pass CI on a stale base and introduce regressions on merge. This is a correctness risk, not just an optimization.

### D5: policy.yml enforcement gate is undefined

**Why**: Section 13 states policy.yml is "documentation, not a security boundary" initially, but never defines the conditions or phase when it transitions to enforcement. Without an explicit gate, it risks remaining non-enforcing indefinitely.

## Review Findings

### F1: BLOCKING — CONTRIBUTING.md Discord gate conflict

- **File**: `CONTRIBUTING.md` (lines 5-6) vs plan Section 6 (state machine)
- **Severity**: Blocking for Phase 2+
- **Finding**: The plan's `ai:triage` → `ai:planning` transition has no step for Discord approval. CONTRIBUTING.md states PRs without prior Discord discussion "will be closed."
- **Suggested fix**: Either (a) add a `require_discord_approval` flag to `.agents/policy.yml` with a triage step that checks for a Discord approval link/label, or (b) explicitly document in the plan that CONTRIBUTING.md will be amended as part of Phase 1, and state the new policy.

### F2: BLOCKING — "Codex" undefined

- **File**: `docs/plans/agent-driven-development-workflow.md` Section 5.2, Section 14.3
- **Severity**: Blocking for Phase 4
- **Finding**: "Codex" is referenced 8+ times as the implementation agent but never defined. Is it a Claude Code sub-agent, a separate tool, or a model identifier? The proposed `.claude/agents/` tree (Section 12) lists code-reviewer, test-debugger, security-auditor — no implementation agent.
- **Suggested fix**: Either rename to `implementation-agent` and define it as a Claude Code sub-agent in `.claude/agents/implementation-agent.md`, or if it is a different system, specify the tool, model, and invocation interface in Section 5.2.

### F3: MEDIUM — No concurrent-agent conflict detection

- **File**: Section 14.3, Section 18
- **Severity**: Medium (correctness risk)
- **Finding**: The idempotency checks (Section 18) prevent duplicate PR creation for the same issue, but do not handle cross-issue conflicts. If two agent PRs target `dev` simultaneously, the second-to-merge PR may pass CI on a stale base.
- **Suggested fix**: Add a pre-merge readiness check in `ai-implement.yml` or `ai-review.yml`: if `dev` has advanced since the PR branch was created, require a rebase and re-run of affected verification before transitioning to `ai:ready-for-human`.

### F4: MEDIUM — No PR staleness handling

- **File**: Section 6 (state machine)
- **Severity**: Medium (process risk)
- **Finding**: The state machine has no `ai:stale` state. If a PR sits at `ai:ready-for-human` for an extended period (common in open-source), `dev` advances and the PR may bit-rot without any automated signal.
- **Suggested fix**: Add `ai:stale` as an exception state with a time-based trigger (e.g., 7 days without human action). On transition, auto-comment on the PR and optionally trigger a rebase check.

### F5: MEDIUM — policy.yml enforcement gate undefined

- **File**: Section 13, line "Until then, it is documentation, not a security boundary."
- **Severity**: Medium (governance risk)
- **Finding**: No criteria, phase, or sign-off defined for when policy.yml transitions from documentation to enforcement. Without an explicit gate, this may never happen.
- **Suggested fix**: Add to Phase 6 acceptance criteria: "policy.yml is enforced by scope guard with tests confirming rejection of out-of-policy changes." Add a specific task in Section 20.

### F6: LOW — Missing quality-signal test scenarios

- **File**: Section 21 (Verification Strategy)
- **Severity**: Low (operational insight)
- **Finding**: The 14 test scenarios cover error paths well but lack quality-signal scenarios: "AI plan is technically infeasible," "Generated tests are trivial," "Implementation solves wrong problem." These matter for deciding whether the workflow is worth operating long-term.
- **Suggested fix**: Add 2-3 quality-signal scenarios to Section 21. These do not block implementation but should be tracked as operational metrics in Phase 6.

### F7: LOW — PR template merge strategy unclear

- **File**: Section 11 vs `.github/PULL_REQUEST_TEMPLATE.md`
- **Severity**: Low (clarity)
- **Finding**: The plan proposes a new PR body template with additional sections (Accepted Plan, Risks, Rollback, Agent Handoff). The existing template has different sections (Summary, Test plan, Linked issue). The plan does not specify whether the agent template replaces, extends, or sits alongside the existing one.
- **Suggested fix**: Clarify in Section 11 whether agent PRs use a separate template (`PULL_REQUEST_TEMPLATE/agent_pr.md`) or whether the existing template is extended.

## Open Issues

1. **Discord integration**: Is the plan's intent to (a) keep Discord approval as a pre-triage gate, (b) replace it with issue-form-based approval, or (c) run both in parallel? This should be decided before Phase 1.

2. **Model/provider selection**: If "Codex" refers to a different model/provider than Claude, what is the rationale for splitting planning (Claude) and implementation (Codex) across different systems? If it's the same system in different modes, why not define both as Claude Code sub-agents?

3. **Cost estimation**: What is the expected token/API cost per completed low-risk issue under this workflow? Phase 6 should include at minimum a rough order-of-magnitude estimate against the operational metrics.

4. **Human maintainer load**: The plan adds 4 human gates per issue. For a project with volunteer maintainers, what is the realistic throughput? If a maintainer can only review on weekends, a task could take 2+ weeks end-to-end.

## Next Steps

1. **Before Phase 1**: Resolve F1 (CONTRIBUTING.md conflict) and F2 (Codex definition).
2. **Before Phase 4**: Resolve F3 (concurrent conflict detection) and F5 (policy.yml enforcement gate).
3. **Before Phase 6**: Resolve F4 (staleness), F6 (quality scenarios), F7 (PR template).
4. **Recommendation**: Run 2-3 manual walkthroughs of the Claude-plan → human-approve → implement → Claude-review loop using only the Phase 1 artifacts (AGENTS.md, CLAUDE.md, handoff template) before writing any automation YAML. This validates the handoff format against real tasks.
