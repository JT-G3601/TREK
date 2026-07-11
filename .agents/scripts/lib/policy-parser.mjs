/**
 * Policy parser — loads and validates .agents/policy.yml.
 *
 * Fail-closed: any missing, unreadable, or invalid policy returns
 * { valid: false, errors: [...] } and the caller must reject the operation.
 */

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { resolve, normalize } from "node:path";

const POLICY_PATH = ".agents/policy.yml";

/**
 * Normalize a glob-like path pattern to POSIX with no trailing slash.
 * Used for comparison between policy patterns and actual changed paths.
 */
export function normalizePath(p) {
  return normalize(p).replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Load and validate policy.yml. Returns { policy, errors }.
 * errors is empty on success. Caller must check policy.valid.
 */
export function loadPolicy(repoRoot, policyPath) {
  const errors = [];
  const policyFile = policyPath ?? resolve(repoRoot, POLICY_PATH);

  let raw;
  try {
    raw = readFileSync(policyFile, "utf-8");
  } catch {
    return {
      policy: null,
      errors: [`Policy file not found or unreadable: ${policyFile}`],
    };
  }

  let policy;
  try {
    policy = parseYaml(raw);
  } catch (e) {
    return {
      policy: null,
      errors: [`Policy file is not valid YAML: ${e.message}`],
    };
  }

  // Schema version check
  if (!policy || typeof policy !== "object") {
    return {
      policy: null,
      errors: ["Policy file is empty or not an object."],
    };
  }
  if (policy.version !== 1) {
    errors.push(
      `Unsupported policy version '${policy.version}'. Expected version 1.`
    );
  }

  // Required top-level keys
  const requiredKeys = [
    "repository",
    "contribution",
    "approval",
    "execution",
    "limits",
    "protected_paths",
    "release",
  ];
  for (const key of requiredKeys) {
    if (!(key in policy)) {
      errors.push(`Policy is missing required key '${key}'.`);
    }
  }

  // Validate limits
  if (policy.limits) {
    if (typeof policy.limits.max_changed_files !== "number" || policy.limits.max_changed_files < 1) {
      errors.push("limits.max_changed_files must be a positive integer.");
    }
    if (typeof policy.limits.max_changed_lines !== "number" || policy.limits.max_changed_lines < 1) {
      errors.push("limits.max_changed_lines must be a positive integer.");
    }
    if (typeof policy.limits.max_repair_rounds !== "number" || policy.limits.max_repair_rounds < 1) {
      errors.push("limits.max_repair_rounds must be a positive integer.");
    }
  }

  // Validate protected_paths is an array
  if (!Array.isArray(policy.protected_paths)) {
    errors.push("protected_paths must be an array.");
  }

  return {
    policy: {
      ...policy,
      _valid: errors.length === 0,
      _errors: errors,
    },
    errors,
  };
}

/**
 * Check if a given repository-relative POSIX path matches any
 * of the glob patterns in the protected_paths list.
 *
 * Supports:
 *   - `**` matches any number of path segments
 *   - `*` matches within a single segment
 *   - Exact match and prefix match
 */
export function isProtected(normalizedPath, patterns) {
  const path = normalizePath(normalizedPath);
  for (const pattern of patterns) {
    if (matchGlob(path, normalizePath(pattern))) {
      return true;
    }
  }
  return false;
}

/**
 * Simple glob matching for protected path patterns.
 * Handles `**`, `*`, and literal segments.
 */
function matchGlob(path, pattern) {
  const pathSegs = path.split("/").filter(Boolean);
  const patSegs = pattern.split("/").filter(Boolean);

  // Empty pattern should not match anything
  if (patSegs.length === 0) return false;

  return matchSegments(pathSegs, patSegs, 0, 0);
}

function matchSegments(pathSegs, patSegs, pi, pj) {
  // Both exhausted = match
  if (pi >= pathSegs.length && pj >= patSegs.length) return true;
  // Pattern exhausted but path not = no match (unless last was **)
  if (pj >= patSegs.length) return false;
  // Path exhausted — only match if remaining patterns are all **
  if (pi >= pathSegs.length) {
    return patSegs.slice(pj).every((s) => s === "**");
  }

  const seg = patSegs[pj];

  if (seg === "**") {
    // ** matches zero or more segments
    return (
      matchSegments(pathSegs, patSegs, pi, pj + 1) || // zero
      matchSegments(pathSegs, patSegs, pi + 1, pj) || // one
      matchSegments(pathSegs, patSegs, pi + 1, pj + 1) // one and advance
    );
  }

  if (seg === "*") {
    // * matches exactly one segment (any content)
    return matchSegments(pathSegs, patSegs, pi + 1, pj + 1);
  }

  // Literal segment match (case-sensitive)
  if (pathSegs[pi] === seg) {
    return matchSegments(pathSegs, patSegs, pi + 1, pj + 1);
  }

  // Try simple wildcard within segment: e.g. "*secret*" matches "my-secret-file"
  if (seg.includes("*")) {
    const regex = new RegExp(
      "^" + seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*") + "$"
    );
    if (regex.test(pathSegs[pi])) {
      return matchSegments(pathSegs, patSegs, pi + 1, pj + 1);
    }
  }

  return false;
}
