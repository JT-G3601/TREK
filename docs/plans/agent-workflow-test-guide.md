# TREK Agent 工作流程测试手册

## 1. 测试目标与仓库边界

本手册用于验证 `JT-G3601/TREK` 自有的 Agent-driven development 工作流程。

该仓库虽然源自 `mauriceboe/TREK`，但现在是独立二次开发项目。测试和后续开发遵守以下边界：

- 所有 Issue、Plan branch、Implementation branch 和 Pull Request 都位于 `JT-G3601/TREK`。
- 所有 Agent PR 只允许以本仓库的 `dev` 为 base。
- 不向 `mauriceboe/TREK` 创建 PR，不向 upstream Push，也不以同步 upstream 为测试目标。
- `main` 是本仓库的发布边界；本次测试不得 Push 或 Merge 到 `main`。
- 完成测试后，由维护者决定是否保留测试产物。

## 2. 当前可用性结论

当前代码已经通过本地 contract tests、YAML 解析、Bash 语法和 `actionlint` 静态检查，但尚未完成真实 GitHub 端到端测试。

正式测试前必须完成：

- [ ] Agent 控制面文件已经提交并合并到本仓库 `dev`
- [ ] GitHub 默认分支已经从 `main` 改为 `dev`
- [ ] GitHub App 已创建并只安装到 `JT-G3601/TREK`
- [ ] App slug 已同步到 `.agents/policy.yml` 和 `.agents/policy.json`
- [ ] 四个 Actions Secrets 已配置
- [ ] Agent workflow labels 已创建
- [ ] `main` 分支保护禁止 GitHub App 绕过
- [ ] 人工 Plan Approval 已限制为 GitHub `User` actor，而不是 Bot/App actor

> GitHub 的 `issues`、`workflow_run`、`schedule` 等事件要求 workflow 文件存在于默认分支。当前远端默认分支是 `main`，而 Agent workflow 目标分支是 `dev`，因此测试前推荐将本仓库默认分支改为 `dev`。

## 3. 测试阶段总览

```text
Stage 0  本地确定性验证
  ↓
Stage 1  部署控制面到 dev，并将 dev 设为默认分支
  ↓
Stage 2  配置 GitHub App、Secrets 和 Labels
  ↓
Stage 3  App Token 与 State Sync 冒烟测试
  ↓
Stage 4  Triage/Needs-info/High-risk 状态机测试
  ↓
Stage 5  低风险 Issue 端到端测试
  ↓
Stage 6  可选 Repair Loop 测试
  ↓
Stage 7  证据审计与测试收尾
```

---

## 4. Stage 0 — 本地确定性验证

### 4.1 确认远端边界

在仓库根目录执行：

```bash
git remote -v
git symbolic-ref --short refs/remotes/origin/HEAD
```

预期：

```text
origin  → JT-G3601/TREK
origin/HEAD → origin/main（修改默认分支前）
```

如果存在名为 `upstream` 且指向 `mauriceboe/TREK` 的远端，本次测试不得向该远端执行任何 Push。

### 4.2 运行控制面测试

```bash
node .agents/scripts/test-workflow-contracts.mjs
actionlint .github/workflows/ai-*.yml
git diff --check
```

通过条件：

- [ ] Contract suite 输出 `All agent workflow contract tests passed.`
- [ ] `actionlint` 无输出并以状态码 `0` 结束
- [ ] `git diff --check` 无输出
- [ ] walkthrough-1 和 walkthrough-2 handoff 均通过 validator

### 4.3 检查待提交范围

```bash
git status --short
```

当前工作树同时包含控制面、README walkthrough 和 `.gitignore` walkthrough。提交前应由维护者确认是否拆分提交，避免把无关实验修改混入控制面提交。

建议至少区分：

1. Agent 控制面、workflows、skills、文档和测试脚本。
2. walkthrough-1 的 README 标记。
3. walkthrough-2 的 `.gitignore` 规则。

---

## 5. Stage 1 — 部署控制面到本仓库

### 5.1 创建控制面分支

从最新 `dev` 创建专用分支，例如：

```text
chore/agent-workflow-bootstrap
```

控制面 PR 必须：

- base：`JT-G3601/TREK:dev`
- head：本仓库的控制面分支
- Draft：可以先设为 Draft
- 不关联或提及 upstream PR
- 不触发 Merge 到 `main`

### 5.2 人工 Review 控制面

重点检查：

- [ ] `.github/workflows/ai-*.yml` 没有 `main` Push 或 Merge 操作
- [ ] GitHub App token 只出现在 controller/publisher job
- [ ] Claude/Codex job 没有 repository write permission
- [ ] Verification job 没有模型 Secrets
- [ ] `release.agent_may_merge` 和 `release.agent_may_trigger` 均为 `false`
- [ ] 所有 workflow 的 repository identity 是 `JT-G3601/TREK`

Review 通过后，人工 Merge 到 `dev`。

### 5.3 修改默认分支

在 GitHub 中执行：

```text
Repository Settings
→ General
→ Default branch
→ Switch to another branch
→ dev
```

修改后验证：

```bash
git remote set-head origin -a
git symbolic-ref --short refs/remotes/origin/HEAD
```

预期：

```text
origin/dev
```

同时确认：

- [ ] `main` 仍存在且受保护
- [ ] Stable release workflow 仍只监听 `main`
- [ ] GitHub App 不在 `main` 规则的 bypass list 中
- [ ] 普通 Agent PR 默认显示为目标 `dev`

---

## 6. Stage 2 — 配置 GitHub App、Secrets 和 Labels

### 6.1 创建 GitHub App

按照 `.agents/GITHUB_APP_SETUP.md` 创建 App。

最低 Repository Permissions：

| Permission | Level |
|---|---|
| Contents | Read & Write |
| Issues | Read & Write |
| Pull Requests | Read & Write |
| Checks | Read & Write |
| Metadata | Read |

安装范围必须选择：

```text
Only select repositories → JT-G3601/TREK
```

不得安装到 `mauriceboe/TREK`。

### 6.2 更新 App slug

将真实 slug 同时写入：

```text
.agents/policy.yml
.agents/policy.json
```

示例：

```yaml
approval:
  expected_app_slug: "trek-agent-workflow"
```

```json
{
  "approval": {
    "expected_app_slug": "trek-agent-workflow"
  }
}
```

这项修改需要再次通过控制面 PR 合并到 `dev`。

### 6.3 配置 Actions Secrets

在 GitHub 中进入：

```text
Settings → Secrets and variables → Actions → New repository secret
```

添加：

| Secret | 用途 |
|---|---|
| `AGENT_APP_ID` | 创建短期 GitHub App token |
| `AGENT_APP_PRIVATE_KEY` | App private key 完整 PEM 内容 |
| `OPENAI_API_KEY` | Codex implementation/repair provider |
| `ANTHROPIC_API_KEY` | Claude planning/review provider |

不要把 Secret 值写入 Issue、日志、policy、handoff 或 workflow 文件。

### 6.4 创建 Labels

按照 `.agents/LABELS.md` 创建以下 Labels。

Phase labels：

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

Authorization labels：

```text
ai:admitted
ai:approved
ai:repair-approved
```

Risk labels：

```text
risk:low
risk:medium
risk:high
```

检查点：

- [ ] 拼写和大小写完全一致
- [ ] 任一时刻最多只有一个 phase label
- [ ] Authorization label 与 phase label 分开管理

---

## 7. Stage 3 — App Token 与 State Sync 冒烟测试

### 操作

进入 GitHub：

```text
Actions → AI State Sync → Run workflow → dev
```

### 预期

- [ ] `actions/create-github-app-token` 成功
- [ ] App installation repository 是 `JT-G3601/TREK`
- [ ] `Reconcile Agent Task States` 成功
- [ ] 日志中没有输出 Secret
- [ ] 没有意外修改 Issue 或 PR

### 失败处理

| 现象 | 检查 |
|---|---|
| App token 创建失败 | App ID、PEM 格式、App 是否安装到本仓库 |
| `Resource not accessible by integration` | App Repository Permissions |
| App slug mismatch | `policy.yml` 与 `policy.json` 是否同步 |
| workflow 不出现在 Actions | workflow 是否已在默认分支 `dev` |

只有 Stage 3 通过后，才创建测试 Issue。

---

## 8. Stage 4 — 状态机冒烟测试

### 8.1 Valid Triage 测试

通过 `Agent Task` Issue Form 创建一个低风险测试 Issue，暂时不要添加 `ai:admitted`。

预期状态：

```text
ai:triage → ai:awaiting-admission
```

检查：

- [ ] 自动添加 `risk:low`
- [ ] 移除 `ai:triage`
- [ ] 添加 `ai:awaiting-admission`
- [ ] App 发布 Awaiting Admission comment
- [ ] 没有触发 Claude Planning

### 8.2 Needs-info 测试

在上述测试 Issue 中，临时编辑 body，删除 `Goal` 的内容或将 Scope Acknowledgment 改为未勾选。

预期：

```text
ai:awaiting-admission → ai:needs-info
```

恢复有效内容后再次编辑。

预期：

```text
ai:needs-info → ai:awaiting-admission
```

### 8.3 High-risk Gate 测试

创建另一个 `risk:high` Agent Task，随后由维护者添加 `ai:admitted`。

预期：

```text
ai:awaiting-admission → ai:forbidden
```

检查 Claude Planning 没有运行。

完成后关闭这两个状态机测试 Issue，并保留其 Actions 记录用于审计。

---

## 9. Stage 5 — 低风险端到端测试

### 9.1 创建测试 Issue

使用 Agent Task Form，填写以下内容。

#### Title

```text
[agent] Add agent workflow smoke-test document
```

#### Goal

```text
Create a smoke-test document proving that the TREK agent workflow can produce a verified Draft PR.
```

#### Acceptance Criteria

```text
- [ ] docs/agent-workflow-smoke-test.md exists.
- [ ] The file contains the heading "TREK Agent Workflow Smoke Test".
- [ ] The file contains one short English paragraph stating that it was generated during an approved workflow dry run.
- [ ] No existing application source file is modified.
```

#### Context / Background

```text
This is the first end-to-end dry run of the standalone JT-G3601/TREK agent workflow.
```

#### Constraints

```text
- Only create docs/agent-workflow-smoke-test.md.
- Do not modify application code, dependencies, workflows, configuration, or release files.
- Do not mention or target the upstream repository.
```

#### Risk Level

```text
risk:low — documentation, config, or cosmetic only
```

#### Relevant Files or Modules

```text
docs/agent-workflow-smoke-test.md
```

#### Discussion or Approval Reference

```text
Maintainer-approved standalone workflow dry run by godot.
```

勾选全部 Pre-flight 和 Scope Acknowledgment。

### 9.2 验证 Triage

等待 Issue 进入：

```text
ai:awaiting-admission
```

检查没有其它 phase label。

### 9.3 人工 Admission

维护者 `godot` 添加：

```text
ai:admitted
```

预期：

```text
ai:awaiting-admission
→ ai:planning
→ Claude planning job
→ ai:plan-ready
```

### 9.4 审核 Plan

从 Issue comment 记录：

```text
Plan branch
Plan SHA
Plan digest
```

检查 handoff：

- [ ] Goal 与 Issue 一致
- [ ] Acceptance Criteria 可验证
- [ ] `Approved Paths` 只有 `docs/agent-workflow-smoke-test.md`
- [ ] Risk level 是 `low`
- [ ] Planning base SHA 是当前 `dev`
- [ ] 没有 protected paths
- [ ] 没有要求 Merge/Push 到 `main`

可选本地验证 digest：

```bash
git fetch origin "ai-plan/<issue-number>-<slug>"
git show "<plan-sha>:.agents/handoff/issue-<issue-number>.md" > /tmp/agent-plan.md
node .agents/scripts/compute-plan-digest.mjs /tmp/agent-plan.md
```

输出必须等于 Issue comment 中的 Plan digest。

### 9.5 人工批准 Plan

确认 Plan 正确后，由 `godot` 添加：

```text
ai:approved
```

预期：

- [ ] 创建 `AI Plan Approval / #<issue-number>` Check
- [ ] Check conclusion 是 `success`
- [ ] Check owner 是 policy 中的 GitHub App slug
- [ ] Check 的 SHA 和 digest 与人工审核内容一致
- [ ] `ai:approved` 被消费
- [ ] Issue 进入 `ai:implementing`

如果 Approval Check 的 owner 是 `github-actions` 或其它 App，立即停止测试。

### 9.6 验证 Codex Implementation

检查 `AI Implement` workflow：

```text
Verify Admission and Plan Approval
→ Generate Patch with Codex
→ Authoritative Verification
→ Deterministic Scope Guard
→ Publish Draft PR
```

必须满足：

- [ ] Preflight 验证的是刚批准的 Plan SHA
- [ ] Codex job 没有 repository write permission
- [ ] Codex 只修改批准路径
- [ ] `npm test` 真实返回成功
- [ ] `npm run lint` 成功
- [ ] `npm run format:check` 成功
- [ ] Scope Guard 成功
- [ ] Verification 或 Scope Guard 成功前没有 Push branch

### 9.7 验证自动 Draft PR

预期自动产生：

```text
Branch: ai/<issue-number>-<slug>
PR base: dev
PR state: Draft
PR author: configured GitHub App
```

PR 文件范围应为：

```text
docs/agent-workflow-smoke-test.md
.agents/handoff/issue-<issue-number>.md
```

检查：

- [ ] 没有修改 `.github/workflows/**`
- [ ] 没有修改 `.agents/**`，除 controller 生成的当前 Issue handoff
- [ ] 没有修改 `.claude/**`、`AGENTS.md`、`CLAUDE.md`
- [ ] 没有修改依赖、migration、secret、Docker 或 release 文件
- [ ] PR body 中包含正确的 Plan SHA 和 digest
- [ ] Issue 进入 `ai:reviewing`

### 9.8 验证 CI 与 Claude Review

对于文档型 PR：

- Implementation workflow 内的 authoritative verification 仍应运行完整测试。
- PR 上至少应运行 `Lint & Prettier`。
- 路径过滤后的非适用 CI 可以不运行，但 Review Gate 必须正确识别。

预期：

```text
Applicable CI success
→ AI Review
→ Claude structured findings
→ App publishes review comment
→ ai:ready-for-human 或 ai:changes-requested
```

检查 Review comment：

- [ ] 明确记录 reviewed commit SHA
- [ ] SHA 等于当前 PR head
- [ ] 没有伪造人类 Approval
- [ ] 无 blocking finding 时进入 `ai:ready-for-human`
- [ ] 有 blocking finding 时进入 `ai:changes-requested`

### 9.9 人工 Merge

只有以下条件全部满足后才 Merge：

- [ ] PR 仍为目标 `dev`
- [ ] Branch 没有落后于最新 `dev`
- [ ] CI 全部成功
- [ ] Claude Review 对当前 head 有效
- [ ] 人工检查文件内容正确
- [ ] 没有超出 Approved Paths

由维护者人工 Merge 到 `dev`。不得启用 auto-merge，不得更改 base 为 `main`。

### 9.10 验证最终状态

手动运行：

```text
Actions → AI State Sync → Run workflow → dev
```

预期 Issue 进入：

```text
ai:done
```

检查 stable release workflow 没有运行。

---

## 10. Stage 6 — 可选 Repair Loop 测试

先完成一次正常端到端测试，再测试 Repair Loop。

### 操作方法

1. 创建另一个相同类型的低风险文档 Issue，并完成到 Draft PR。
2. 在 Claude Review 运行前，由维护者向该 PR branch Push 一个仅修改批准文件的 commit。
3. 将要求的标题故意改成明显错误的文本，例如：

   ```text
   WRONG HEADING FOR REPAIR TEST
   ```

4. 等待 CI 对新 head 成功。
5. 确认 Claude Review 将 Acceptance Criteria 不匹配标记为 blocking finding。
6. 确认 Issue 进入 `ai:changes-requested`。
7. 维护者检查 finding 后添加 `ai:repair-approved`。

预期：

```text
Bind Repair Authorization
→ Codex Repair
→ Repair Verification
→ Repair Scope Guard
→ App pushes repair commit
→ CI rerun
→ Claude re-review
→ ai:ready-for-human
```

检查：

- [ ] Repair 绑定的 review comment 对应当前错误 head
- [ ] Repair round 从 1 开始
- [ ] Codex 只修复批准文件
- [ ] Repair 通过测试和 scope guard 后才 Push
- [ ] `ai:repair-approved` 被消费
- [ ] 新 head 重新执行 CI 和 Review

如果 Claude 没有将错误标题判断为 blocking，本轮 Repair 测试记为 `inconclusive`，不要手工伪造 App review comment。

---

## 11. Stage 7 — 审计证据与测试收尾

为每个测试 Issue 记录：

| Evidence | 记录内容 |
|---|---|
| Issue | URL 与 Issue number |
| Admission | actor 与时间 |
| Plan | branch、SHA、digest |
| Approval | actor、App slug、Check URL |
| Implementation | workflow run URL、branch、commit |
| Verification | tests/lint/format/scope 结果 |
| Draft PR | URL、base、author、head SHA |
| Review | reviewed SHA、findings、comment URL |
| Merge | human actor、merge commit、目标 `dev` |
| Final state | `ai:done` 与 State Sync run URL |

### 测试通过标准

首次端到端测试只有在以下条件全部满足时才算通过：

- [ ] 没有人工执行 Implementation commit、Push 或 Draft PR 创建
- [ ] Plan Approval 和最终 Merge 确实由人完成
- [ ] 所有自动写操作来自预期 GitHub App
- [ ] 模型 job 没有 repository write token
- [ ] Verification job 没有模型 Secret
- [ ] 失败门禁不会发布 branch/PR
- [ ] Review 与准确 PR head SHA 绑定
- [ ] PR 只进入本仓库 `dev`
- [ ] 没有联系、修改或向 `mauriceboe/TREK` 提交内容
- [ ] 没有触发 `main` release workflow

### 测试产物处理

推荐保留：

- 测试 Issue 与评论
- Actions runs
- Plan branches（policy 当前要求 retain）
- 第一个成功的 smoke-test PR 与 handoff

可以后续通过普通人工 PR 删除 `docs/agent-workflow-smoke-test.md`。不要为了清理测试文件直接 Push `main`。

## 12. 失败停止条件

出现以下任一情况时立即停止测试并将 Issue 标记为 `ai:blocked`：

- Approval Check 不是预期 App 创建
- Plan SHA 或 digest 不一致
- 模型 job 获得 repository write permission
- Verification job 获得模型 Secret
- Scope Guard 失败后仍创建 branch 或 PR
- PR base 是 `main` 或其它仓库
- App 能绕过 `main` branch protection
- Review 使用的 SHA 不是当前 PR head
- 自动执行 Merge、auto-merge 或 release
- 日志、Issue、artifact 或 handoff 暴露 Secret

停止后保存 workflow run 和日志，不要通过手工 Push 绕过失败步骤。
