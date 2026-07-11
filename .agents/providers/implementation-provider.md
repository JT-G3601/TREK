# Implementation Provider Adapter Contract

## Purpose

This contract defines the interface between the TREK agent workflow controller and the implementation provider. The controller owns authorization and repository mutation; the provider generates working-tree changes without repository write credentials.

## Provider Identity

- **Provider name**: DeepSeek V4 Pro through Claude Code (temporary fallback)
- **Provider type**: External implementation agent
- **Communication**: File-based handoff (`.agents/handoff/issue-<number>.md`) and status (`status.md`)
- **Runner**: `anthropics/claude-code-action`
- **Pinned action commit**: `e90deca47693f9457b72f2b53c17d7c445a87342` (`v1` at verification time)
- **Platform**: DeepSeek Anthropic-compatible API
- **Endpoint**: `https://api.deepseek.com/anthropic`
- **Model**: `deepseek-v4-pro`
- **Fallback reason**: OpenAI API quota is unavailable during the workflow pilot; restore Codex through a reviewed adapter change when quota becomes available.

## Invocation

### Inputs

The controller supplies the following to the provider:

| Input | Format | Source |
|-------|--------|--------|
| Approved handoff | `.agents/handoff/issue-<number>.md` | Plan branch, approved revision |
| Repository checkout | Git worktree at `dev` head | Fresh checkout, no write credentials |
| Provider credential | `DEEPSEEK_API_KEY` passed as the action's `anthropic_api_key` input | Repository secret, not exposed to tests or publisher |

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
- uses: anthropics/claude-code-action@e90deca47693f9457b72f2b53c17d7c445a87342
  env:
    ANTHROPIC_BASE_URL: https://api.deepseek.com/anthropic
  with:
    anthropic_api_key: ${{ secrets.DEEPSEEK_API_KEY }}
    github_token: ${{ github.token }}
    allowed_bots: "godot-agent-bot[bot]"
    track_progress: false
    prompt: Read the controller-owned prompt file and implement the approved plan.
    claude_args: >-
      --model deepseek-v4-pro
      --max-turns 20
      --allowedTools "Read,Glob,Grep,Edit,Write"
      --disallowedTools "Bash,NotebookEdit,WebFetch,WebSearch,TaskOutput,KillTask"
```

The controller exports the complete working-tree change with
`git diff --binary --full-index` after removing controller-owned input files.
New files are included with intent-to-add before diff generation. The generation
job must fail when the patch is empty or the provider changes `HEAD`.

## Credential Isolation

- The provider credential must be available to the generation job only.
- The verification job must not receive the provider credential.
- The publisher job must not receive the provider credential.
- The raw API key is passed only through the action's secret input.
- Bash, web, notebook, and background-task tools are denied while the provider credential is present.
- The provider receives a read-only workflow token and cannot publish repository changes.
- `persist-credentials: false` in every checkout available to the provider.

## Sandbox Constraints

| Constraint | Value |
|------------|-------|
| Network egress | Required (model API) |
| Network ingress to repository | None |
| Filesystem write scope | Claude Code `Edit` and `Write` tools in the checkout; deterministic scope guard enforces Approved Paths |
| Git operations | Disallowed (no write credential available) |
| Generated code execution | Project tests and generated application code are forbidden in generation and publisher jobs; applicable project checks run only in the credential-free verification job, while documentation-only changes record them as skipped |
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
