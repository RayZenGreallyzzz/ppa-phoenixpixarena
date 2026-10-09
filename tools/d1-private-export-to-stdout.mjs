// Read-only Cloudflare D1 export to stdout ONLY; never print raw saves to logs.
// Caller must pipe stdout DIRECTLY into an encrypted archive, not a plaintext file.
import process from "node:process";
import { setTimeout as wait } from "node:timers/promises";
const token = String(process.env.CLOUDFLARE_D1_READ_TOKEN || "").trim();
const accountId = "f091a5713d0a349e6e15f390cacfb029";
const databaseId = "53d15b19-362d-4850-a6b8-df058ac1fba7";
const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/d1/database/" + databaseId;
const headers = { "Authorization": "Bearer " + token, "Content-Type": "application/json" };
function fail(s) { throw new Error(s); }
async function run() {
  if (!token || token.includes("\n")) fail("D1 token absent/invalid");
  const metaResponse = await fetch(endpoint, { headers, signal: AbortSignal.timeout(20000) });
  if (!metaResponse.ok) fail("D1 metadata HTTP " + metaResponse.status);
  const meta = await metaResponse.json();
  if (!meta?.success || meta?.result?.name !== "ppa-phoenix-db" || meta?.result?.uuid !== databaseId) {
    fail("Database ID/name mismatch, aborted without exporting");
  }
  let payload = { output_format: "polling" };
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await fetch(endpoint + "/export", {
      method: "POST", headers, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) fail("Cloudflare D1 export HTTP " + response.status);
    const outer = await response.json();
    const result = outer?.result;
    if (!outer?.success || !result || result.success === false) fail("Cloudflare rejected D1 export");
    if (result.status === "error") fail("D1 export task failed");
    if (result.status === "complete") {
      const urlText = result?.result?.signed_url;
      if (typeof urlText !== "string" || !urlText) fail("Missing temporary export URL");
      const url = new URL(urlText);
      if (url.protocol !== "https:" || url.username || url.password) fail("Export URL is not HTTPS");
      const download = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!download.ok) fail("Encrypted export input download HTTP " + download.status);
      const buffer = Buffer.from(await download.arrayBuffer());
      if (buffer.length < 256 || buffer.length > 100 * 1024 * 1024 ||
          !buffer.includes(Buffer.from("CREATE TABLE"))) fail("Export missing schema or unexpected size");
      // Deliberately no console.log; only binary SQL on stdout to 7z -si.
      process.stdout.write(buffer);
      return;
    }
    if (!result.at_bookmark || typeof result.at_bookmark !== "string") fail("Polling bookmark absent");
    payload = { output_format: "polling", current_bookmark: result.at_bookmark };
    await wait(2500);
  }
  fail("D1 export timeout");
}
try { await run(); }
catch (err) {
  process.stderr.write("PPA_D1_BACKUP_ABORT: " + String(err.message || "error") + "\n");
  process.exitCode = 1;
}
