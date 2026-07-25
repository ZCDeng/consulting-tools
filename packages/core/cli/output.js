// Structured CLI error + output contract (KTD5/KTD11). stdout is reserved for
// successful JSON results only; diagnostics and errors go to stderr, and every
// failure exits non-zero with a stable machine-readable code.

const BUSY_CODES = new Set(["SQLITE_BUSY", "SQLITE_LOCKED", "MIGRATION_LOCKED"]);

function isBusy(error) {
  if (!error) return false;
  if (BUSY_CODES.has(error.code)) return true;
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(error.message || "");
}

function toErrorPayload(error) {
  if (isBusy(error)) {
    return { code: error.code === "MIGRATION_LOCKED" ? "MIGRATION_LOCKED" : "DB_BUSY", message: error.message, retryable: true };
  }
  const statusCode = error && error.statusCode;
  if (statusCode === 404) return { code: "PROJECT_NOT_FOUND", message: error.message, retryable: false };
  if (statusCode === 400) return { code: "INVALID_INPUT", message: error.message, retryable: false };
  if (statusCode) return { code: `HTTP_${statusCode}`, message: error.message, retryable: false };
  return { code: error && error.code ? String(error.code) : "INTERNAL", message: error && error.message ? error.message : String(error), retryable: false };
}

function fail(error) {
  const payload = toErrorPayload(error);
  process.stderr.write(JSON.stringify({ error: payload }) + "\n");
  process.exit(payload.code === "INTERNAL" ? 1 : 2);
}

function succeed(value) {
  process.stdout.write(JSON.stringify(value) + "\n");
}

module.exports = { succeed, fail, toErrorPayload, isBusy };
