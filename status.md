# Status — Agent-Driven Development Workflow

## Current Phase

**Implementation repaired; activation blocked pending GitHub App/provider configuration and one live dry run.**

Repository boundary: `JT-G3601/TREK` is now treated as an independent secondary
development repository. The Agent workflow will not create PRs against or push
changes to `mauriceboe/TREK`.

Codex review findings were recorded in
`handoff/handoff-codex-review-agent-workflow-implementation.md`. The P0/P1
implementation defects identified there have been repaired locally. Static and
deterministic validation passes, but no claim of end-to-end completion is made
until GitHub executes the workflows with real App and provider credentials.

## Task Progress

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 仓库配置记录 | ✅ | `dev`、repository identity、policy 已记录 |
| 2 | 控制平面文档 | ✅ | Agent roles、handoff、provider contract、runbook 已建立 |
| 3 | 手动走查 ×2 | ✅ | walkthrough-1 与 walkthrough-2；两份 handoff 当前均通过 schema validator |
| 4 | Issue 表单 + 标签 + 验证器 | ✅ | 增加缺失 scope acknowledgment 的 fail-closed fixture |
| 5 | Triage + 准入 | ✅（静态） | 安全 JSON 序列化、无脚本插值、invalid path 可达、高风险任务禁止自动规划 |
| 6 | Approval validator + scope guard | ✅ | 统一 plan digest、Approved Paths 进入 digest、精确 handoff exception、非法 scope fail-closed |
| 7 | Planning + approval | ✅（静态） | Claude structured output → deterministic handoff → App plan commit → App-owned SHA/digest approval |
| 8 | GitHub App 配置 | ⚠️ 外部操作 | 配置指南完成；App、slug 和 repository secrets 尚未在 GitHub 实测 |
| 9 | Implementation → Draft PR | ✅（静态） | 官方 Codex Action、隔离验证、scope output、App publisher 和失败报告已实现；等待 live dry run |
| 10 | Review + repair | ✅（静态） | 同一 head CI gate、read-only structured review、绑定 findings 的 repair 已实现；等待 live dry run |
| 11 | Hardening + runbook | ✅（本地） | App state sync、provider pin、contract suite、actionlint 验证已完成 |
| 12 | 提取评估 | ⏳ | 需要真实 Issue/PR 运行数据后评估 |

## Review Repairs Applied

1. Triage 不再使用无法展开的 quoted heredoc，validator 非零结果不会跳过状态处理。
2. Planning 不再发布占位成功；候选计划由 Claude structured output 产生并确定性渲染。
3. Plan branch 包含真实 handoff commit；approval 重新读取该 commit 并验证 digest。
4. Approval check 必须由 policy 中的 GitHub App slug 创建，机器载荷绑定 SHA、digest、approver 和 permission。
5. Implementation preflight 验证 admission、repository、fresh base、plan ref 和 App-owned approval。
6. Tests、lint、format 和 scope guard 均为 publisher 硬门禁，不再吞掉退出码。
7. Publisher 使用短期 GitHub App token；Codex/Claude model jobs 无 repository write permission。
8. Review 只在同一 PR head 的适用 CI 全部成功后运行，且忽略 fork/untrusted PR。
9. Repair approval 绑定当前 PR head 和 App 发布的当前 review findings，并重新经过 verification/scope guard。
10. Provider 缺失、空 patch、malformed output、stale head/base 全部 fail-closed。

## Local Verification

| Command | Result |
|---|---|
| `node .agents/scripts/test-workflow-contracts.mjs` | Passed |
| `/tmp/actionlint -color` (actionlint v1.7.12) | Passed, no findings |
| PyYAML syntax parse of all `ai-*.yml` and Agent Task form | Passed |
| `git diff --check` | Passed |
| `validate-handoff.mjs` on walkthrough-1 and walkthrough-2 | Passed |

## Required Before Activation

1. Create/install the GitHub App and set `approval.expected_app_slug` to its exact slug.
2. Configure `AGENT_APP_ID`, `AGENT_APP_PRIVATE_KEY`, `OPENAI_API_KEY`, and `DEEPSEEK_API_KEY`.
3. Commit these control-plane files to `dev` and change this repository's default branch from `main` to `dev`; Issue and `workflow_run` workflows must exist on the default branch.
4. Verify `dev` ruleset/required checks and confirm the App cannot push to or bypass protection on `main`.
5. Follow `docs/plans/agent-workflow-test-guide.md` for the staged smoke test.
6. Run one admitted `risk:low` documentation Issue end to end and verify every checkpoint in `.agents/RUNBOOK.md`.
7. Keep the workflow disabled or do not apply admission labels until that dry run is reviewed.

## Known Local State

- The control-plane/workflow implementation and both walkthrough changes are still uncommitted in this workspace.
- `README.md` remains modified by walkthrough-1.
- `.gitignore` remains modified by walkthrough-2 and `.claude/` tracking.
- No branch, commit, push, PR, label, GitHub App, or repository secret was created by this repair session.
- The current remote default is still `origin/main`; event-driven Agent workflows are not active from `dev` yet.
