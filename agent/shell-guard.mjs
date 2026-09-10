export const ALLOWED_BINARIES = ["curl", "nmap", "dig", "ping", "nslookup"];

// Splits a recon command into argv for shell-free execution. No shell means an
// allowed binary cannot chain to another command through ; | && $() etc.
export function parseCommand(command) {
  if (typeof command !== "string" || /[\n\r\0]/.test(command)) {
    return { error: "command must be a single line of text" };
  }
  const argv = command.trim().split(/\s+/).filter(Boolean);
  if (argv.length === 0) return { error: "empty command" };
  if (!ALLOWED_BINARIES.includes(argv[0])) {
    return { error: `'${argv[0]}' is not permitted. allowed: ${ALLOWED_BINARIES.join(", ")}` };
  }
  return { argv };
}
