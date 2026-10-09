// PPA production Worker: explicitly authorized, previously uploaded version ONLY.
// No Worker code build, D1 access, asset upload, secret edits or auto-deploy.
// This script intentionally fails closed if the actual Cloudflare state drifts.
import { spawnSync } from "node:child_process";

const WORKER = "ppa-phoenixpixarena";
const NEW_ID = "af1418b7-92b6-47f5-b2eb-2a57e78697fb";
const OLD_PREFIX = "1fcd5eb8";
const MODES = ["inspect", "canary_1", "promote_100", "rollback_100"];
const mode = process.env.ACTION_MODE || "inspect";
const token = process.env.CLOUDFLARE_API_TOKEN || "";
const account = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const confirm = process.env.RELEASE_CONFIRM || "";
const expectedCurrent = (process.env.EXPECTED_CURRENT_PREFIX || OLD_PREFIX).toLowerCase();
const apiBase = "https://api.cloudflare.com/client/v4/accounts/" + account +
  "/workers/scripts/" + WORKER;

function fail(reason) {
  throw new Error("PPA RELEASE BLOCKED: " + reason);
}
function validateConfig() {
  if (!MODES.includes(mode)) fail("unexpected mode");
  if (!/^[a-f0-9]{32}$/i.test(account)) fail("PPA_WORKER_ACCOUNT_ID not set to Cloudflare account ID");
  if (token.length < 20) fail("PPA_WORKER_DEPLOY_TOKEN missing");
  if (expectedCurrent !== OLD_PREFIX) fail("this procedure is pinned to original PPA production " + OLD_PREFIX);
  if (mode !== "inspect" && confirm !== "I_APPROVE_PPA_PRODUCTION_ROLLOUT")
    fail("manual production acknowledgement was not supplied");
}
async function apiGet(path) {
  const response = await fetch(apiBase + path, {
    method: "GET",
    headers: {"Authorization": "Bearer " + token, "Accept": "application/json"},
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) fail("Cloudflare read denied (HTTP " + response.status + ")");
  const body = await response.json();
  if (!body || body.success !== true || !body.result)
    fail("invalid response from Cloudflare API");
  return body.result;
}
async function deployments() {
  const body = await apiGet("/deployments?per_page=25");
  const list = body.deployments;
  if (!Array.isArray(list) || list.length === 0) fail("no active Worker deployments");
  return list;
}
function splitOf(deployment) {
  if (!deployment || !Array.isArray(deployment.versions) || deployment.versions.length < 1)
    fail("unable to parse active deployment");
  const split = deployment.versions.map(v => ({
    id: String(v.version_id || "").toLowerCase(),
    pct: Number(v.percentage)
  }));
  if (split.some(v => !/^[0-9a-f-]{36}$/.test(v.id) || !Number.isFinite(v.pct)))
    fail("malformed live version or traffic percentage");
  if (Math.abs(split.reduce((a, b) => a + b.pct, 0) - 100) > 0.001)
    fail("unexpected traffic split total");
  return split;
}
function hasExact(split, id, percentage) {
  return split.some(v => v.id === id && Math.abs(v.pct - percentage) < 0.001);
}
function fullOldId(history) {
  const options = new Set();
  for (const item of history) {
    for (const v of splitOf(item)) if (v.id.startsWith(OLD_PREFIX)) options.add(v.id);
  }
  if (options.size !== 1) fail("cannot uniquely identify original live version from deployment history");
  return [...options][0];
}
function runtimeFingerprint(version) {
  const resources = version && version.resources;
  const bindings = resources && resources.bindings;
  const runtime = resources && resources.script_runtime;
  if (!bindings || !runtime || !runtime.exports)
    fail("version metadata is incomplete; do not promote without inspecting bindings");
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b))
        .map(([k,v]) => [k, canonical(v)]));
    }
    return value;
  };
  return JSON.stringify(canonical({
    bindings,
    exports: runtime.exports,
    compatibility_date: runtime.compatibility_date,
    compatibility_flags: runtime.compatibility_flags || []
  }));
}
function stateAllowed(split, oldId) {
  if (mode === "canary_1") {
    return split.length === 1 && hasExact(split, oldId, 100);
  }
  if (mode === "promote_100") {
    return split.length === 2 && hasExact(split, oldId, 99) && hasExact(split, NEW_ID, 1);
  }
  if (mode === "rollback_100") {
    return (split.length === 2 && hasExact(split, oldId, 99) && hasExact(split, NEW_ID, 1)) ||
      (split.length === 1 && hasExact(split, NEW_ID, 100));
  }
  return true;
}
function targetSplit(oldId) {
  if (mode === "canary_1") return [oldId + "@99%", NEW_ID + "@1%"];
  if (mode === "promote_100") return [NEW_ID + "@100%"];
  if (mode === "rollback_100") return [oldId + "@100%"];
  return [];
}
async function main() {
  validateConfig();
  const current = await deployments();
  const live = current[0];
  const oldId = fullOldId(current);
  const split = splitOf(live);
  const candidate = await apiGet("/versions/" + NEW_ID);
  const original = await apiGet("/versions/" + oldId);
  const runtimeMatched = runtimeFingerprint(candidate) === runtimeFingerprint(original);
  if (!runtimeMatched) {
    console.log("PPA_BINDING_OR_EXPORT_MISMATCH: version metadata differs");
  } else {
    console.log("PPA_BINDINGS_AND_EXPORTS_MATCH");
  }
  console.log("PPA release inspection; Worker: " + WORKER);
  console.log("Original: " + oldId + "; candidate: " + NEW_ID);
  console.log("Active deployment ID: " + String(live.id));
  console.log("Current active split: " + split.map(v => v.id.slice(0, 8) + "=" + v.pct + "%").join(", "));
  if (mode === "inspect") {
    console.log("PPA_PRECHECK_OK no_changes=1 data_writes=0");
    return;
  }
  if (!runtimeMatched) fail("Cloudflare D1/assets/realtime bindings or runtime exports differ from live; manual code review required");
  if (!stateAllowed(split, oldId))
    fail("unexpected production traffic: stop and inspect before publishing");
  // Narrow the race window: a new CF deployment between inspection and execution
  // must stop this action. Other CF actors should not deploy concurrently.
  const second = (await deployments())[0];
  if (String(second.id) !== String(live.id))
    fail("another production deployment occurred during preflight");
  const versions = targetSplit(oldId);
  console.log("AUTHORIZED ONE-TIME RELEASE: " + mode + " -> " + versions.join(", "));
  const args = ["--yes", "wrangler@4.149.0", "versions", "deploy", ...versions,
    "--yes", "--name", WORKER, "--message", "PPA native read-only API manual " + mode];
  const result = spawnSync("npx", args, {stdio:"inherit", env:process.env, timeout:240000});
  if (result.error || result.status !== 0) fail("Wrangler failed; inspect the Cloudflare dashboard before retrying");
  const newest = (await deployments())[0];
  const actual = splitOf(newest);
  const expected = mode === "canary_1"
    ? [oldId + "@99", NEW_ID + "@1"]
    : [(mode === "rollback_100" ? oldId : NEW_ID) + "@100"];
  for (const part of expected) {
    const [id, pct] = part.split("@");
    if (!hasExact(actual,id,Number(pct))) fail("post-deploy traffic does not match approved plan");
  }
  if (actual.length !== expected.length) fail("unexpected additional active Worker version");
  console.log("PPA_MANUAL_WORKER_RELEASE_OK operation=" + mode + " no_d1_operations=1 no_rebuild=1");
}
main().catch(error => {console.error(error.message); process.exitCode=1;});
