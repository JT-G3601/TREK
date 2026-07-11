#!/usr/bin/env node

/**
 * Handoff validator — validates a handoff markdown file against the
 * schema defined in .agents/handoff/TEMPLATE.md.
 *
 * Usage:
 *   node validate-handoff.mjs path/to/issue-<number>.md
 *
 * Output: JSON { valid: boolean, errors: string[], warnings: string[] }
 * Exit: 0 if valid, 1 if errors found.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── Required and optional sections ───────────────────────────────────────────

const REQUIRED_SECTIONS = [
  "Goal",
  "Acceptance Criteria",
  "Constraints",
  "Repo Facts",
  "Decisions",
  "Implementation Plan",
  "Approved Paths",
];

const OPTIONAL_SECTIONS = [
  "Changed Files",
  "Verification",
  "Review Findings",
  "Open Issues",
  "Next Steps",
];

// Note: the colon is appended by the regex, so keys omit it
const REQUIRED_METADATA = [
  "Issue",
  "Base branch",
  "Phase at last handoff commit",
  "Risk level",
];

// ── Validation ───────────────────────────────────────────────────────────────

function validate(handoffPath) {
  const errors = [];
  const warnings = [];

  // 1. File exists
  const fullPath = resolve(handoffPath);
  if (!existsSync(fullPath)) {
    errors.push(`Handoff file not found: ${fullPath}`);
    return { valid: false, errors, warnings };
  }

  // 2. Read file
  let content;
  try {
    content = readFileSync(fullPath, "utf-8");
  } catch {
    errors.push(`Cannot read handoff file: ${fullPath}`);
    return { valid: false, errors, warnings };
  }

  if (content.trim().length === 0) {
    errors.push("Handoff file is empty.");
    return { valid: false, errors, warnings };
  }

  // 3. Check for metadata section
  if (!content.includes("## Metadata")) {
    errors.push("Missing '## Metadata' section.");
  }

  // 4. Check required metadata fields
  const metadataSection = extractSection(content, "Metadata");
  if (metadataSection) {
    for (const field of REQUIRED_METADATA) {
      if (!metadataSection.includes(field)) {
        errors.push(`Required metadata field '${field}' is missing.`);
      }
    }
  }

  // 5. Check required sections
  for (const section of REQUIRED_SECTIONS) {
    if (!hasSection(content, section)) {
      errors.push(`Required section '## ${section}' is missing.`);
    } else {
      const body = extractSection(content, section);
      if (!body || body.trim().length === 0 || isPlaceholder(body)) {
        errors.push(`Section '## ${section}' is empty or contains only placeholder text.`);
      }
    }
  }

  // 6. Warn about missing optional sections
  for (const section of OPTIONAL_SECTIONS) {
    if (!hasSection(content, section)) {
      warnings.push(`Optional section '## ${section}' is missing.`);
    }
  }

  // 7. Check for forbidden content (source dumps)
  if (content.length > 100_000) {
    warnings.push(
      "Handoff file exceeds 100 KB. Avoid copying complete source files or transcripts."
    );
  }

  // 8. Check fenced code block parity
  const fences = content.match(/^```/gm);
  if (fences && fences.length % 2 !== 0) {
    errors.push("Unbalanced fenced code blocks (odd number of ``` markers).");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasSection(content, sectionName) {
  const heading = new RegExp(`^##\\s+${escapeRegex(sectionName)}\\s*$`, "m");
  return heading.test(content);
}

function extractSection(content, sectionName) {
  const heading = new RegExp(`^##\\s+${escapeRegex(sectionName)}\\s*$`, "m");
  const match = content.match(heading);
  if (!match) return null;

  const start = match.index + match[0].length;
  const rest = content.slice(start);

  // Find the next heading at the same or higher level
  const nextHeading = rest.match(/^##\s/m);
  const end = nextHeading ? nextHeading.index : rest.length;

  return rest.slice(0, end).trim();
}

function isPlaceholder(body) {
  if (!body) return true;
  const trimmed = body.trim();
  if (trimmed === "_No response_" || trimmed === "N/A") return true;

  // Check if the body is only a template placeholder like "- [ ] Step 1"
  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 1 && lines[0].trim() === "- [ ] Step 1") return true;

  return false;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Entry Point ──────────────────────────────────────────────────────────────

function main() {
  const handoffPath = process.argv[2];
  if (!handoffPath) {
    console.log(
      JSON.stringify(
        {
          valid: false,
          errors: ["Usage: node validate-handoff.mjs <path-to-handoff.md>"],
          warnings: [],
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const result = validate(handoffPath);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}

main();
