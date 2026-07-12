#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { requiresProjectVerification } from "./classify-verification.mjs";
import { validate as validateIssue } from "./validate-issue.mjs";
import { readHandoffMetadata } from "./read-handoff-metadata.mjs";

const root = process.cwd();
const fixtures = resolve(root, ".agents/scripts/__fixtures__");
const temp = mkdtempSync(join(tmpdir(), "trek-agent-contracts-"));
const failures = [];

function run(name, script, args, expectedStatus) {
  const result = spawnSync(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== expectedStatus) {
    failures.push(
      `${name}: expected exit ${expectedStatus}, got ${result.status}\n${result.stdout}${result.stderr}`
    );
  } else {
    console.log(`PASS ${name}`);
  }
}

function workflowJob(source, name) {
  const marker = `  ${name}:\n`;
  const start = source.indexOf(marker);
  if (start === -1) return "";
  const remainder = source.slice(start + marker.length);
  const nextJob = remainder.search(/\n  [a-zA-Z0-9_-]+:\n/);
  return source.slice(
    start,
    nextJob === -1 ? source.length : start + marker.length + nextJob
  );
}

function workflowStep(source, name) {
  const marker = `      - name: ${name}`;
  const start = source.indexOf(marker);
  if (start === -1) return "";
  const nextStep = source.indexOf("\n      - name:", start + marker.length);
  return source.slice(start, nextStep === -1 ? source.length : nextStep);
}

try {
  for (const workflow of ["ai-plan-approval.yml", "ai-repair.yml"]) {
    const source = readFileSync(
      resolve(root, ".github/workflows", workflow),
      "utf8"
    );
    if (!source.includes("actorType !== 'User'")) {
      failures.push(`${workflow}: approval must require a GitHub User actor`);
    } else {
      console.log(`PASS human-only approval: ${workflow}`);
    }
  }

  for (const [workflow, jobName, stepName] of [
    ["ai-plan.yml", "plan", "Generate plan with Claude Code"],
    ["ai-review.yml", "review", "Review with Claude Code"],
  ]) {
    const source = readFileSync(
      resolve(root, ".github/workflows", workflow),
      "utf8"
    );
    const requiredProviderConfiguration = [
      "secrets.DEEPSEEK_API_KEY",
      "ANTHROPIC_BASE_URL: https://api.deepseek.com/anthropic",
      "--model deepseek-v4-pro",
    ];
    const missing = requiredProviderConfiguration.filter(
      (value) => !source.includes(value)
    );
    if (missing.length > 0 || source.includes("secrets.ANTHROPIC_API_KEY")) {
      failures.push(
        `${workflow}: invalid DeepSeek provider configuration; missing ${missing.join(", ") || "none"}`
      );
    } else {
      console.log(`PASS DeepSeek provider: ${workflow}`);
    }

    const claudeJob = workflowJob(source, jobName);
    const permissionsStart = claudeJob.indexOf("\n    permissions:\n");
    const stepsStart = claudeJob.indexOf("\n    steps:\n", permissionsStart);
    const permissions =
      permissionsStart === -1 || stepsStart === -1
        ? ""
        : claudeJob.slice(permissionsStart, stepsStart);
    const claudeStep = workflowStep(claudeJob, stepName);
    if (!claudeStep.includes("github_token: ${{ github.token }}")) {
      failures.push(
        `${workflow}: ${stepName} must receive the read-only workflow token`
      );
    } else if (permissions.includes("\n      id-token: write")) {
      failures.push(
        `${workflow}: ${jobName} job must not grant unused OIDC access`
      );
    } else {
      console.log(
        `PASS explicit Claude workflow token: ${workflow} ${jobName} job`
      );
    }

    if (
      workflow === "ai-review.yml" &&
      !claudeStep.includes('allowed_bots: "godot-agent-bot[bot]"')
    ) {
      failures.push(
        "ai-review.yml: independent review must allow the App bot that creates agent PRs"
      );
    } else if (workflow === "ai-review.yml") {
      console.log("PASS independent review App bot allowlist: ai-review.yml");
    }
  }

  for (const [workflow, stepName] of [
    ["ai-implement.yml", "Run implementation with DeepSeek Claude Code"],
    ["ai-repair.yml", "Run repair with DeepSeek Claude Code"],
  ]) {
    const source = readFileSync(
      resolve(root, ".github/workflows", workflow),
      "utf8"
    );
    const generateJob = workflowJob(source, "generate");
    const providerStep = workflowStep(generateJob, stepName);
    const requiredProviderConfiguration = [
      "anthropics/claude-code-action@e90deca47693f9457b72f2b53c17d7c445a87342",
      "ANTHROPIC_BASE_URL: https://api.deepseek.com/anthropic",
      "secrets.DEEPSEEK_API_KEY",
      "github_token: ${{ github.token }}",
      'allowed_bots: "godot-agent-bot[bot]"',
      "track_progress: false",
      "--model deepseek-v4-pro",
      '--allowedTools "Read,Glob,Grep,Edit,Write"',
      '--disallowedTools "Bash,NotebookEdit,WebFetch,WebSearch,TaskOutput,KillTask"',
      "--json-schema",
    ];
    const missing = requiredProviderConfiguration.filter(
      (value) => !providerStep.includes(value)
    );
    if (
      missing.length > 0 ||
      !generateJob.includes("\n      issues: read") ||
      source.includes("secrets.OPENAI_API_KEY") ||
      source.includes("openai/codex-action")
    ) {
      failures.push(
        `${workflow}: invalid DeepSeek implementation provider; missing ${missing.join(", ") || "none"}`
      );
    } else {
      console.log(
        `PASS constrained DeepSeek implementation provider: ${workflow}`
      );
    }
  }

  const providerPolicy = JSON.parse(
    readFileSync(resolve(root, ".agents/policy.json"), "utf8")
  );
  for (const phase of ["implementation", "repair"]) {
    const provider = providerPolicy.model_providers?.[phase];
    if (
      providerPolicy.execution?.implementation_provider !==
        "claude-code-deepseek" ||
      provider?.runtime !== "claude-code-action" ||
      provider?.platform !== "deepseek" ||
      provider?.api_protocol !== "anthropic-compatible" ||
      provider?.endpoint !== "https://api.deepseek.com/anthropic" ||
      provider?.model !== "deepseek-v4-pro" ||
      provider?.secret_name !== "DEEPSEEK_API_KEY"
    ) {
      failures.push(`policy.json: invalid ${phase} provider declaration`);
    } else {
      console.log(`PASS DeepSeek ${phase} provider policy`);
    }
  }

  for (const [name, paths, expected] of [
    ["docs-only", ["docs/agent-workflow-smoke-test.md"], false],
    ["wiki-only", ["wiki/README.md"], false],
    ["root readme", ["README.md"], false],
    ["application source", ["server/src/index.ts"], true],
    ["dependency manifest", ["package-lock.json"], true],
    ["mixed scope", ["docs/guide.md", "client/src/App.tsx"], true],
    ["empty scope fails closed", [], true],
  ]) {
    if (requiresProjectVerification(paths) !== expected) {
      failures.push(`verification classifier misclassified ${name}`);
    } else {
      console.log(`PASS verification classifier: ${name}`);
    }
  }

  for (const workflow of ["ai-implement.yml", "ai-repair.yml"]) {
    const source = readFileSync(
      resolve(root, ".github/workflows", workflow),
      "utf8"
    );
    const verificationRequirements = [
      "git add -N --all",
      "node .agents/scripts/classify-verification.mjs",
      'echo "project_verification=$project_verification"',
      "if: steps.apply.outputs.project_verification == 'true'",
      "PROJECT_VERIFICATION: ${{ steps.apply.outputs.project_verification }}",
      'if [ "$PROJECT_VERIFICATION" != "true" ]',
      'echo "passed=true" >> "$GITHUB_OUTPUT"',
    ];
    const missing = verificationRequirements.filter(
      (value) => !source.includes(value)
    );
    if (missing.length > 0) {
      failures.push(
        `${workflow}: incomplete path-aware verification; missing ${missing.join(", ")}`
      );
    } else {
      console.log(`PASS path-aware verification: ${workflow}`);
    }
  }

  for (const [workflow, stepName] of [
    ["ai-implement.yml", "Apply and inspect candidate patch"],
    ["ai-repair.yml", "Inspect repair"],
  ]) {
    const source = readFileSync(
      resolve(root, ".github/workflows", workflow),
      "utf8"
    );
    const policyJob = workflowJob(source, "policy-check");
    const inspectStep = workflowStep(policyJob, stepName);
    const intentToAdd = inspectStep.indexOf("git add -N --all");
    const changedFilesRead = inspectStep.indexOf(
      "git diff --no-renames --name-only"
    );
    if (
      intentToAdd === -1 ||
      changedFilesRead === -1 ||
      intentToAdd > changedFilesRead
    ) {
      failures.push(
        `${workflow}: Scope Guard must expose new files before reading changed paths`
      );
    } else {
      console.log(`PASS Scope Guard new-file detection: ${workflow}`);
    }
  }

  const implementWorkflow = readFileSync(
    resolve(root, ".github/workflows/ai-implement.yml"),
    "utf8"
  );
  const implementPublishJob = workflowJob(implementWorkflow, "publish");
  const downloadApprovedContextStep = workflowStep(
    implementPublishJob,
    "Download approved context"
  );
  if (
    !downloadApprovedContextStep.includes(
      "uses: actions/download-artifact@v5"
    ) ||
    !downloadApprovedContextStep.includes(
      "name: approved-context-${{ needs.preflight.outputs.issue_number }}"
    ) ||
    !downloadApprovedContextStep.includes("path: /tmp/approved-context")
  ) {
    failures.push(
      "ai-implement.yml: publish job must download the approved context it consumes"
    );
  } else {
    console.log(
      "PASS approved context download: ai-implement.yml publish job"
    );
  }
  const downloadVerificationStep = workflowStep(
    implementPublishJob,
    "Download verification evidence"
  );
  const createImplementationStep = workflowStep(
    implementPublishJob,
    "Create implementation commit and push branch"
  );
  if (
    !downloadVerificationStep.includes(
      "name: verification-results-${{ needs.preflight.outputs.issue_number }}"
    ) ||
    !downloadVerificationStep.includes("path: /tmp/verification") ||
    !createImplementationStep.includes("git add -N --all") ||
    !createImplementationStep.includes(
      'readFileSync("/tmp/verification/results.json", "utf8")'
    )
  ) {
    failures.push(
      "ai-implement.yml: publish job must preserve new-file and verification evidence"
    );
  } else {
    console.log("PASS implementation audit evidence: ai-implement.yml");
  }

  const reviewWorkflow = readFileSync(
    resolve(root, ".github/workflows/ai-review.yml"),
    "utf8"
  );
  const reviewFailureJob = workflowJob(
    reviewWorkflow,
    "report-review-failure"
  );
  if (
    !reviewFailureJob.includes("needs.review.result == 'failure'") ||
    !reviewFailureJob.includes("name: 'ai:reviewing'") ||
    !reviewFailureJob.includes("labels: ['ai:blocked']") ||
    !reviewFailureJob.includes("No findings were published")
  ) {
    failures.push(
      "ai-review.yml: provider failures must block the task without publishing findings"
    );
  } else {
    console.log("PASS independent review failure state convergence");
  }

  const planWorkflow = readFileSync(
    resolve(root, ".github/workflows/ai-plan.yml"),
    "utf8"
  );
  const publishJob = workflowJob(planWorkflow, "publish");
  const downloadCandidateStep = workflowStep(
    publishJob,
    "Download validated candidate"
  );
  if (
    !downloadCandidateStep.includes("uses: actions/download-artifact@v5") ||
    !downloadCandidateStep.includes("path: .agents/handoff")
  ) {
    failures.push(
      "ai-plan.yml: publish job must download the candidate into .agents/handoff"
    );
  } else {
    console.log("PASS plan artifact download path: ai-plan.yml publish job");
  }

  const planRevalidationStep = workflowStep(planWorkflow, "Revalidate candidate");
  const approvalWorkflow = readFileSync(
    resolve(root, ".github/workflows/ai-plan-approval.yml"),
    "utf8"
  );
  const approvalDigestStep = workflowStep(
    approvalWorkflow,
    "Validate plan and recompute digest"
  );
  const metadataReader = "node .agents/scripts/read-handoff-metadata.mjs";
  if (
    !planRevalidationStep.includes(
      `${metadataReader} "$handoff" "Planning base SHA"`
    ) ||
    !planRevalidationStep.includes(`${metadataReader} "$handoff" "Plan digest"`) ||
    !approvalDigestStep.includes(
      `${metadataReader} /tmp/approved-handoff.md "Plan digest"`
    ) ||
    planRevalidationStep.includes("sed -n") ||
    approvalDigestStep.includes("sed -n")
  ) {
    failures.push(
      "plan workflows must read authoritative values from the Metadata section"
    );
  } else {
    console.log("PASS scoped handoff metadata readers: plan publish and approval");
  }

  const duplicateMetadataPath = join(temp, "duplicate-metadata.md");
  const authoritativeDigest = "a".repeat(64);
  const authoritativeBase = "3db2495bcdcb1da300ca6430e0e3419a7650fb89";
  const handoffWithDuplicateMetadata = readFileSync(
    resolve(root, ".agents/handoff/issue-walkthrough-2.md"),
    "utf8"
  )
    .replace("- Plan digest:\n", `- Plan digest: ${authoritativeDigest}\n`)
    .concat(
      "\n## Duplicate Metadata-like Facts\n\n",
      "- Planning base SHA: deadbeef\n",
      "- Plan digest: wrong\n"
  );
  writeFileSync(duplicateMetadataPath, handoffWithDuplicateMetadata);
  if (
    readHandoffMetadata(duplicateMetadataPath, "Planning base SHA") !==
      authoritativeBase ||
    readHandoffMetadata(duplicateMetadataPath, "Plan digest") !==
      authoritativeDigest
  ) {
    failures.push("metadata reader accepted a duplicate value outside Metadata");
  } else {
    console.log("PASS metadata reader ignores duplicates outside Metadata");
  }

  const triageWorkflow = readFileSync(
    resolve(root, ".github/workflows/ai-issue-triage.yml"),
    "utf8"
  );
  const revalidateStep = workflowStep(triageWorkflow, "Re-validate fixed issue");
  const admissionStep = workflowStep(triageWorkflow, "Process maintainer admission");
  const admissionRiskRequirements = [
    "const validation = JSON.parse(fs.readFileSync('result.json', 'utf8'))[0];",
    "const declaredRisk = validation.risk;",
    "if (declaredRisk === 'risk:high')",
  ];
  const missingAdmissionRiskRequirements = admissionRiskRequirements.filter(
    (value) => !admissionStep.includes(value)
  );
  const triageRequirements = [
    "group: ai-issue-triage-${{ github.event.issue.number }}",
    "cancel-in-progress: false",
    "Issue is no longer in triage. Ignoring stale delivery.",
    "Issue is no longer in a validation phase. Ignoring stale delivery.",
    "Issue is no longer awaiting information. Ignoring stale delivery.",
    "const risk = validation.risk;",
    "Risk label already synchronized to ${risk}.",
  ];
  const missingTriageRequirements = triageRequirements.filter(
    (value) => !triageWorkflow.includes(value)
  );
  const currentIssueReads = triageWorkflow.match(/github\.rest\.issues\.get/g) || [];
  const labelRemovals = triageWorkflow.match(
    /github\.rest\.issues\.removeLabel/g
  ) || [];
  const tolerantRemovals = triageWorkflow.match(
    /catch\(error => \{ if \(error\.status !== 404\) throw error; \}\);/g
  ) || [];
  if (
    missingTriageRequirements.length > 0 ||
    missingAdmissionRiskRequirements.length > 0 ||
    revalidateStep.includes("declaredRisk") ||
    currentIssueReads.length < 5 ||
    labelRemovals.length !== tolerantRemovals.length
  ) {
    failures.push(
      `ai-issue-triage.yml: missing concurrency/idempotency safeguards; missing ${[
        ...missingTriageRequirements,
        ...missingAdmissionRiskRequirements,
      ].join(", ") || "none"}; admission risk leaked into re-validation: ${revalidateStep.includes("declaredRisk")}`
    );
  } else {
    console.log("PASS triage concurrency and idempotency safeguards");
  }

  run(
    "valid issue",
    ".agents/scripts/validate-issue.mjs",
    [join(fixtures, "valid-low-risk.json")],
    0
  );
  const highRiskIssue = JSON.parse(
    readFileSync(join(fixtures, "valid-high-risk.json"), "utf8")
  );
  const highRiskOutput = validateIssue(highRiskIssue);
  if (highRiskOutput.valid !== true || highRiskOutput.risk !== "risk:high") {
    failures.push("valid high-risk classification: expected valid risk:high output");
  } else {
    console.log("PASS valid high-risk classification");
  }
  for (const file of [
    "missing-goal.json",
    "blank-goal.json",
    "unchecked-scope.json",
    "missing-scope-ack.json",
  ]) {
    run(
      `invalid issue: ${file}`,
      ".agents/scripts/validate-issue.mjs",
      [join(fixtures, file)],
      1
    );
  }
  const missingDiscussion = JSON.parse(
    readFileSync(join(fixtures, "valid-low-risk.json"), "utf8")
  );
  missingDiscussion.body = missingDiscussion.body.replace(
    /### Discussion or Approval Reference\n\n[^\n]+/,
    "### Discussion or Approval Reference\n\n_No response_"
  );
  const missingDiscussionPath = join(temp, "missing-discussion.json");
  writeFileSync(missingDiscussionPath, JSON.stringify(missingDiscussion));
  run(
    "missing discussion reference",
    ".agents/scripts/validate-issue.mjs",
    [missingDiscussionPath],
    1
  );

  function blankSection(issue, heading) {
    const copy = structuredClone(issue);
    const sectionPattern = new RegExp(
      `(### ${heading}[^\\n]*\\n)[\\s\\S]*?(?=\\n### |$)`
    );
    copy.body = copy.body.replace(sectionPattern, `$1\n`);
    return copy;
  }

  for (const [heading, name] of [
    ["Acceptance Criteria", "blank acceptance criteria"],
    ["Discussion or Approval Reference", "blank discussion reference"],
  ]) {
    const blankPath = join(temp, `${name.replaceAll(" ", "-")}.json`);
    const validIssue = JSON.parse(
      readFileSync(join(fixtures, "valid-low-risk.json"), "utf8")
    );
    writeFileSync(blankPath, JSON.stringify(blankSection(validIssue, heading)));
    run(name, ".agents/scripts/validate-issue.mjs", [blankPath], 1);
  }

  for (const handoff of ["issue-walkthrough-1.md", "issue-walkthrough-2.md"]) {
    run(
      `valid handoff: ${handoff}`,
      ".agents/scripts/validate-handoff.mjs",
      [resolve(root, ".agents/handoff", handoff)],
      0
    );
  }

  run(
    "valid approval binding",
    ".agents/scripts/validate-approval.mjs",
    [
      resolve(root, ".agents/handoff/issue-walkthrough-2.md"),
      join(fixtures, "approval-valid.json"),
    ],
    0
  );
  const mismatchedApproval = JSON.parse(
    readFileSync(join(fixtures, "approval-valid.json"), "utf8")
  );
  mismatchedApproval.plan_digest = "0".repeat(64);
  const mismatchPath = join(temp, "approval-mismatch.json");
  writeFileSync(mismatchPath, JSON.stringify(mismatchedApproval));
  run(
    "approval digest mismatch",
    ".agents/scripts/validate-approval.mjs",
    [resolve(root, ".agents/handoff/issue-walkthrough-2.md"), mismatchPath],
    1
  );

  const implementationFactsPath = join(temp, "implementation-facts.json");
  const finalizedHandoffPath = join(temp, "finalized-handoff.md");
  const validApproval = JSON.parse(
    readFileSync(join(fixtures, "approval-valid.json"), "utf8")
  );
  writeFileSync(
    implementationFactsPath,
    JSON.stringify({
      issue_number: "walkthrough-2",
      plan_sha: validApproval.plan_sha,
      plan_digest: validApproval.plan_digest,
      approver: validApproval.approver,
      approved_at: validApproval.timestamp,
      branch: "ai/walkthrough-2-handoff-gitignore",
      changed_files: [".gitignore"],
      verification: {
        tests: "skipped",
        lint: "skipped",
        format: "skipped",
        reason: "documentation-only change",
      },
    })
  );
  run(
    "finalize implementation handoff",
    ".agents/scripts/finalize-implementation-handoff.mjs",
    [
      resolve(root, ".agents/handoff/issue-walkthrough-2.md"),
      implementationFactsPath,
      finalizedHandoffPath,
    ],
    0
  );
  run(
    "finalized handoff remains valid",
    ".agents/scripts/validate-handoff.mjs",
    [finalizedHandoffPath],
    0
  );
  run(
    "finalized handoff preserves approval digest",
    ".agents/scripts/validate-approval.mjs",
    [finalizedHandoffPath, join(fixtures, "approval-valid.json")],
    0
  );
  const finalizedHandoff = readFileSync(finalizedHandoffPath, "utf8");
  if (
    !finalizedHandoff.includes("- `.gitignore`") ||
    !finalizedHandoff.includes(
      "| `npm test` | skipped | documentation-only change |"
    ) ||
    finalizedHandoff.includes(
      "| `npm test` | passed | Authoritative credential-free verification job |"
    )
  ) {
    failures.push(
      "finalized handoff must record actual changed files and verification outcomes"
    );
  } else {
    console.log("PASS finalized handoff audit evidence");
  }

  run(
    "normal scope",
    ".agents/scripts/scope-guard.mjs",
    [
      ".agents/policy.json",
      join(fixtures, "changed-files-normal.json"),
      "--lines",
      "100",
    ],
    0
  );
  run(
    "protected path rejection",
    ".agents/scripts/scope-guard.mjs",
    [
      ".agents/policy.json",
      join(fixtures, "changed-files-protected.json"),
      "--lines",
      "100",
    ],
    1
  );
  run(
    "changed-line limit",
    ".agents/scripts/scope-guard.mjs",
    [
      ".agents/policy.json",
      join(fixtures, "changed-files-normal.json"),
      "--lines",
      "1201",
    ],
    1
  );

  const exactHandoff = join(temp, "exact-handoff.json");
  const otherHandoff = join(temp, "other-handoff.json");
  writeFileSync(exactHandoff, JSON.stringify([".agents/handoff/issue-42.md"]));
  writeFileSync(otherHandoff, JSON.stringify([".agents/handoff/issue-43.md"]));
  run(
    "exact generated handoff exception",
    ".agents/scripts/scope-guard.mjs",
    [".agents/policy.json", exactHandoff, "--lines", "10", "--issue-number", "42"],
    0
  );
  run(
    "other handoff remains protected",
    ".agents/scripts/scope-guard.mjs",
    [".agents/policy.json", otherHandoff, "--lines", "10", "--issue-number", "42"],
    1
  );

  const invalidScope = join(temp, "invalid-scope.json");
  writeFileSync(invalidScope, "{}");
  run(
    "invalid approved scope fails closed",
    ".agents/scripts/scope-guard.mjs",
    [
      ".agents/policy.json",
      join(fixtures, "changed-files-normal.json"),
      "--lines",
      "100",
      "--scope",
      invalidScope,
    ],
    1
  );
  const scopedFiles = join(temp, "scoped-files.json");
  const globScope = join(temp, "glob-scope.json");
  writeFileSync(scopedFiles, JSON.stringify(["server/src/app.ts"]));
  writeFileSync(globScope, JSON.stringify({ declared: ["server/**"] }));
  run(
    "approved path glob",
    ".agents/scripts/scope-guard.mjs",
    [
      ".agents/policy.json",
      scopedFiles,
      "--lines",
      "20",
      "--scope",
      globScope,
    ],
    0
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}

console.log("All agent workflow contract tests passed.");
