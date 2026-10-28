// Run with: node tests/smoke-check.js
const fs = require("node:fs");
const assert = require("node:assert/strict");
const html = fs.readFileSync("index.html","utf8");
const js = fs.readFileSync("app.js","utf8");
const css = fs.readFileSync("styles.css","utf8");
const sql = fs.readFileSync("supabase/schema.sql","utf8");
for (const id of ["auth-screen","app-screen","auth-form","page-content","modal","toast-region"]) {
  assert.match(html, new RegExp(`id="${id}"`), `Missing HTML element ${id}`);
}
for (const feature of ["signInWithPassword","signUp","attendance_records","upsert(payload","renderOverview","renderAttendance","renderPeople","renderAcademics","renderReports","exportReport"]) {
  assert.ok(js.includes(feature), `Missing app feature ${feature}`);
}
for (const table of ["profiles","classes","subjects","class_subjects","enrollments","attendance_records"]) {
  assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\s*\\(`,"i"), `Missing database table ${table}`);
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`,"i"), `RLS not enabled for ${table}`);
}
assert.ok(css.length > 1000, "Stylesheet unexpectedly short");
assert.ok(html.includes("./app.js") && html.includes("./styles.css"), "Static assets are not linked");
assert.ok(!js.includes("service_role"), "Do not expose a service role key");
console.log("Attendly smoke checks passed.");
console.log("Note: these are structural checks, not full browser integration tests.");
