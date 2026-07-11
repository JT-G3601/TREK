# Agent Handoff — Issue #walkthrough-2

## Metadata

- Issue: walkthrough-2（.gitignore 添加 .agents/handoff/ 临时文件忽略规则，仅保留 issue-*.md 和 TEMPLATE.md）
- Target repository: JT-G3601/TREK
- Base branch: dev
- Planning base SHA: 3db2495bcdcb1da300ca6430e0e3419a7650fb89
- Plan revision SHA:
- Plan digest:
- Approved plan SHA:
- Approved plan digest:
- Working branch: ai/walkthrough-2-handoff-gitignore
- Pull request:
- Phase at last handoff commit: ai:implemented
- Risk level: low
- Plan approved by: godot
- Plan approved at: 2026-07-11T01:41:43+08:00

## Goal

在 `.gitignore` 中添加规则：忽略 `.agents/handoff/` 下除 `issue-*.md` 和 `TEMPLATE.md` 以外的所有文件，防止开发者手工创建的临时笔记、草稿、调试文件被意外提交。

## Acceptance Criteria

- [ ] `.agents/handoff/` 下新建一个非 `issue-*.md` 且非 `TEMPLATE.md` 的文件，`git status` 不显示为 untracked
- [ ] `.agents/handoff/issue-demo.md`（符合 `issue-*.md` 模式）被 `git status` 识别为 untracked
- [ ] `.agents/handoff/TEMPLATE.md` 保持被 `git status` 跟踪
- [ ] 已有的 `issue-walkthrough-1.md` 仍被 Git 跟踪（若它已在上一次 walkthrough 中提交）
- [ ] 变更仅限 `.gitignore` 单文件
- [ ] `.gitignore` 中不引入语法错误或无效模式

## Constraints

- 仅修改 `.gitignore`，不触碰其他文件
- 不删除 `.gitignore` 中任何现有规则
- 新规则追加在文件末尾，与现有结构一致
- 不影响 `.claude/` 的现有忽略规则（`.claude/` 当前被忽略）
- 不影响 `.agents/` 下其他目录（如 `templates/`、`scripts/`、`providers/`）的跟踪状态

## Repo Facts

1. `.gitignore` 存在于仓库根目录，71 行，组织清晰（按 `# Dependencies`、`# Build output`、`# IDE` 等分组）
2. `.claude/` 已在 `.gitignore` L38（`# IDE` 分组下）被忽略。注意：这与 Plan Section 12 将 `.claude/` 视为版本控制目录的意图冲突，但不在本次 scope 内
3. `.agents/handoff/` 当前包含 `TEMPLATE.md`（应跟踪）和 `issue-walkthrough-1.md`（Phase 1 手工走查产物，应跟踪）
4. `.agents/` 其他子目录（`templates/`、`providers/`、`scripts/` 尚未创建）不受此次变更影响
5. `.agents/policy.yml` 和 `.agents/README.md` 位于 `.agents/` 根目录，不在 `handoff/` 下，不受此次变更影响

## Decisions

**D1: gitignore 模式 — 先全部忽略再逐个放行（allowlist 策略）**

Why: 比逐个列举要忽略的临时文件类型更安全。开发者可能在 handoff 目录下创建任意名称的草稿（`notes.md`、`draft.txt`、`scratch.md` 等），无法穷举。allowlist 策略确保只有明确设计的文件类型被跟踪。

具体规则：
```gitignore
# Agent handoff — track only issue handoffs and the template
.agents/handoff/*
!.agents/handoff/TEMPLATE.md
!.agents/handoff/issue-*.md
```

**D2: 追加位置 — `.gitignore` 末尾，新增独立分组**

Why: 与现有文件组织风格一致（每个分组有 `# Comment` 标题）。不插入现有分组中间，避免意外影响其他规则的匹配顺序。

**D3: TEMPLATE.md 显式放行**

Why: TEMPLATE.md 是 agent 基础设施文件，必须在仓库中版本控制。Plan Section 12 将其列为 `.agents/handoff/TEMPLATE.md` 的一部分。

**D4: 不处理 `.claude/` 的 gitignore 冲突**

Why: `.claude/` 目前在 `.gitignore` 中被忽略，与 Plan 意图冲突。但该问题涉及 Plan 修订和 `.claude/` 目录结构设计，超出本次 walkthrough-2 的 scope。应在后续 Phase 中作为独立 issue 处理。

## Implementation Plan

- [ ] 在 `.gitignore` 末尾追加 4 行：分组注释 + 3 条 gitignore 规则
- [ ] 验证：创建临时文件确认被忽略，创建 `issue-demo.md` 确认被跟踪
- [ ] 验证：`git check-ignore` 输出符合预期

## Approved Paths

- `.gitignore`

## Changed Files

- `.gitignore`
  - Appended an agent handoff allowlist rule group at the end of the file.
  - New rules ignore `.agents/handoff/*` by default, then unignore `.agents/handoff/TEMPLATE.md` and `.agents/handoff/issue-*.md`.

Control-plane record updated:
- `.agents/handoff/issue-walkthrough-2.md`
  - Recorded implementation branch, approval, changed-file facts, and verification results.
  - This is the workflow handoff record and is not part of the application change scope.

## Verification

| Command | Result | Notes |
|---------|--------|-------|
| `git check-ignore .agents/handoff/TEMPLATE.md` | Passed | No output, exit code 1; `TEMPLATE.md` is not ignored |
| `git check-ignore .agents/handoff/issue-demo.md` | Passed | No output, exit code 1; issue handoff files are not ignored |
| `touch .agents/handoff/scratch-notes.md .agents/handoff/issue-demo.md` | Passed | Temporary verification files created |
| `git check-ignore .agents/handoff/scratch-notes.md` | Passed | Output: `.agents/handoff/scratch-notes.md`, exit code 0 |
| `git status --short .agents/handoff/scratch-notes.md .agents/handoff/issue-demo.md .agents/handoff/TEMPLATE.md` | Passed with baseline note | Output included `?? .agents/handoff/TEMPLATE.md` and `?? .agents/handoff/issue-demo.md`; `scratch-notes.md` was absent as expected. `TEMPLATE.md` is currently untracked because `.agents/` control-plane files have not yet been committed in this workspace. |
| `git diff --stat -- .gitignore` | Passed | `.gitignore \| 5 +++++`, one file changed |
| `git diff --name-only -- .gitignore` | Passed | Output: `.gitignore` |
| `git diff --check -- .gitignore` | Passed | No output |
| `git ls-files .agents/handoff/TEMPLATE.md .agents/handoff/issue-walkthrough-1.md` | Baseline note | No output; both files are not tracked in the current uncommitted control-plane baseline |

Cleanup:
- Removed temporary verification files `.agents/handoff/scratch-notes.md` and `.agents/handoff/issue-demo.md` after verification.

## Review Findings

### Finding 1: PASS — .gitignore 变更精确匹配 Plan

`git diff dev -- .gitignore` 确认为 +5 行，追加在文件末尾（L72-L75），之前 71 行零修改：

```gitignore
# Agent handoff - track only issue handoffs and the template
.agents/handoff/*
!.agents/handoff/TEMPLATE.md
!.agents/handoff/issue-*.md
```

语法有效，无空白错误。AC "变更仅限 .gitignore 单文件" — `.gitignore` 本身的变更是单文件且正确。

### Finding 2: PASS — Allowlist 策略独立验证通过

| 测试 | 预期 | 实际 | 判定 |
|------|------|------|------|
| `git check-ignore TEMPLATE.md` | 不被忽略 (exit 1) | exit 1 | ✅ |
| `git check-ignore issue-demo.md` | 不被忽略 (exit 1) | exit 1 | ✅ |
| `git check-ignore scratch-notes.md` | 被忽略 (exit 0) | exit 0, 路径已输出 | ✅ |

规则语义正确：只有 `issue-*.md` 和 `TEMPLATE.md` 豁免忽略。

### Finding 3: ADVISORY — 分支未直接从 dev 创建

当前分支 `ai/walkthrough-2-handoff-gitignore` 基于 `ai/walkthrough-1-readme-automation-status`，导致工作区包含 walkthrough-1 的 `README.md` 变更。`git diff dev --stat` 显示 2 files changed（README.md + .gitignore），而非期望的仅 .gitignore。

Plan Section 11 要求："Create the implementation branch from the current dev head after approval."

- **严重程度**：Advisory（不阻塞本次 walkthrough 合并）
- **影响**：若两个 walkthrough 合并到 dev 的顺序不当，可能产生无实际影响的空合并
- **建议**：正式流程中，实施分支必须直接从 `dev` head 创建；`ai-state-sync.yml` 应能检测并标记此情况

### Finding 4: ADVISORY — Handoff 验证表中的 diff 命令限定了文件路径

Handoff 记录使用了 `git diff --stat -- .gitignore` 和 `git diff --name-only -- .gitignore`（`-- .gitignore` 限定），输出仅显示 `.gitignore`。这在技术上是准确的（命令确实只显示指定文件），但未呈现分支的完整差异状态。建议 handoff 始终记录一个不限定路径的 `git diff dev --stat` 供审查者参考。

### Finding 5: PASS — 无测试退化

`.gitignore` 变更不影响任何构建、测试或运行时行为。Application tests skipped 属合理。

### 审查结论

**✅ 通过。无阻塞问题。** `.gitignore` 变更本身正确，allowlist 规则验证通过。2 条 Advisory 发现（分支基线、验证表 diff scope）为流程改进建议，在正式自动化启用前应解决，但不阻塞当前 walkthrough。

## Open Issues

- `.claude/` 当前被 `.gitignore` 忽略，与 Plan Section 12 冲突。需在后续 Phase 独立处理。
- 分支创建基线策略需要在自动化流程中强制执行（见 Finding 3）。

## Next Steps

- 人工确认后合并到 `dev`
- Walkthrough-2 完成。两次手动走查均闭环，Task 3 完成
- 可以继续 Task 4（Agent 任务 Issue 表单 + 标签文档 + issue 验证器）
