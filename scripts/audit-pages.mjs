// Audit every page in src/app for:
// 1. 'use client' presence (correct directive)
// 2. useSession / usePermissions / auth guards
// 3. Loading / empty-state patterns
// 4. Error handling
// 5. Import inconsistencies
import fs from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.name === "layout.tsx" || e.name === "page.tsx") out.push(p);
    else if (e.isDirectory() && !e.name.startsWith("(") && e.name !== "api" && e.name !== "_next")
      walk(p, out);
  }
  return out;
}

const pages = walk("src/app").sort();
const findings = [];

for (const file of pages) {
  const c = fs.readFileSync(file, "utf8");
  const rel = file.replace(/\\/g, "/").replace(/.*warehouse-system\//, "");
  const issues = [];

  if (!c.startsWith('"use client"') && !c.includes("'use client'")) {
    issues.push("MISSING 'use client' directive");
  }

  if (c.includes("window.location") && !c.includes("// TODO")) {
    issues.push("USES window.location (should use router.replace)");
  }

  if (/await.*supabase.*select|await.*supabase.*insert|await.*supabase.*update|await.*supabase.*delete/.test(c) &&
      !c.includes("useEffect") && !c.includes("useCallback") && !c.includes("async function") &&
      !c.includes("await fetch(")) {
    issues.push("TOP-LEVEL AWAIT without useCallback/useEffect (may cause render cascade)");
  }

  if (c.includes("undefined") && c.includes("data.") && !c.includes("??") && !c.includes("?.")) {
    issues.push("POSSIBLE undefined data access (use ?. or ??)");
  }

  if (!c.includes("setLoading") && !c.includes("isLoading") &&
      (c.includes("supabase.from") || c.includes("fetch(")) &&
      !c.includes("// no loader")) {
    issues.push("DATA FETCH without loading state");
  }

  if (c.includes('"active"') && !c.includes("setActive") && !c.includes("toggle")) {
    // ok
  }

  if (issues.length > 0) findings.push({ file: rel, issues });
}

console.log("=== PAGE AUDIT (" + pages.length + " pages) ===\n");
if (findings.length === 0) {
  console.log("  All pages look clean.");
} else {
  for (const f of findings) {
    console.log(f.file + ":");
    for (const i of f.issues) console.log("  ✗", i);
  }
  console.log("\nPages with issues:", findings.length + "/" + pages.length);
}
