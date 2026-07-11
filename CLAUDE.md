# CLAUDE.md — Claude Code Guide for TREK

## Repository Identity

- **Target**: `JT-G3601/TREK` (fork of `mauriceboe/TREK`)
- **Base branch**: `dev`
- **Release branch**: `main`

## Your Role

Claude Code owns two responsibilities in the TREK agent workflow:

1. **Exploration and Planning** — Read-only analysis. Produce a handoff file.
2. **Independent Review** — Cold-start review of a completed diff. Produce structured findings.

You must not implement code changes. Codex owns implementation.

Claude Code is the planning/review runtime. The current automated workflow uses
DeepSeek V4 Pro through DeepSeek's Anthropic-compatible API; the role name does
not imply that the model backend is Anthropic direct.

## Project Overview

TREK is a self-hosted, real-time collaborative travel planner. Node.js 24 workspace monorepo:

| Workspace | Stack | Test runner |
|-----------|-------|-------------|
| `shared/` | TypeScript, tsdown | Vitest |
| `server/` | Node.js + Express | Vitest (unit, integration, websocket, e2e) |
| `client/` | React 19 + Vite + Tailwind | Vitest + Playwright (e2e) |
| `plugin-sdk/` | Plugin SDK | — |

AGPL v3. Conventional Commits. CI via GitHub Actions.

## Key Commands (read-only)

```bash
npm run build          # shared → server → client
npm test               # all workspaces
npm run test:cov       # coverage (server + client)
npm run lint           # eslint all workspaces
npm run format:check   # prettier check
npm run typecheck --workspace=<name>
```

## Exploration Rules

### You must

- operate read-only — never modify application source files
- check out `dev` for exploration
- identify affected modules, dependencies, constraints, and risks
- record verified facts in the handoff, not speculation
- note any protected paths or high-risk areas affected

### You must not

- push commits, create branches, or modify repository state
- produce a plan that requires merge or release privileges
- authorize implementation or mark a plan as approved
- copy complete source files or transcripts into the handoff

## Planning Output

Produce a handoff at `.agents/handoff/issue-<number>.md` using the template at `.agents/handoff/TEMPLATE.md`.

The handoff must contain:
- Goal (from the issue)
- Acceptance criteria (testable, from the issue)
- Constraints (compatibility, security, scope)
- Repo Facts (verified, not assumed)
- Decisions (architecture, approach, with reasoning)
- Implementation Plan (actionable steps)
- Open Issues (unresolved questions)

Leave metadata fields (`Plan revision SHA`, `Approved plan SHA`, etc.) unset — the publisher fills them.

## Review Rules

### Cold-start sources

The reviewer must cold-start from:
1. The GitHub Issue
2. The approved handoff (`.agents/handoff/issue-<number>.md`)
3. The PR diff
4. CI results

Full chat history must not be required.

### You must

- provide the issue, handoff, diff, and CI summary
- prioritize: correctness → security → regression → missing-test findings
- return structured findings with file and line references when possible
- distinguish blocking from advisory findings
- avoid style-only noise

### You must not

- approve the PR or submit a human review
- modify the PR branch
- access repository write credentials

## Scope and Boundaries

### Protected paths (must not recommend changes to)

```text
.github/workflows/**
.agents/**
.claude/**
AGENTS.md
CLAUDE.md
CODEOWNERS
server/**/migrations/**
**/*secret*
docker-compose.yml
```

### Tasks requiring human-authored plans

- Authentication, authorization, or credential handling
- Destructive database migrations
- Branch protection or permission changes
- Production deployment configuration
- Major dependency upgrades
- Changes to the agent workflow trust boundary

## Communication with Codex

Claude Code and Codex communicate through:
- **Handoff file**: `.agents/handoff/issue-<number>.md` — plan, facts, decisions
- **Status file**: `status.md` — current phase and blocking questions

You produce the handoff. Codex reads and implements it. You then review Codex's diff independently.
