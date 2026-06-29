const assert = require("node:assert/strict");
const test = require("node:test");

const configPath = require.resolve("../config");

function loadConfigWithHost(host) {
  const originalHost = process.env.TOOLKIT_HOST;
  if (host === undefined) {
    delete process.env.TOOLKIT_HOST;
  } else {
    process.env.TOOLKIT_HOST = host;
  }
  delete require.cache[configPath];
  try {
    return require("../config");
  } finally {
    delete require.cache[configPath];
    if (originalHost === undefined) {
      delete process.env.TOOLKIT_HOST;
    } else {
      process.env.TOOLKIT_HOST = originalHost;
    }
  }
}

test("server host stays loopback-only", () => {
  assert.equal(loadConfigWithHost(undefined).host, "127.0.0.1");
  assert.equal(loadConfigWithHost("localhost").host, "127.0.0.1");
  assert.equal(loadConfigWithHost("127.0.0.1").host, "127.0.0.1");
  assert.throws(() => loadConfigWithHost("0.0.0.0"), /loopback-only/);
  assert.throws(() => loadConfigWithHost("192.168.1.10"), /loopback-only/);
});
