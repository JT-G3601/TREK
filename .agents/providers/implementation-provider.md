# Implementation Provider Adapter Contract

## Purpose

This contract defines the interface between the TREK agent workflow controller and the implementation provider (Codex). The controller owns authorization and repository mutation; the provider generates changes under read-only constraints.

## Provider Identity

- **Provider name**: Codex
- **Provider type**: External agent tool, peer to Claude Code
- **Communication**: File-based handoff (`.agents/handoff/issue-<number>.md`) and status (`status.md`)
- **Runner**: `openai/codex-action`
- **Pinned action commit**: `52fe01ec70a42f454c9d2ebd47598f9fd6893d56` (`v1` at verification time)
- **Pinned Codex CLI version**: `0.143.0`

## Invocation

### Inputs

The controller supplies the following to the provider:

| Input | Format | Source |
|-------|--------|--------|
| Approved handoff | `.agents/handoff/issue-<number>.md` | Plan branch, approved revision |
| Repository checkout | Git worktree at `dev` head | Fresh checkout, no write credentials |
| Provider credential | `OPENAI_API_KEY` passed to the action's protected Responses API proxy | Repository secret, not exposed to tests or publisher |

### Outputs

The provider must return:

| Output | Format | Description |
|--------|--------|-------------|
| Patch | Binary-capable full-index Git diff | Application-code changes only; must exclude `.agents/`, `.github/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `CODEOWNERS` |
| Final message | Text | Concise provider description of the working-tree change |
| Controller summary | JSON object | Provider/action version, plan SHA/digest, partial-failure flag, and final message |

Changed paths and verification evidence are derived by deterministic downstream
jobs from the patch; they are not trusted from the model response.

### Invocation

```yaml
- uses: openai/codex-action@52fe01ec70a42f454c9d2ebd47598f9fd6893d56
  with:
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    prompt-file: .agent-input/prompt.md
    sandbox: workspace-write
    safety-strategy: drop-sudo
    codex-version: 0.143.0
    codex-args: '["--ephemeral", "--ignore-user-config", "--strict-config"]'
```

The controller exports the complete working-tree change with
`git diff --binary --full-index` after removing controller-owned input files.
New files are included with intent-to-add before diff generation. The generation
job must fail when the patch is empty or the provider changes `HEAD`.

## Credential Isolation

- The provider credential must be available to the generation job only.
- The verification job must not receive the provider credential.
- The publisher job must not receive the provider credential.
- The official action's protected Responses API proxy is the credential broker;
  the raw API key must not be exported as a general job environment variable.
- `persist-credentials: false` in every checkout available to the provider.

## Sandbox Constraints

| Constraint | Value |
|------------|-------|
| Network egress | Required (model API) |
| Network ingress to repository | None |
| Filesystem write scope | Working directory only |
| Git operations | Disallowed (no write credential available) |
| Generated code execution | Project tests and generated application code are forbidden in generation and publisher jobs; authoritative execution occurs only in the credential-free verification job |
| Timeout | 15 minutes at the generation-job boundary |
| Retry | No implicit provider retry; a maintainer may rerun a failed job after determining it is transient |

## Failure Semantics

Any non-zero action exit, timeout, empty patch, changed `HEAD`, malformed artifact,
verification failure, or policy rejection blocks publication. The controller
records job-level facts and moves the Issue to `ai:blocked`; it does not infer
special semantic exit codes from the provider.

## Partial Failure

If the provider produces a partial patch (some steps succeeded, others failed):
- The execution summary must flag `partial_failure: true` and list which plan steps are incomplete.
- The controller must not publish a partial patch.
- The handoff must record the failure and transition to `ai:blocked`.

## Adapter Versioning

When the provider runner, version, or interface changes, the adapter contract must be updated and the change recorded as a plan revision. The adapter version is part of the repository configuration and changes to it require CODEOWNERS review.
