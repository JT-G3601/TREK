#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { computePlanDigest } from "./lib/plan-digest.mjs";

const [inputPath, factsPath, outputPath] = process.argv.slice(2);
if (!inputPath || !factsPath || !outputPath) {
  console.error(
    "Usage: node finalize-implementation-handoff.mjs <approved.md> <facts.json> <output.md>"
  );
  process.exit(1);
}

try {
  const original = readFileSync(inputPath, "utf8");
  const facts = JSON.parse(readFileSync(factsPath, "utf8"));
  const originalDigest = computePlanDigest(original);
  if (originalDigest !== facts.plan_digest) {
    throw new Error("Approved handoff digest does not match implementation facts.");
  }

  let content = original;
  const metadata = {
    "Plan revision SHA": facts.plan_sha,
    "Approved plan SHA": facts.plan_sha,
    "Approved plan digest": facts.plan_digest,
    "Working branch": facts.branch,
    "Phase at last handoff commit": "ai:reviewing",
    "Plan approved by": facts.approver,
    "Plan approved at": facts.approved_at,
  };
  for (const [key, value] of Object.entries(metadata)) {
    content = content.replace(
      new RegExp(`^- ${escapeRegex(key)}:[ \\t]*.*$`, "m"),
      `- ${key}: ${value}`
    );
  }

  const changedFiles = [
    ...facts.changed_files.map((path) => `- \`${path}\``),
    `- \`.agents/handoff/issue-${facts.issue_number}.md\` (controller-generated execution record)`,
  ].join("\n");
  const verification = facts.verification;
  if (!verification || typeof verification !== "object") {
    throw new Error("Implementation facts are missing verification evidence.");
  }
  const verificationRows = [
    verificationRow("npm test", verification.tests, verification.reason),
    verificationRow("npm run lint", verification.lint, verification.reason),
    verificationRow(
      "npm run format:check",
      verification.format,
      verification.reason
    ),
    "| scope guard | passed | Protected paths, approved paths, file count, and line count |",
  ];
  content = replaceSection(content, "Changed Files", changedFiles);
  content = replaceSection(
    content,
    "Verification",
    [
      "| Command | Result | Notes |",
      "|---|---|---|",
      ...verificationRows,
    ].join("\n")
  );
  content = replaceSection(
    content,
    "Next Steps",
    "Existing CI runs on the Draft PR, followed by independent Claude review and human final review."
  );

  if (computePlanDigest(content) !== originalDigest) {
    throw new Error("Finalization changed approval-bearing plan content.");
  }
  writeFileSync(outputPath, content.endsWith("\n") ? content : `${content}\n`);
} catch (error) {
  console.error(`Cannot finalize handoff: ${error.message}`);
  process.exit(1);
}

function replaceSection(content, sectionName, body) {
  const heading = new RegExp(`(^## ${escapeRegex(sectionName)}\\s*$)`, "m");
  const match = content.match(heading);
  if (!match) throw new Error(`Missing section: ${sectionName}`);
  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const next = rest.match(/^##\s/m);
  const end = next ? start + next.index : content.length;
  return `${content.slice(0, start)}\n\n${body}\n\n${content.slice(end).replace(/^\s+/, "")}`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function verificationRow(command, result, reason) {
  if (result === 0) {
    return `| \`${command}\` | passed | Authoritative credential-free verification job |`;
  }
  if (result === "skipped" && typeof reason === "string" && reason.trim()) {
    return `| \`${command}\` | skipped | ${reason.trim()} |`;
  }
  throw new Error(`Invalid verification result for ${command}.`);
}
