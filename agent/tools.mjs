import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

const REPORT_PATH = process.env.REPORT_PATH ?? "/reports/report.html";

let browser;
let page;

async function ensurePage() {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  }
  return page;
}

const ALLOWED_BINARIES = ["curl", "nmap", "dig", "ping", "nslookup"];

async function runShell(command) {
  const bin = command.trim().split(/\s+/)[0];
  if (!ALLOWED_BINARIES.includes(bin)) {
    return `error: '${bin}' is not permitted. allowed: ${ALLOWED_BINARIES.join(", ")}`;
  }
  try {
    const { stdout, stderr } = await execFileAsync("/bin/sh", ["-c", command], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return (stdout + stderr).slice(0, 8000);
  } catch (err) {
    return `error: ${err.message}`.slice(0, 4000);
  }
}

async function browserGoto(url) {
  const p = await ensurePage();
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  return (await p.content()).slice(0, 8000);
}

async function browserAct({ action, selector, value, script }) {
  const p = await ensurePage();
  if (action === "click") {
    await p.click(selector, { timeout: 10_000 });
    return "clicked";
  }
  if (action === "fill") {
    await p.fill(selector, value, { timeout: 10_000 });
    return "filled";
  }
  if (action === "eval") {
    const result = await p.evaluate(script);
    return JSON.stringify(result).slice(0, 4000);
  }
  return `error: unknown action ${action}`;
}

async function writeReport(htmlBody) {
  const template = await readFile(new URL("./report-template.html", import.meta.url), "utf8");
  const finished = template.replace("__REPORT_BODY__", htmlBody);
  await writeFile(REPORT_PATH, finished, "utf8");
  return `report written to ${REPORT_PATH}`;
}

async function closeBrowser() {
  if (browser) await browser.close();
}

export { runShell, browserGoto, browserAct, writeReport, closeBrowser, ALLOWED_BINARIES };
