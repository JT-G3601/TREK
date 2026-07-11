#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const documentationPath = /^(?:docs|wiki)\//;
const rootDocumentationFile =
  /^(?:README(?:\.[^/]+)?\.md|CONTRIBUTING\.md|SECURITY\.md|CHANGELOG\.md|LICENSE(?:\.[^/]+)?)$/i;

export function requiresProjectVerification(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return true;
  return paths.some(
    (path) =>
      typeof path !== "string" ||
      path.length === 0 ||
      (!documentationPath.test(path) && !rootDocumentationFile.test(path)),
  );
}

function main() {
  const paths = readFileSync(0, "utf8").split("\0").filter(Boolean);
  process.stdout.write(requiresProjectVerification(paths) ? "true" : "false");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
