const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeHost } = require("../app");

test("server host stays loopback-only", () => {
  assert.equal(normalizeHost(undefined), "127.0.0.1");
  assert.equal(normalizeHost("localhost"), "127.0.0.1");
  assert.equal(normalizeHost("127.0.0.1"), "127.0.0.1");
  assert.throws(() => normalizeHost("0.0.0.0"), /loopback-only/);
  assert.throws(() => normalizeHost("192.168.1.10"), /loopback-only/);
});
