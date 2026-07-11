import { createHash } from "node:crypto";

export function extractSection(content, sectionName) {
  const heading = new RegExp(`^##\\s+${escapeRegex(sectionName)}\\s*$`, "m");
  const match = content.match(heading);
  if (!match) return "";

  const rest = content.slice(match.index + match[0].length);
  const nextHeading = rest.match(/^##\s/m);
  return rest.slice(0, nextHeading ? nextHeading.index : rest.length).trim();
}

export function extractMetadata(content, key) {
  const metadata = extractSection(content, "Metadata");
  if (!metadata) return "";

  const pattern = new RegExp(
    `^\\-[ \\t]*${escapeRegex(key)}[ \\t]*:[ \\t]*(.*)$`,
    "m"
  );
  const match = metadata.match(pattern);
  return match ? match[1].trim() : "";
}

export function buildDigestPayload(content) {
  return {
    schema_version: 1,
    issue_number: extractMetadata(content, "Issue").replace(/^#/, "").trim(),
    target_repository: extractMetadata(content, "Target repository"),
    planning_base_sha: extractMetadata(content, "Planning base SHA"),
    goal: extractSection(content, "Goal"),
    acceptance_criteria: extractSection(content, "Acceptance Criteria"),
    constraints: extractSection(content, "Constraints"),
    decisions: extractSection(content, "Decisions"),
    implementation_plan: extractSection(content, "Implementation Plan"),
    approved_paths: extractSection(content, "Approved Paths"),
  };
}

export function computePlanDigest(content) {
  const payload = buildDigestPayload(content);
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
