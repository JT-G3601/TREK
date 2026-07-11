# Agent Workflow Runbook

端到端启用与测试步骤见：
`docs/plans/agent-workflow-test-guide.md`。

## Quick Reference

### Issue Lifecycle

```text
Issue opened (agent_task form)
  → ai:triage → validation
  → ai:awaiting-admission → maintainer adds ai:admitted
  → ai:planning → Claude Code produces plan
  → ai:plan-ready → maintainer adds ai:approved
  → ai:implementing → implementation provider generates, scope guard checks, PR created
  → Draft PR → CI runs → ai:reviewing → Claude Code reviews
  → ai:ready-for-human → maintainer merges
  → ai:done
```

### Recovery Procedures

#### Task stuck in `ai:implementing` with no PR

**Symptom**: Issue has `ai:implementing` label for >2 hours, no Draft PR exists.

**Recovery**:
1. Check Actions tab → `AI Implement` workflow run for errors
2. If `preflight` failed: fix the issue (missing admission, duplicate branch), remove `ai:implementing`, re-add `ai:approved`
3. If `generate` failed: check the configured implementation provider credential or API availability
4. If `verify` failed: confirm whether the changed paths require project verification; documentation-only changes should record project checks as skipped
5. If `policy-check` failed: scope guard rejected the patch — review the generated changes manually
6. If `publish` failed: check GitHub App token permissions

#### Task stuck in `ai:reviewing`

**Symptom**: Draft PR exists, CI passed, but no review for >1 hour.

**Recovery**:
1. Check Actions tab → `AI Review` workflow
2. Verify CI checks actually completed (`lint`, `test`, `format`)
3. Manually trigger review by re-running the `AI Review` workflow

#### Task stuck in `ai:ready-for-human`

**Symptom**: PR reviewed, passed, waiting for >7 days.

**Recovery**:
1. State sync automatically comments after 7 days of inactivity
2. Check if `dev` has advanced — PR may need rebase
3. Merge or close the PR

#### Task in `ai:blocked`

**Symptom**: Something failed >3 times or repair limit reached.

**Recovery**:
1. Read the issue comments for the blocking reason
2. Common causes:
   - Scope guard violation (patch touched protected paths)
   - Repair round limit exceeded (2 rounds)
   - Plan digest mismatch (plan was edited after approval)
3. Resolution options:
   - Fix the root cause and re-add `ai:approved` to restart
   - Close as `ai:forbidden` if task is unsuitable for automation
   - Implement manually

### Label Quick Reference

| Label | Action |
|-------|--------|
| `ai:admitted` | Maintainer admits task (requires write+) |
| `ai:approved` | Maintainer approves plan (requires write+) |
| `ai:repair-approved` | Maintainer authorizes one repair round (requires write+) |
| `ai:forbidden` | Maintainer marks task as not suitable for automation |
| `ai:blocked` | Automated — task needs human intervention |

### Protected Paths

Agent workflows must not modify these without explicit human approval:
- `.github/workflows/**`
- `.agents/**`
- `.claude/**`
- `AGENTS.md`, `CLAUDE.md`, `CODEOWNERS`
- `server/**/migrations/**`
- `**/*secret*`
- `docker-compose.yml`

### Credential Troubleshooting

| Symptom | Check |
|---------|-------|
| PR created but CI not running | Verify GitHub App is installed with correct permissions |
| DeepSeek generation fails | Verify `DEEPSEEK_API_KEY` is set, funded, and valid |
| Claude Code planning/review fails | Verify `DEEPSEEK_API_KEY` and the Anthropic-compatible endpoint |
| Publisher can't push branch | Verify `AGENT_APP_ID` and `AGENT_APP_PRIVATE_KEY` secrets |

### Pre-activation verification

Run the deterministic contract suite and workflow static analysis before enabling
the Issue labels in a live repository:

```bash
node .agents/scripts/test-workflow-contracts.mjs
actionlint
git diff --check
```

Then perform one low-risk dry run and confirm all of the following from GitHub:

1. The plan branch contains the handoff commit reported on the Issue.
2. `AI Plan Approval / #<issue>` is owned by the App slug in policy and contains the same SHA and digest.
3. The implementation generation job has no repository write permission.
4. Failed verification or scope checks create no implementation branch.
5. The Draft PR is authored by the expected App and targets `dev`.
6. Independent review starts only after all applicable CI succeeds for the same head SHA.
7. A changed PR head invalidates unpublished review findings.

### Provider failure behavior

Planning, implementation, review, and repair are fail-closed. Missing credentials,
provider failures, empty patches, malformed structured output, or missing artifacts
must fail the workflow. They must never be replaced with empty plans, empty
findings, or synthetic success records.

### Monitoring

- State sync runs every 6 hours (`ai-state-sync.yml`)
- Manual trigger available via `workflow_dispatch`
- All state transitions are logged as issue comments
- Workflow run history in Actions tab
