import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "../agent/shell-guard.mjs";

test("accepts an allowed recon command", () => {
  assert.deepEqual(
    parseCommand("curl -i http://target:3000/rest/user/whoami"),
    { argv: ["curl", "-i", "http://target:3000/rest/user/whoami"] },
  );
});

test("rejects a disallowed binary", () => {
  assert.match(parseCommand("rm -rf /").error, /not permitted/);
});

test("chaining cannot change which binary is executed", () => {
  // "rm" appears only as a literal argv token; runShell runs argv[0] with
  // shell:false, so ';' and '&&' are handed to curl, not to a shell.
  const { argv } = parseCommand("curl http://target ; rm -rf /");
  assert.equal(argv[0], "curl");
});

test("rejects newline injection", () => {
  assert.match(parseCommand("curl http://target\nrm -rf /").error, /single line/);
});
