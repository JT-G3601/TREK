# GitHub App Setup Guide

## Purpose

The TREK agent workflow requires a dedicated GitHub App for automated PR creation with CI trigger capability (avoiding the GITHUB_TOKEN manual-approval fallback).

## Step 1: Create the GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
2. Configure:

| Field | Value |
|-------|-------|
| GitHub App name | `TREK Agent Workflow` (or similar) |
| Homepage URL | `https://github.com/JT-G3601/TREK` |
| Webhook | Uncheck **Active** (workflows use event triggers, not webhooks) |

## Step 2: Set Permissions

### Repository Permissions

| Permission | Level | Reason |
|------------|-------|--------|
| Contents | Read & Write | Create branches, push commits |
| Issues | Read & Write | Read issue content, add labels, comment |
| Pull Requests | Read & Write | Create Draft PRs, update PR state |
| Checks | Read & Write | Create approval check records |
| Metadata | Read | Mandatory (auto-granted) |

### No other permissions

Do NOT grant permissions for: Administration, Environments, Secrets, Actions, Webhooks, Deployments, Pages, Packages, Organizations.

## Step 3: Install the App

1. After creation, go to **Install App**
2. Select **Only select repositories** → `JT-G3601/TREK`
3. Click **Install**

## Step 4: Generate Private Key

1. In the App settings, go to **Private keys**
2. Click **Generate a private key**
3. Save the `.pem` file securely (it cannot be recovered)

## Step 5: Store Secrets in Repository

Add these secrets to `JT-G3601/TREK` (**Settings → Secrets and variables → Actions**):

| Secret Name | Value |
|-------------|-------|
| `AGENT_APP_ID` | The App ID (numeric, from App settings page) |
| `AGENT_APP_PRIVATE_KEY` | Full contents of the `.pem` file |
| `OPENAI_API_KEY` | API key consumed only by `openai/codex-action` through its protected proxy |
| `DEEPSEEK_API_KEY` | DeepSeek API key consumed only by the read-only Claude Code planning/review jobs |

Planning and review use Claude Code as the agent runtime with DeepSeek V4 Pro as
the model backend through `https://api.deepseek.com/anthropic`. The workflows
pass the Secret through the action's `anthropic_api_key` compatibility input;
the Secret itself remains named `DEEPSEEK_API_KEY` to identify its real issuer.

## Step 6: Record Configuration

After setup, update `.agents/policy.yml`:

```yaml
approval:
  expected_app_slug: "<your-app-slug>"  # e.g., "trek-agent-workflow"
```

The configured slug must exactly match the `app.slug` GitHub returns for checks
created by this installation. Approval validation fails closed on any mismatch.

## Verification

After configuration, publisher and state-controller jobs generate short-lived App tokens:

```yaml
- name: Generate App token
  id: app-token
  uses: actions/create-github-app-token@v2
  with:
    app-id: ${{ secrets.AGENT_APP_ID }}
    private-key: ${{ secrets.AGENT_APP_PRIVATE_KEY }}
```

## Fallback: GITHUB_TOKEN Mode

The current workflows intentionally do not enable this fallback. To add it later,
implement and review a separate fail-closed path before changing policy. The
required behavior would be:

1. Set `.agents/policy.yml` → `execution.ci_trigger_mode: github-token`
2. Agent-created PRs will require maintainer to click **Approve workflows to run**
3. Issue will transition through `ai:ci-awaiting-approval` state
