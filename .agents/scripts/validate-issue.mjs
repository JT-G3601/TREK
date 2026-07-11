#!/usr/bin/env node

/**
 * Deterministic issue validator for the TREK agent workflow.
 *
 * Usage:
 *   node validate-issue.mjs < issue.json
 *   node validate-issue.mjs path/to/issue.json
 *
 * Input: GitHub Issue JSON (from gh issue view --json or Actions event payload).
 * Output: JSON with { valid: boolean, errors: string[], warnings: string[] }.
 * Exit code: 0 if valid, 1 if validation errors found.
 *
 * Validates:
 *   - Required fields: goal, acceptance_criteria
 *   - Risk label validity
 *   - Scope acknowledgment
 *
 * Does NOT validate (these are Task 5 triage responsibilities):
 *   - Actor permissions
 *   - Duplicate state
 *   - Discussion reference authenticity
 */

import { readFileSync } from "node:fs";

// ── Constants ────────────────────────────────────────────────────────────────

const VALID_RISK_LABELS = new Set(["risk:low", "risk:medium", "risk:high"]);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract a field value from a GitHub issue body (form response).
 * GitHub issue forms produce body text like:
 *   ### Field Label\n\nvalue\n\n### Next Field
 */
function extractField(body, fieldLabel) {
  const lines = body.split(/\r?\n/);
  const expectedLabel = fieldLabel.trim().toLowerCase();
  let contentStart = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^###[ \t]+(.+?)[ \t]*$/);
    if (heading && heading[1].trim().toLowerCase() === expectedLabel) {
      contentStart = index + 1;
      break;
    }
  }

  if (contentStart === -1) return null;

  let contentEnd = lines.length;
  for (let index = contentStart; index < lines.length; index += 1) {
    if (/^###[ \t]+/.test(lines[index])) {
      contentEnd = index;
      break;
    }
  }

  return lines.slice(contentStart, contentEnd).join("\n").trim();
}

/**
 * Extract the selected option from a dropdown field.
 * GitHub formats dropdowns as: "### Risk Level\n\nrisk:low — documentation..."
 * The value is the raw option text including the label prefix.
 */
function extractDropdown(body, fieldLabel) {
  const raw = extractField(body, fieldLabel);
  if (!raw) return null;
  // The raw value might have the description after " — " — strip it to get the key
  const key = raw.split(" — ")[0].trim();
  return key;
}

/**
 * Check that a checkbox field was checked.
 * GitHub formats checkboxes as: "- [x] item description"
 */
function extractCheckbox(body, fieldLabel) {
  const section = extractField(body, fieldLabel);
  if (!section) return null;
  const checked = [];
  const unchecked = [];
  for (const line of section.split("\n")) {
    const match = line.match(/^-\s*\[([ xX])\]\s*(.+)/);
    if (match) {
      if (match[1].toLowerCase() === "x") {
        checked.push(match[2].trim());
      } else {
        unchecked.push(match[2].trim());
      }
    }
  }
  return { checked, unchecked };
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * @param {object} issue - GitHub Issue object
 * @param {number} issue.number
 * @param {string} issue.title
 * @param {string} issue.body
 * @param {Array<{name: string}>} issue.labels
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validate(issue) {
  const errors = [];
  const warnings = [];

  // 1. Check that the issue uses the agent task form
  //    (We can't directly detect the form, but we can check for the expected
  //     body structure — the preflight checklist heading is a good signal.)
  if (!issue.body || !issue.body.includes("Pre-flight checklist")) {
    errors.push(
      "Issue body does not appear to be from the Agent Task form. " +
        "Expected 'Pre-flight checklist' heading."
    );
    return { valid: false, errors, warnings };
  }

  const preflight = extractCheckbox(issue.body, "Pre-flight checklist");
  if (
    !preflight ||
    preflight.checked.length < 3 ||
    preflight.unchecked.length > 0
  ) {
    errors.push("Every Pre-flight checklist item must be checked.");
  }

  // 2. Required fields: goal
  const goal = extractField(issue.body, "Goal");
  if (!goal || goal === "_No response_" || goal.trim().length === 0) {
    errors.push("Required field 'Goal' is missing or empty.");
  }

  // 3. Required fields: acceptance criteria
  const ac = extractField(issue.body, "Acceptance Criteria");
  if (!ac || ac === "_No response_" || ac.trim().length === 0) {
    errors.push(
      "Required field 'Acceptance Criteria' is missing or empty."
    );
  }

  // 4. Risk label
  const riskValue = extractDropdown(issue.body, "Risk Level");
  if (!riskValue) {
    errors.push(
      "Required field 'Risk Level' is missing. Must be one of: " +
        [...VALID_RISK_LABELS].join(", ")
    );
  } else if (!VALID_RISK_LABELS.has(riskValue)) {
    errors.push(
      `Invalid risk value '${riskValue}'. Must be one of: ` +
        [...VALID_RISK_LABELS].join(", ")
    );
  }

  // 5. Scope acknowledgment
  const scopeAck = extractCheckbox(issue.body, "Scope Acknowledgment");
  if (
    !scopeAck ||
    scopeAck.checked.length === 0 ||
    scopeAck.unchecked.length > 0
  ) {
    errors.push(
      "Scope Acknowledgment checkbox must be checked. " +
        "Task must not involve auth, secrets, migrations, production config, " +
        "release versioning, or branch protection changes."
    );
  }

  // 6. Warnings (non-blocking)
  if (riskValue === "risk:high") {
    warnings.push(
      "This task is risk:high. It requires a human-authored plan " +
        "or must be marked ai:forbidden."
    );
  }

  const context = extractField(issue.body, "Context / Background");
  if (!context || context === "_No response_" || context.trim().length === 0) {
    warnings.push(
      "Field 'Context / Background' is empty. Context helps the planning agent."
    );
  }

  const discussionReference = extractField(
    issue.body,
    "Discussion or Approval Reference"
  );
  if (
    !discussionReference ||
    discussionReference === "_No response_" ||
    discussionReference.trim().length === 0
  ) {
    errors.push(
      "Field 'Discussion or Approval Reference' is required by repository policy."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Entry Point ──────────────────────────────────────────────────────────────

function main() {
  let input;

  // Read from file argument or stdin
  if (process.argv[2]) {
    input = readFileSync(process.argv[2], "utf-8");
  } else {
    // Read from stdin
    const fd = process.stdin.fd;
    // Node.js stdin handling
    try {
      input = readFileSync(fd, "utf-8");
    } catch {
      // fallback: try reading from /dev/stdin
      input = readFileSync("/dev/stdin", "utf-8");
    }
  }

  if (!input || input.trim().length === 0) {
    const result = {
      valid: false,
      errors: ["No input provided. Pipe a GitHub Issue JSON or pass a file path."],
      warnings: [],
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  /** @type {object|object[]} */
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch {
    const result = {
      valid: false,
      errors: ["Input is not valid JSON."],
      warnings: [],
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  // Support both single issue and array (gh issue list --json)
  const issues = Array.isArray(parsed) ? parsed : [parsed];
  const results = issues.map((issue) => {
    const result = validate(issue);
    return { issue: issue.number ?? issue.title ?? "unknown", ...result };
  });

  console.log(JSON.stringify(results, null, 2));

  const anyInvalid = results.some((r) => !r.valid);
  process.exit(anyInvalid ? 1 : 0);
}

main();
