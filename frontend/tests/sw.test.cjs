const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../public/sw.js'), 'utf8');
const origin = 'https://siga-utecan.up.railway.app';

function harness({ mode = 'cors', status = 200, cacheFails = false } = {}) {
  const listeners = {};
  const writes = [];
  const pending = [];
  let releaseCache;
  const cacheReady = new Promise(resolve => { releaseCache = resolve; });
  vm.runInNewContext(source, {
    URL,
    self: { location: { origin }, addEventListener: (name, handler) => { listeners[name] = handler; } },
    fetch: async () => new Response('network body', { status }),
    caches: {
      match: async () => undefined,
      open: () => cacheReady.then(() => ({ put: async (key, response) => {
        if (cacheFails) throw new Error('Quota exceeded');
        writes.push({ key, body: await response.text() });
      } })),
    },
  });
  let result;
  const request = { method: 'GET', url: `${origin}/${mode === 'navigate' ? 'docente/horario' : 'static/main.js'}`, mode };
  listeners.fetch({ request, respondWith: promise => { result = promise; }, waitUntil: promise => pending.push(promise) });
  return { result, writes, pending, releaseCache };
}

for (const mode of ['cors', 'navigate']) {
  test(`caches ${mode} responses even after the browser consumes the body`, async () => {
    const state = harness({ mode });
    const response = await state.result;
    assert.equal(await response.text(), 'network body');
    state.releaseCache();
    await Promise.all(state.pending);
    assert.equal(state.writes.length, 1);
    assert.equal(state.writes[0].body, 'network body');
    if (mode === 'navigate') assert.equal(state.writes[0].key, '/');
  });
}

test('cache failures do not reject the response or background lifetime', async () => {
  const state = harness({ cacheFails: true });
  assert.equal(await (await state.result).text(), 'network body');
  state.releaseCache();
  await Promise.all(state.pending);
});

test('server errors do not replace the offline shell', async () => {
  const state = harness({ mode: 'navigate', status: 503 });
  assert.equal((await state.result).status, 503);
  state.releaseCache();
  await Promise.all(state.pending);
  assert.equal(state.writes.length, 0);
});
