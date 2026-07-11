# .agents/ — TREK Agent Workflow Infrastructure

This directory contains the control plane for TREK's agent-driven development workflow. It defines policy, handoff templates, validation scripts, and provider contracts.

## Directory Structure

```text
.agents/
  README.md                      ← this file
  policy.yml                     ← machine-readable policy (enforcing from Phase 4)
  handoff/
    TEMPLATE.md                  ← task handoff template
    issue-<number>.md            ← per-task handoff files
  templates/
    agent-pr.md                  ← PR body template for agent-authored PRs
  scripts/
    validate-issue.mjs           ← issue form validator (Phase 2)
    validate-handoff.mjs         ← handoff schema validator (Phase 3)
    compute-plan-digest.mjs      ← canonical immutable-plan digest
    validate-approval.mjs        ← approval binding validator (Phase 3)
    extract-approved-scope.mjs   ← approved path/glob extractor
    finalize-implementation-handoff.mjs ← controller-owned execution record update
    scope-guard.mjs              ← scope enforcement (Phase 4, minimum enforcing before Phase 4)
    test-workflow-contracts.mjs  ← deterministic control-plane contract tests
  providers/
    implementation-provider.md   ← Codex provider adapter contract
```

## Policy

`.agents/policy.yml` is the shared policy contract. It defines:

- Repository identity and branch rules
- Contribution admission requirements
- Approval permissions
- Execution mode (GitHub App vs GITHUB_TOKEN fallback)
- File-change limits
- Protected paths
- Human-review triggers

`policy.json` is the runtime-enforced representation consumed by the controller.
Changes to `policy.yml` and `policy.json` must remain synchronized and receive
human review. Scope validation fails closed on missing policy, missing approved
scope, protected paths, or configured size-limit violations.

## Handoff Lifecycle

1. **Planning**: Claude Code produces a candidate handoff (read-only exploration)
2. **Publication**: Publisher validates schema, commits to `ai-plan/<issue>-<slug>`, records SHA and digest
3. **Approval**: Human approves the plan revision; App-owned approval record binds to SHA + digest
4. **Implementation**: Codex reads approved handoff, implements, records results
5. **Review**: Claude Code independently reviews the diff
6. **Archive**: Plan branches retained after merge for audit

## Agent Roles

| Role | Tool | Permissions |
|------|------|-------------|
| Planning | Claude Code (DeepSeek backend) | Read-only |
| Implementation | Codex | Read-only (write via publisher) |
| Review | Claude Code (DeepSeek backend) | Read-only |
| Publishing | Deterministic controller | Short-lived write token |
| Approval | Human maintainer | Repository write |
| Merge & Release | Human maintainer | Repository admin |

## Reference

- Plan: `docs/plans/agent-driven-development-workflow.md`
- AGENTS.md: Codex implementation guide
- CLAUDE.md: Claude Code exploration and review guide
