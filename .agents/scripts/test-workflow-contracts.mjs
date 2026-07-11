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

  for (const workflow of ["ai-plan.yml", "ai-review.yml"]) {
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
  }

  run(
    "valid issue",
    ".agents/scripts/validate-issue.mjs",
    [join(fixtures, "valid-low-risk.json")],
    0
  );
  for (const file of ["missing-goal.json", "unchecked-scope.json", "missing-scope-ack.json"]) {
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
