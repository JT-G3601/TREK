#!/usr/bin/env node

/**
 * Approval validator — verifies that an approval record matches a plan revision.
 *
 * Usage:
 *   node validate-approval.mjs <handoff.md> <approval.json>
 *
 *   handoff.md:   The plan handoff with populated approved-plan fields.
 *   approval.json: The App-owned approval record:
 *     { plan_sha, plan_digest, approver, permission, timestamp, repository }
 *
 * Digest covers: schema version, issue number, repository, planning base SHA,
 *   Goal, Acceptance Criteria, Constraints, Decisions, Implementation Plan,
 *   and Approved Paths.
 *
 * Output: JSON { valid, errors[], computed_digest }
 * Exit: 0 if valid, 1 otherwise.
 */

import { readFileSync, existsSync } from "node:fs";
import {
  computePlanDigest,
  extractMetadata,
} from "./lib/plan-digest.mjs";

// ── Digest computation ───────────────────────────────────────────────────────

// ── Validation ───────────────────────────────────────────────────────────────

function validate(handoffPath, approvalPath) {
  const errors = [];

  // Read handoff
  if (!existsSync(handoffPath)) {
    errors.push(`Handoff file not found: ${handoffPath}`);
    return { valid: false, errors, computed_digest: null };
  }
  const handoffContent = readFileSync(handoffPath, "utf-8");

  // Read approval record
  if (!existsSync(approvalPath)) {
    errors.push(`Approval record not found: ${approvalPath}`);
    return { valid: false, errors, computed_digest: null };
  }

  let approval;
  try {
    approval = JSON.parse(readFileSync(approvalPath, "utf-8"));
  } catch {
    errors.push("Approval record is not valid JSON.");
    return { valid: false, errors, computed_digest: null };
  }

  // Compute digest from handoff content
  const computedDigest = computePlanDigest(handoffContent);

  // Check approval record structure
  if (!approval.plan_digest) {
    errors.push("Approval record is missing 'plan_digest'.");
  }
  if (!approval.plan_sha) {
    errors.push("Approval record is missing 'plan_sha'.");
  }
  if (!approval.approver) {
    errors.push("Approval record is missing 'approver'.");
  }
  if (!approval.repository) {
    errors.push("Approval record is missing 'repository'.");
  }
  if (!approval.permission || !["write", "maintain", "admin"].includes(approval.permission)) {
    errors.push("Approval record does not contain an authorized permission.");
  }
  if (!approval.app_slug) {
    errors.push("Approval record is missing 'app_slug'.");
  }

  const handoffRepository = extractMetadata(handoffContent, "Target repository");
  const handoffPlanDigest = extractMetadata(handoffContent, "Plan digest");
  if (approval.repository && approval.repository !== handoffRepository) {
    errors.push(
      `Repository mismatch. Handoff: ${handoffRepository}, approval: ${approval.repository}.`
    );
  }
  if (handoffPlanDigest && approval.plan_digest !== handoffPlanDigest) {
    errors.push("Approval digest does not match the digest recorded in the handoff.");
  }

  // Compare digests
  if (approval.plan_digest && computedDigest !== approval.plan_digest) {
    errors.push(
      `Digest mismatch. Computed: ${computedDigest.slice(0, 16)}..., ` +
        `Approved: ${approval.plan_digest.slice(0, 16)}...`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    computed_digest: computedDigest,
    approved_digest: approval.plan_digest ?? null,
  };
}

// ── Entry Point ──────────────────────────────────────────────────────────────

function main() {
  const handoffPath = process.argv[2];
  const approvalPath = process.argv[3];

  if (!handoffPath || !approvalPath) {
    console.log(
      JSON.stringify(
        {
          valid: false,
          errors: [
            "Usage: node validate-approval.mjs <handoff.md> <approval.json>",
          ],
          computed_digest: null,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const result = validate(handoffPath, approvalPath);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}

main();
