#!/usr/bin/env node

/**
 * Scope guard — enforces policy limits and protected paths on a proposed change.
 *
 * Usage:
 *   node scope-guard.mjs <policy.yml> <changed-files.json> [--lines <N>] [--scope <scope.json>] [--issue-number <N>]
 *
 *   changed-files.json: ["path/to/file1.ts", "path/to/file2.md"]
 *   --lines <N>: total changed lines (from git diff --stat)
 *   --scope <scope.json>: {"declared": ["file1.ts"], "source": "handoff"}
 *
 * Output: JSON { valid, errors[], protected[], exceeded_limits[] }
 * Exit: 0 if valid (passes all checks), 1 if any violation.
 *
 * Fail-closed: any error processing policy or inputs → invalid.
 */

import { readFileSync } from "node:fs";
import { normalize } from "node:path";

// ── Inlined from lib/policy-parser.mjs (avoid yaml dependency) ───────────────

function normalizePath(p) {
  return normalize(p).replace(/\\/g, "/").replace(/\/+$/, "");
}

function isProtectedPath(path, patterns) {
  const p = normalizePath(path);
  for (const pattern of patterns) {
    if (matchGlob(p, normalizePath(pattern))) {
      return true;
    }
  }
  return false;
}

function matchGlob(path, pattern) {
  const pathSegs = path.split("/").filter(Boolean);
  const patSegs = pattern.split("/").filter(Boolean);
  if (patSegs.length === 0) return false;
  return matchSegments(pathSegs, patSegs, 0, 0);
}

function matchSegments(pathSegs, patSegs, pi, pj) {
  if (pi >= pathSegs.length && pj >= patSegs.length) return true;
  if (pj >= patSegs.length) return false;
  if (pi >= pathSegs.length) {
    return patSegs.slice(pj).every((s) => s === "**");
  }
  const seg = patSegs[pj];
  if (seg === "**") {
    return (
      matchSegments(pathSegs, patSegs, pi, pj + 1) ||
      matchSegments(pathSegs, patSegs, pi + 1, pj) ||
      matchSegments(pathSegs, patSegs, pi + 1, pj + 1)
    );
  }
  if (seg === "*") {
    return matchSegments(pathSegs, patSegs, pi + 1, pj + 1);
  }
  if (pathSegs[pi] === seg) {
    return matchSegments(pathSegs, patSegs, pi + 1, pj + 1);
  }
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

// ── Validation ───────────────────────────────────────────────────────────────

function validate({ policy, changedFiles, totalLines, approvedScope, issueNumber }) {
  const errors = [];
  const protectedFiles = [];
  const exceededLimits = [];

  if (!policy || !policy._valid) {
    errors.push(
      "Policy is invalid or missing. " +
        (policy?._errors?.join("; ") ?? "Cannot load policy.")
    );
    return { valid: false, errors, protected: protectedFiles, exceeded_limits: exceededLimits };
  }

  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    errors.push("Changed files list is empty or not an array.");
    return { valid: false, errors, protected: protectedFiles, exceeded_limits: exceededLimits };
  }

  // 1. Protected path check
  const patterns = policy.protected_paths ?? [];
  for (const file of changedFiles) {
    const normalized = normalizePath(file);
    if (isProtectedPath(normalized, patterns)) {
      // Exception: the exact issue-matched handoff path declared by generated_path_exceptions
      if (policy.generated_path_exceptions?.handoff && issueNumber) {
        const handoffPattern = policy.generated_path_exceptions.handoff
          .replace("{issue_number}", String(issueNumber));
        if (normalized === normalizePath(handoffPattern)) {
          continue; // Allowed
        }
      }
      protectedFiles.push(file);
    }
  }

  if (protectedFiles.length > 0) {
    errors.push(
      `Protected paths modified: ${protectedFiles.join(", ")}. ` +
        "These paths require human approval."
    );
  }

  // 2. File count limit
  const maxFiles = policy.limits?.max_changed_files ?? 20;
  if (changedFiles.length > maxFiles) {
    exceededLimits.push(`max_changed_files: ${changedFiles.length} > ${maxFiles}`);
    errors.push(
      `Changed ${changedFiles.length} files (limit: ${maxFiles}). ` +
        "Reduce scope or obtain explicit approval."
    );
  }

  // 3. Line count limit
  if (totalLines !== undefined && totalLines !== null) {
    const maxLines = policy.limits?.max_changed_lines ?? 1200;
    if (totalLines > maxLines) {
      exceededLimits.push(`max_changed_lines: ${totalLines} > ${maxLines}`);
      errors.push(
        `Changed ${totalLines} lines (limit: ${maxLines}). ` +
          "Reduce scope or obtain explicit approval."
      );
    }
  }

  // 4. Scope check — all changed files must be within the approved scope
  if (approvedScope && Array.isArray(approvedScope) && approvedScope.length > 0) {
    const outOfScope = changedFiles.filter(
      (file) => !approvedScope.some((pattern) =>
        matchGlob(normalizePath(file), normalizePath(pattern))
      )
    );
    if (outOfScope.length > 0) {
      errors.push(
        `Files outside approved scope: ${outOfScope.join(", ")}. ` +
          "Do not expand scope beyond the approved plan."
      );
    }
  }

  // 5. Reject absolute paths and traversal attempts
  for (const file of changedFiles) {
    if (file.startsWith("/") || file.includes("..")) {
      errors.push(
        `Rejected path: '${file}'. Absolute paths and '..' traversal are not allowed.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    protected: protectedFiles,
    exceeded_limits: exceededLimits,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── YAML subset parser (no external dependency) ──────────────────────────────

function parseSimpleYaml(content) {
  const lines = content.split("\n");
  const root = {};

  // Stack of { indent, container } — container is the object/array at each indent
  const stack = [{ indent: -2, container: root }];

  // Track the last key at each indent so we know which container to target
  let currentArrayKey = null;
  let currentArrayIndent = -1;

  for (const line of lines) {
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();
    if (!trimmed.includes(":")) continue;

    // Pop stack to find parent at this indent level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].container;

    if (trimmed.startsWith("- ")) {
      // List item at this indent
      const itemStr = trimmed.slice(2).trim();
      if (itemStr.includes(":")) {
        // Inline key: value inside a list item (not used in our policy yet)
        const ci = itemStr.indexOf(":");
        const ik = itemStr.slice(0, ci).trim();
        const iv = itemStr.slice(ci + 1).trim();
        if (parent && Array.isArray(parent)) {
          const last = parent[parent.length - 1];
          if (last && typeof last === "object" && !Array.isArray(last)) {
            last[ik] = parseScalar(iv);
          }
        }
      } else {
        // Simple list value
        // Find the nearest array ancestor in the stack
        for (let i = stack.length - 1; i >= 0; i--) {
          if (Array.isArray(stack[i].container)) {
            stack[i].container.push(parseScalar(itemStr));
            break;
          }
        }
      }
      continue;
    }

    // Regular key: value
    const colonIdx = trimmed.indexOf(":");
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (value === "") {
      // Lookahead: will children be array items or object keys?
      const currentLineIdx = lines.indexOf(line);
      let nextNonEmpty;
      for (let j = currentLineIdx + 1; j < lines.length; j++) {
        const nl = lines[j];
        if (/^\s*#/.test(nl) || /^\s*$/.test(nl)) continue;
        nextNonEmpty = nl;
        break;
      }
      if (nextNonEmpty && nextNonEmpty.trim().startsWith("- ")) {
        parent[key] = [];
        stack.push({ indent, container: parent[key] });
      } else {
        parent[key] = {};
        stack.push({ indent, container: parent[key] });
      }
    } else {
      parent[key] = parseScalar(value);
    }
  }

  return root;
}

function parseScalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  // Remove quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

// ── Entry Point ──────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let policyPath, changedFilesPath, totalLines, scopePath, issueNumber;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--lines" && i + 1 < args.length) {
      totalLines = parseInt(args[++i], 10);
    } else if (args[i] === "--scope" && i + 1 < args.length) {
      scopePath = args[++i];
    } else if (args[i] === "--issue-number" && i + 1 < args.length) {
      issueNumber = args[++i];
    } else if (!policyPath) {
      policyPath = args[i];
    } else if (!changedFilesPath) {
      changedFilesPath = args[i];
    }
  }

  if (!policyPath || !changedFilesPath) {
    console.log(
      JSON.stringify(
        {
          valid: false,
          errors: [
            "Usage: node scope-guard.mjs <policy.yml> <changed-files.json> [--lines N] [--scope scope.json]",
          ],
          protected: [],
          exceeded_limits: [],
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  // Load policy — reads JSON (authoritative) or YAML (legacy, best-effort)
  let policy;
  try {
    const raw = readFileSync(policyPath, "utf-8");
    if (policyPath.endsWith(".json")) {
      policy = JSON.parse(raw);
    } else {
      // Best-effort YAML parse (subset only)
      policy = parseSimpleYaml(raw);
    }
    policy._valid = true;
    policy._errors = [];
  } catch (e) {
    console.log(
      JSON.stringify(
        {
          valid: false,
          errors: [`Cannot read or parse policy file: ${policyPath} — ${e.message}`],
          protected: [],
          exceeded_limits: [],
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  // Load changed files
  let changedFiles;
  try {
    changedFiles = JSON.parse(readFileSync(changedFilesPath, "utf-8"));
  } catch {
    console.log(
      JSON.stringify(
        {
          valid: false,
          errors: [`Cannot read or parse changed files: ${changedFilesPath}`],
          protected: [],
          exceeded_limits: [],
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  // Load scope if provided
  let approvedScope = null;
  if (scopePath) {
    try {
      const scopeData = JSON.parse(readFileSync(scopePath, "utf-8"));
      approvedScope = scopeData.declared ?? scopeData;
      if (!Array.isArray(approvedScope) || approvedScope.length === 0) {
        throw new Error("approved scope must be a non-empty array");
      }
    } catch (error) {
      console.log(
        JSON.stringify(
          {
            valid: false,
            errors: [`Cannot read or parse approved scope: ${error.message}`],
            protected: [],
            exceeded_limits: [],
          },
          null,
          2
        )
      );
      process.exit(1);
    }
  }

  const result = validate({ policy, changedFiles, totalLines, approvedScope, issueNumber });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}

main();
