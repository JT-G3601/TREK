#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { extractSection } from "./lib/plan-digest.mjs";

const [handoffPath, outputPath] = process.argv.slice(2);
if (!handoffPath || !outputPath) {
  console.error("Usage: node extract-approved-scope.mjs <handoff.md> <scope.json>");
  process.exit(1);
}

try {
  const section = extractSection(readFileSync(handoffPath, "utf8"), "Approved Paths");
  const declared = section
    .split("\n")
    .map((line) => line.match(/^\s*-\s+`([^`]+)`\s*$/)?.[1])
    .filter(Boolean);
  if (declared.length === 0) {
    throw new Error("Approved Paths must contain at least one backtick-delimited path or glob.");
  }
  if (declared.some((path) => path.startsWith("/") || path.includes(".."))) {
    throw new Error("Approved paths must be repository-relative and cannot contain '..'.");
  }
  writeFileSync(outputPath, JSON.stringify({ declared, source: handoffPath }, null, 2));
} catch (error) {
  console.error(`Cannot extract approved scope: ${error.message}`);
  process.exit(1);
}
