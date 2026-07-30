import { runShell, browserGoto, browserAct, writeReport, closeBrowser, ALLOWED_BINARIES } from "./tools.mjs";
import { readFile } from "node:fs/promises";
import assert from "node:assert";

async function main() {
  console.log("ALLOWED_BINARIES:", ALLOWED_BINARIES);

  const blocked = await runShell("rm -rf /");
  assert.match(blocked, /not permitted/);
  console.log("PASS: disallowed binary blocked ->", blocked);

  const curlOut = await runShell("curl -s -o /dev/null -w '%{http_code}' http://localhost:3000");
  assert.strictEqual(curlOut.trim(), "200");
  console.log("PASS: curl against juice-shop ->", curlOut.trim());

  const apiOut = await runShell("curl -s http://localhost:3000/rest/products/search?q=");
  assert.match(apiOut, /"status"/);
  console.log("PASS: juice-shop REST API reachable, sample:", apiOut.slice(0, 120));

  const nmapOut = await runShell("nmap -p 3000 localhost");
  assert.match(nmapOut, /3000\/tcp/);
  console.log("PASS: nmap ran ->\n", nmapOut);

  const html = await browserGoto("http://localhost:3000");
  assert.match(html, /<title>OWASP Juice Shop<\/title>/i);
  console.log("PASS: playwright loaded juice-shop, title tag found");

  const evalResult = await browserAct({ action: "eval", script: "document.title" });
  assert.match(evalResult, /Juice Shop/);
  console.log("PASS: browser_act eval ->", evalResult);

  const writeResult = await writeReport(
    "<div class='finding severity-high'><h3>test finding</h3><p>evidence here</p></div>",
  );
  console.log("PASS: writeReport ->", writeResult);
  const written = await readFile("/tmp/report-test.html", "utf8");
  assert.match(written, /test finding/);
  assert.match(written, /<html>/);
  console.log("PASS: report file has expected content, length", written.length);

  await closeBrowser();
  console.log("\nALL TOOL FUNCTIONS VERIFIED AGAINST LIVE JUICE SHOP CONTAINER");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("TEST FAILED:", err);
  await closeBrowser();
  process.exit(1);
});
