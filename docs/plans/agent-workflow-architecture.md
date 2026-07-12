# Agent 工作流程架构图

本文展示 TREK 从 GitHub Issue 准入、计划审批、Codex 实现、Claude 独立审查，到人工合并 `dev` 的完整 Agent 工作流程及其权限边界。

```mermaid
flowchart TB
    Human["维护者<br/>准入 · 计划审批 · Repair 审批 · 最终 Review/Merge"]
    Issue["GitHub Agent Task Issue<br/>Goal · Acceptance Criteria · Risk · Discussion Ref"]

    subgraph ControlPlane["确定性控制平面 — GitHub App 短期 Token，无模型密钥"]
        Triage["Issue Triage<br/>字段校验 · Actor 权限 · Risk Gate · 状态迁移"]
        PlanPublisher["Plan Publisher<br/>Schema 校验 · Digest · Plan Commit"]
        Approval["Approval Controller<br/>Actor 权限 · SHA/Digest 绑定 · App-owned Check"]
        ImplPreflight["Implementation Preflight<br/>Repository · Admission · Fresh Base · Approval Check"]
        ImplPublisher["Implementation Publisher<br/>应用已验证 Patch · Commit · Draft PR"]
        ReviewGate["Review Gate<br/>同一 Head SHA · 适用 CI · dev Freshness"]
        FindingsPublisher["Findings Publisher<br/>校验 Reviewed SHA · 发布 Findings · 状态迁移"]
        RepairAuth["Repair Controller<br/>绑定 Review Comment · PR Head · Repair Round"]
        RepairPublisher["Repair Publisher<br/>应用已验证 Repair Patch · 更新 PR Branch"]
        Complete["Completion Controller<br/>Review Check 校验 · ai:done · 实现分支清理"]
        StateSync["State Sync<br/>异常检测 · Stale 警告 · 完成状态兜底"]
    end

    subgraph ModelZone["模型作业 — 无 Repository Write Token"]
        ClaudePlan["Claude Code Planning<br/>Read · Glob · Grep<br/>结构化 Plan 输出"]
        CodexImpl["Codex Implementation<br/>workspace-write Sandbox<br/>生成 Working-tree Patch"]
        ClaudeReview["Claude Code Review<br/>只读 Cold Start<br/>结构化 Findings"]
        CodexRepair["Codex Repair<br/>原计划 + 已批准 Findings<br/>生成 Repair Patch"]
    end

    subgraph VerifyZone["验证作业 — 无模型密钥，无 Repository Write Token"]
        Verify["Authoritative Verification<br/>npm test · lint · format:check"]
        Scope["Deterministic Scope Guard<br/>Approved Paths · Protected Paths<br/>Files/Lines Limits · Rename-safe"]
        RepairVerify["Repair Verification<br/>Tests · Lint · Format · Scope Guard"]
    end

    subgraph GitHubState["GitHub 持久状态与审计证据"]
        PlanBranch["ai-plan/&lt;issue&gt;-&lt;slug&gt;<br/>Immutable Handoff Commit"]
        ApprovalCheck["AI Plan Approval Check<br/>Plan SHA · Digest · Approver · App Slug"]
        DraftPR["ai/&lt;issue&gt;-&lt;slug&gt;<br/>Draft PR → dev<br/>Execution Handoff"]
        ExistingCI["TREK Existing CI<br/>Tests · Lint & Prettier · Required Checks"]
        ReviewCheck["AI Independent Review<br/>App-owned Required Check · Exact Head SHA<br/>Agent: pending → review · 普通 PR: success / N/A"]
        Ready["ai:ready-for-human"]
        Changes["ai:changes-requested"]
        Merged["Human-merged PR → dev"]
        Done["ai:done"]
    end

    Issue --> Triage
    Human -->|"添加 ai:admitted"| Triage
    Triage -->|"ai:planning"| ClaudePlan
    ClaudePlan -->|"结构化候选 Plan Artifact"| PlanPublisher
    PlanPublisher --> PlanBranch
    PlanPublisher -->|"ai:plan-ready"| Issue

    Human -->|"审查精确 SHA/Digest<br/>添加 ai:approved"| Approval
    PlanBranch --> Approval
    Approval --> ApprovalCheck
    Approval -->|"ai:implementing"| ImplPreflight

    PlanBranch --> ImplPreflight
    ApprovalCheck --> ImplPreflight
    ImplPreflight -->|"Immutable Approved Context"| CodexImpl
    CodexImpl -->|"Binary-capable Patch Artifact"| Verify
    CodexImpl -->|"同一 Patch Artifact"| Scope
    Verify -->|"Passed"| ImplPublisher
    Scope -->|"Passed"| ImplPublisher
    ImplPublisher --> DraftPR

    DraftPR --> ExistingCI
    ExistingCI --> ReviewGate
    DraftPR --> ReviewGate
    ReviewGate -->|"CI Passed + Head/Freshness Valid"| ClaudeReview
    ClaudeReview -->|"Structured Findings Artifact"| FindingsPublisher
    FindingsPublisher --> ReviewCheck
    FindingsPublisher -->|"无 Blocking Finding"| Ready
    FindingsPublisher -->|"存在 Blocking Finding"| Changes

    Human -->|"添加 ai:repair-approved"| RepairAuth
    Changes --> RepairAuth
    DraftPR --> RepairAuth
    RepairAuth -->|"Bound Repair Context"| CodexRepair
    CodexRepair -->|"Repair Patch"| RepairVerify
    RepairVerify -->|"Passed"| RepairPublisher
    RepairPublisher -->|"更新 Head，重新触发 CI"| DraftPR

    Ready -->|"人工最终 Review 与 Merge"| Human
    Human -->|"Merge approved PR"| Merged
    DraftPR --> Merged
    Merged --> Complete
    ReviewCheck --> Complete
    Complete --> Done
    Complete -->|"删除 ai/* 实现分支"| DraftPR
    StateSync -.-> Complete
    StateSync -.-> Issue
    StateSync -.-> DraftPR

    Main["main / Release Workflow<br/>生产发布边界"]
    Done -.->|"仅由维护者后续提升 dev → main"| Main

    classDef human fill:#fff2cc,stroke:#b8860b,color:#332600,stroke-width:2px;
    classDef controller fill:#d9eaf7,stroke:#2b6f9f,color:#102d40;
    classDef model fill:#eadcf8,stroke:#7653a6,color:#2e1f44;
    classDef verify fill:#dff2df,stroke:#3c8c4a,color:#17371d;
    classDef state fill:#f3f3f3,stroke:#666,color:#222;
    classDef release fill:#f8d7da,stroke:#a94442,color:#4d1918,stroke-width:2px;

    class Human human;
    class Triage,PlanPublisher,Approval,ImplPreflight,ImplPublisher,ReviewGate,FindingsPublisher,RepairAuth,RepairPublisher,Complete,StateSync controller;
    class ClaudePlan,CodexImpl,ClaudeReview,CodexRepair model;
    class Verify,Scope,RepairVerify verify;
    class Issue,PlanBranch,ApprovalCheck,DraftPR,ExistingCI,ReviewCheck,Ready,Changes,Merged,Done state;
    class Main release;
```

## 权限边界图例

| 区域 | 可用凭据 | 允许的主要操作 | 明确禁止 |
|---|---|---|---|
| 人类维护者 | GitHub 人类账户 | 准入、审批、最终 Review、Merge、发布提升 | Agent 代替人工批准 |
| 模型作业 | 对应模型 API 凭据 | 读取仓库、生成结构化输出或 Patch | Repository write token、状态迁移、Push、PR、Release |
| 验证作业 | 无模型密钥、无写 Token | 应用 Patch、执行测试、Scope Guard | 发布或修改 GitHub 状态 |
| 确定性控制器 | 短期 GitHub App token | 校验授权、提交已验证内容、创建 PR、迁移状态 | 执行生成代码、持有模型密钥、自动 Merge/Release |

## 核心安全不变量

1. 人工批准绑定精确的 Plan commit SHA 和规范化内容 digest。
2. 模型进程不能直接修改 GitHub 持久状态。
3. 测试进程拿不到模型密钥和仓库写凭据。
4. Publisher 只消费已通过 verification 与 scope guard 的 Patch，不执行生成代码。
5. Review findings 只对其记录的 PR head SHA 有效；Head 变化后必须重新 CI 和 Review。
6. Agent 流程止于 `dev` 的 Draft PR；`main` 与生产发布始终属于人工边界。
7. `dev` ruleset 必须要求由配置 App 创建的 `AI Independent Review` Check；Issue label 不是 Merge 门禁。
8. Handoff 是 Review 前的不可变实现快照；最终 Review、Merge 与完成证据位于 App Check、PR 评论和 Issue 完成评论。
9. Merge 后事件控制器立即收敛为 `ai:done` 并删除 `ai/*` 实现分支；`ai-plan/*` 按 policy 保留，State Sync 仅作兜底。
