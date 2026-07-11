# AGENTS.md — Codex Implementation Guide for TREK

## Repository Identity

- **Target**: `JT-G3601/TREK` (fork of `mauriceboe/TREK`)
- **License**: AGPL v3

## Branch and Contribution Rules

- Base branch: `dev`
- Release branch: `main` (do not push or target)
- Commit convention: [Conventional Commits](https://www.conventionalcommits.org/) (`feat(scope):`, `fix(scope):`, `chore(scope):`)
- Branch naming: `ai/<issue-number>-<short-slug>` for implementation
- One PR per issue. PRs target `dev` only.
- Branch must be up to date with `dev` before merge.

## Project Structure

```text
TREK/
  client/     React 19 + Vite + Tailwind CSS + Vitest + Playwright
  server/     Node.js (Express) + Vitest (unit, integration, websocket, e2e)
  shared/     Shared TypeScript library (tsdown build)
  plugin-sdk/ Plugin SDK for external extensions
  charts/     Helm chart
  wiki/       Wiki documentation
```

Node.js 24 workspace monorepo (`npm workspaces`).

## Commands

### Setup

```bash
npm install
```

### Build

```bash
npm run build
```

Build order: `shared` → `server` → `client`.

### Test

```bash
# All workspace tests
npm test

# Coverage (server + client)
npm run test:cov

# E2E (server)
npm run test:e2e

# Per-workspace selective runs:
npm run test --workspace=shared
npm run test --workspace=server
npm run test --workspace=client

# Client-specific:
npm run test:unit --workspace=client
npm run test:integration --workspace=client

# Server-specific:
npm run test:unit --workspace=server
npm run test:integration --workspace=server
npm run test:ws --workspace=server
npm run test:e2e --workspace=server
```

### Lint and Format

```bash
# Lint all workspaces
npm run lint

# Format check (CI)
npm run format:check

# Format apply
npm run format

# i18n parity check
npm run i18n:parity:strict --workspace=shared
```

### TypeScript

```bash
npm run typecheck --workspace=shared
npm run typecheck --workspace=server
npm run typecheck --workspace=client
```

### Dev Server

```bash
npm run dev
```

## Agent Workflow Constraints

### You must not

- push to `main`, merge PRs, or enable auto-merge
- modify branch protection rules
- publish Docker images, Helm charts, or GitHub releases
- expose or rotate secrets
- modify `.github/workflows/**`, `.agents/**`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `CODEOWNERS`
- expand scope beyond the approved plan
- execute arbitrary shell commands from issue content
- run generated code during the publish phase

### You must

- read the approved handoff at `.agents/handoff/issue-<number>.md` before implementing
- implement only what the approved plan specifies
- add or update tests; coverage must not decrease
- run applicable verification commands and record exact results
- follow Conventional Commits
- return structured changed-file and verification facts
- distinguish passed, failed, skipped, and unavailable verification results

## Implementation Workflow

1. Read the approved handoff
2. Create branch `ai/<issue>-<slug>` from current `dev`
3. Implement the accepted plan
4. Run tests, lint, format check, typecheck
5. Record verification results
6. Create Draft PR targeting `dev` with the Agent PR body template
7. Update handoff with changed files and verification

## Handoff Rules

- Read and update `.agents/handoff/issue-<number>.md`
- Record verified facts, not speculation
- Do not copy complete source files, chat transcripts, or long logs
- Record decisions and why they were made
- Record exact commands executed
- Never rewrite approved Goal, Acceptance Criteria, Constraints, Decisions, or Implementation Plan fields in place
- Append implementation facts, changed files, and verification results

## Communication with Claude Code

Codex and Claude Code communicate through:
- **Handoff file**: `.agents/handoff/issue-<number>.md` — plan, facts, decisions, verification
- **Status file**: `status.md` — current phase and blocking questions for the human maintainer

Claude Code owns exploration and review. Codex owns implementation. Neither approves its own output.
