import Groq from "groq-sdk";
import { runShell, browserGoto, browserAct, writeReport, closeBrowser } from "./tools.mjs";

const TARGET_URL = process.env.TARGET_URL ?? "http://localhost:3000";
const MAX_TURNS = Number(process.env.MAX_TURNS ?? 40);
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

const groq = new Groq();

const tools = [
  {
    type: "function",
    function: {
      name: "run_shell",
      description:
        "Run a read-only recon shell command (curl, nmap, dig, ping) against the target. " +
        "Only these binaries are permitted. Use for API probing, header inspection, port/service discovery.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Full shell command, e.g. 'curl -i http://localhost:3000/rest/user/whoami'",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_goto",
      description: "Navigate the headless browser to a URL and return the resulting HTML.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_act",
      description:
        "Interact with the current page: click a selector, fill a selector with text, or evaluate JS. " +
        "action is one of 'click', 'fill', 'eval'. For 'fill' pass selector+value. For 'eval' pass script.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["click", "fill", "eval"] },
          selector: { type: "string" },
          value: { type: "string" },
          script: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_report",
      description:
        "Write the final vulnerability report. Call this once, at the end, with complete HTML findings body " +
        "(use <div class='finding severity-high|medium|low'> blocks with <h3>title</h3> and evidence).",
      parameters: {
        type: "object",
        properties: { html_body: { type: "string" } },
        required: ["html_body"],
      },
    },
  },
];

async function main() {
  const messages = [
    {
      role: "user",
      content:
        `You are an authorized penetration tester with explicit permission to attack ${TARGET_URL} ` +
        `(an intentionally vulnerable OWASP Juice Shop instance running in an isolated, disposable VM). ` +
        `Find as many real vulnerabilities as you can using run_shell (curl/nmap/dig/ping only) and the browser tools ` +
        `(navigate, click, fill, eval JS) — think XSS, IDOR, broken auth, SQLi, exposed admin/API endpoints, JWT issues, ` +
        `sensitive data exposure, business logic flaws. Verify each finding with concrete evidence (request/response, ` +
        `screenshot-equivalent DOM/JS output, etc.) before including it. When you're done exploring, call write_report ` +
        `exactly once with a complete HTML findings body.`,
    },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await groq.chat.completions.create({
      model: MODEL,
      max_tokens: 4096,
      tools,
      messages,
    });

    const choice = response.choices[0];
    const message = choice.message;
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log("agent finished without calling write_report; finish_reason:", choice.finish_reason);
      break;
    }

    let reportDone = false;
    for (const call of message.tool_calls) {
      const name = call.function.name;
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      let result;
      try {
        if (name === "run_shell") result = await runShell(args.command);
        else if (name === "browser_goto") result = await browserGoto(args.url);
        else if (name === "browser_act") result = await browserAct(args);
        else if (name === "write_report") {
          result = await writeReport(args.html_body);
          messages.push({ role: "tool", tool_call_id: call.id, content: result });
          reportDone = true;
          continue;
        } else result = `error: unknown tool ${name}`;
      } catch (err) {
        result = `error: ${err.message}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: String(result).slice(0, 8000) });
    }

    if (reportDone) {
      await closeBrowser();
      console.log("report complete.");
      return;
    }
  }

  console.log("max turns reached without a final report; writing partial fallback report.");
  await writeReport(
    "<div class='finding'><h3>incomplete run</h3><p>agent hit MAX_TURNS before calling write_report.</p></div>",
  );
  await closeBrowser();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (err) => {
    console.error(err);
    await writeReport(`<div class="finding severity-high"><h3>agent crashed</h3><pre>${err.stack}</pre></div>`);
    process.exit(1);
  });
}

export { main };
