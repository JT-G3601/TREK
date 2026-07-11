#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { extractMetadata } from "./lib/plan-digest.mjs";

export function readHandoffMetadata(handoffPath, key) {
  if (!handoffPath || !key) {
    throw new Error("Both a handoff path and metadata key are required.");
  }

  if (!existsSync(handoffPath)) {
    throw new Error(`Handoff file not found: ${handoffPath}`);
  }

  const value = extractMetadata(readFileSync(handoffPath, "utf8"), key);
  if (!value) {
    throw new Error(`Handoff metadata is missing or empty: ${key}`);
  }

  return value;
}

function main() {
  const [handoffPath, key] = process.argv.slice(2);
  if (!handoffPath || !key) {
    console.error(
      "Usage: node read-handoff-metadata.mjs <handoff.md> <metadata-key>"
    );
    process.exit(1);
  }

  try {
    process.stdout.write(`${readHandoffMetadata(handoffPath, key)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
