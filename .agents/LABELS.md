# Agent Workflow Labels

Labels used by the TREK agent-driven development workflow. Managed via GitHub Issues.

## Phase Labels

Exactly one phase label should be active at a time. These drive the state machine.

| Label | Meaning | Set by |
|-------|---------|--------|
| `ai:triage` | Issue is being validated | Workflow (auto) |
| `ai:awaiting-admission` | Waiting for maintainer admission | Workflow (auto) |
| `ai:planning` | Claude Code is producing a plan | Workflow (auto) |
| `ai:needs-info` | Issue needs more information from the author | Workflow or human |
| `ai:plan-ready` | Plan is published, awaiting human approval | Workflow (auto) |
| `ai:implementing` | Codex is implementing the approved plan | Workflow (auto) |
| `ai:ci-awaiting-approval` | GITHUB_TOKEN mode: waiting for human CI approval | Workflow (auto) |
| `ai:reviewing` | Claude Code is reviewing the PR diff | Workflow (auto) |
| `ai:changes-requested` | Review found issues; repair needed | Workflow (auto) |
| `ai:ready-for-human` | PR is ready for human review and merge | Workflow (auto) |
| `ai:blocked` | Task cannot proceed; needs human intervention | Workflow (auto) |
| `ai:done` | PR merged or issue closed | Workflow (auto) |
| `ai:forbidden` | Task may not be automated | Human only |

## Authorization Labels

Coexist with a phase label. Valid only when accompanied by the corresponding verified event or check record.

| Label | Meaning | Who may add | Consumption |
|-------|---------|-------------|-------------|
| `ai:admitted` | Maintainer has accepted the task into the workflow | Maintainer (write+) | Persistent |
| `ai:approved` | Plan revision approved for implementation | Maintainer (write+) | Invalidated on plan change |
| `ai:repair-approved` | One set of review findings authorized for repair | Maintainer (write+) | Consumed after one repair round |

## Risk Labels

| Label | Automation policy | Scope guard behavior |
|-------|-------------------|---------------------|
| `risk:low` | Fully automated | Normal limits apply |
| `risk:medium` | Automated if explicitly approved | Normal limits apply |
| `risk:high` | Requires human-authored plan or `ai:forbidden` | Requires human approval for protected paths |

Only the initial workflow MVP automates `risk:low` and selected `risk:medium` tasks.

## Label Color Scheme

Suggested hex values for consistency:

| Label group | Color | Examples |
|-------------|-------|----------|
| Phase — active | `#8B5CF6` (purple) | `ai:planning`, `ai:implementing` |
| Phase — waiting | `#F59E0B` (amber) | `ai:awaiting-admission`, `ai:plan-ready`, `ai:ci-awaiting-approval`, `ai:ready-for-human` |
| Phase — terminal | `#6B7280` (gray) | `ai:done`, `ai:blocked`, `ai:forbidden` |
| Phase — action needed | `#EF4444` (red) | `ai:needs-info`, `ai:changes-requested` |
| Phase — in progress | `#3B82F6` (blue) | `ai:triage`, `ai:reviewing` |
| Authorization | `#10B981` (green) | `ai:admitted`, `ai:approved`, `ai:repair-approved` |
| Risk — low | `#22C55E` (green) | `risk:low` |
| Risk — medium | `#F59E0B` (amber) | `risk:medium` |
| Risk — high | `#EF4444` (red) | `risk:high` |
