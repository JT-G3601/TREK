#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { computePlanDigest } from "./lib/plan-digest.mjs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node compute-plan-digest.mjs <handoff.md>");
  process.exit(1);
}

try {
  process.stdout.write(`${computePlanDigest(readFileSync(path, "utf8"))}\n`);
} catch (error) {
  console.error(`Cannot compute plan digest: ${error.message}`);
  process.exit(1);
}
