import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const player = await readFile(new URL('../web/player.js', import.meta.url), 'utf8');

async function until(condition) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Player did not reach the expected state');
}

function makePlayer({ native = true, keys = ['ok'], reads = [], openOutcomes = ['ok'], libraryOutcomes = ['ok'], hasSave = true, confirmStart = true, confirmLeave = true } = {}) {
  const elements = new Map();
  const listeners = new Map();
  const documentListeners = new Map();
  const scripts = [];
  const intervals = [];
  const createdURLs = [];
  const revokedURLs = [];
  const notices = [];
  const confirmations = [];
  const openTimeouts = new Map();
  const pendingOpenCompletions = [];
  const versionChangeCallbacks = [];
  let nextOpenTimeout = 1;
  let closedOpenDatabases = 0;
  let writes = 0;
  let readCount = 0;
  let keyCount = 0;
  let openCount = 0;
  let reloads = 0;
  let posts = 0;
  let releaseKeys;
  const element = selector => {
    if (selector === 'dialog[open]') return null;
    if (!elements.has(selector)) elements.set(selector, {
      hidden: false, disabled: false, textContent: '', dataset: {}, style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {}, addEventListener() {}, append() {}, replaceChildren() {}, scrollIntoView() {}, after(node) { notices.push(node); },
      click() { if (!this.disabled) return this.onclick?.(); },
      get offsetWidth() { return 1; },
    });
    return elements.get(selector);
  };
  const document = {
    hidden: false,
    querySelector: element,
    querySelectorAll: () => [],
    createElement: () => ({ classList: { add() {}, remove() {} }, setAttribute() {}, append() {} }),
    body: { append(node) { scripts.push(node.src); } },
    addEventListener(name, callback) { documentListeners.set(name, callback); },
  };
  const indexedDB = {
    open() {
      const outcome = openOutcomes[openCount++] ?? 'ok';
      const request = {};
      const complete = () => {
        request.result = {
          objectStoreNames: { contains: () => true },
          close() { closedOpenDatabases++; },
          addEventListener(name, callback) { if(name==='versionchange')versionChangeCallbacks.push(callback); },
          transaction() {
            const transaction = {
              objectStore() {
                return {
                  getAllKeys() {
                    keyCount++;
                    const outcome = keys.shift() ?? 'ok';
                    const complete = () => transaction.oncomplete?.();
                    if (outcome === 'pending') releaseKeys = complete;
                    else if (outcome === 'error') queueMicrotask(() => {
                      transaction.error = Error('inventory read failed');
                      transaction.onerror?.();
                    });
                    else queueMicrotask(complete);
                    return { result: hasSave ? ['abc123'] : [] };
                  },
                  get() {
                    readCount++;
                    const outcome = reads.shift();
                    if (outcome === 'error') queueMicrotask(() => {
                      transaction.error = Error('save read failed');
                      transaction.onerror?.();
                    });
                    else queueMicrotask(() => transaction.oncomplete?.());
                    return { result: outcome };
                  },
                  put() { writes++; queueMicrotask(() => transaction.oncomplete?.()); return {}; },
                };
              },
            };
            return transaction;
          },
        };
        request.onsuccess?.();
      };
      if (outcome === 'blocked-pending') {
        queueMicrotask(() => request.onblocked?.());
        pendingOpenCompletions.push(complete);
      } else queueMicrotask(() => {
        if (outcome === 'blocked') request.onblocked?.();
        complete();
      });
      return request;
    },
  };
  const window = {
    PocketFieldNative: native,
    confirm(message) { confirmations.push(message); return message.includes('Continue playing?') ? confirmStart : confirmLeave; },
    addEventListener(name, callback) {
      const callbacks = listeners.get(name) ?? [];
      callbacks.push(callback);
      listeners.set(name, callbacks);
    },
  };
  const context = {
    window, document, indexedDB, navigator: {}, Blob,
    URL: {
      createObjectURL(blob) { createdURLs.push(blob); return 'blob:state'; },
      revokeObjectURL(url) { revokedURLs.push(url); },
    },
    fetch: async (url, options) => {
      if(options?.method === 'POST')posts++;
      const outcome=libraryOutcomes.shift()??'ok';
      return {ok:outcome!=='error',json:async()=>({
        games:[{id:'abc123',title:'Game',theme:'homebrew',system:'nds',filename:'game.nds',saved:true}],
        free:1,total:2,phoneURL:'',
      })};
    },
    setTimeout(fn, ms) { if(ms===8000){const id=nextOpenTimeout++;openTimeouts.set(id,fn);return id;}return 1; },
    clearTimeout(id) { openTimeouts.delete(id); },
    setInterval(fn) { intervals.push(fn); return 1; }, clearInterval() {},
    console, location: { reload() { reloads++; } },
  };
  vm.runInNewContext(player, context, { filename: 'player.js' });
  return {
    element, window, scripts, createdURLs, revokedURLs, notices, confirmations, intervals,
    background() { document.hidden = true; documentListeners.get('visibilitychange')?.(); },
    beforeUnload() { const event = { preventDefault() {} }; for (const callback of listeners.get('beforeunload') ?? []) callback(event); return event.returnValue; },
    async saveDirect() { return vm.runInNewContext('saveSession()', context); },
    releaseKeys() { releaseKeys?.(); },
    key(key) {
      const event = { key, code: key, target: { tagName: 'BODY', closest: () => null }, preventDefault() {} };
      for (const callback of listeners.get('keydown') ?? []) callback(event);
    },
    get writes() { return writes; },
    get readCount() { return readCount; },
    get keyCount() { return keyCount; },
    get openCount() { return openCount; },
    get closedOpenDatabases() { return closedOpenDatabases; },
    fireOpenTimeout() { const entry=openTimeouts.entries().next().value;if(entry){openTimeouts.delete(entry[0]);entry[1]();} },
    completePendingOpen() { pendingOpenCompletions.shift()?.(); },
    changeVersion() { versionChangeCallbacks.shift()?.(); },
    get reloads() { return reloads; },
    get posts() { return posts; },
  };
}

test('pending iPhone save inventory blocks selection and launch until it is known', async () => {
  const p = makePlayer({ keys: ['pending'], reads: [new Uint8Array([1, 2])] });
  await until(() => p.keyCount === 1);
  p.key('ArrowRight');
  p.key('Enter');
  await p.element('#playButton').onclick(); // Programmatic calls cannot bypass the guard.
  assert.equal(p.element('#gameTitle').textContent, '');
  assert.deepEqual(p.scripts, []);
  assert.equal(p.readCount, 0);
  assert.equal(p.writes, 0);
  p.releaseKeys();
  await until(() => p.element('#playButton span').textContent === 'Continue game');
  await p.element('#playButton').onclick();
  assert.deepEqual(p.scripts, ['/emulator/loader.js']);
  assert.equal(p.window.EJS_loadStateURL, 'blob:state');
  assert.equal(p.createdURLs[0].size, 2);
  assert.equal(p.writes, 0);
});

test('restored iPhone sessions cannot overwrite the previous save from any player trigger', async () => {
  const p = makePlayer({ reads: [new Uint8Array([1, 2])] });
  await until(() => p.element('#playButton span').textContent === 'Continue game');
  await p.element('#playButton').onclick();
  assert.match(p.confirmations[0], /Progress will be lost when you leave/);
  assert.equal(p.notices.length, 1);
  assert.equal(p.notices[0].className, 'save-protection-notice');
  assert.match(p.notices[0].textContent, /saving is disabled.*will be lost/);
  p.window.EJS_emulator = { gameManager: { getState() { throw Error('must not read state'); } } };
  p.window.EJS_onGameStart();
  assert.equal(p.element('#saveButton').disabled, true);
  assert.match(p.element('#playStatus').textContent, /saving is disabled.*will be lost/);
  assert.equal(p.intervals.length, 0);
  assert.match(p.beforeUnload(), /saving is disabled.*will be lost/);
  assert.equal(await p.saveDirect(), false);
  await p.element('#saveButton').onclick(); // direct event invocation cannot bypass the guard
  p.background();
  await p.element('#backButton').onclick();
  assert.equal(p.reloads, 1);
  assert.equal(p.writes, 0);
  assert.equal(p.posts, 0);
});

test('declining to resume keeps the library and previous save untouched', async () => {
  const p = makePlayer({ reads: [new Uint8Array([1])], confirmStart: false });
  await until(() => p.element('#playButton span').textContent === 'Continue game');
  await p.element('#playButton').onclick();
  assert.equal(p.element('#library').hidden, false);
  assert.deepEqual(p.scripts, []);
  assert.deepEqual(p.revokedURLs, ['blob:state']);
  assert.equal(p.notices.length, 0);
  assert.equal(p.writes, 0);
  assert.equal(p.posts, 0);
});

test('declining to leave a protected session preserves the screen and save', async () => {
  const p = makePlayer({ reads: [new Uint8Array([1])], confirmLeave: false });
  await until(() => p.element('#playButton span').textContent === 'Continue game');
  await p.element('#playButton').onclick();
  p.window.EJS_onGameStart();
  await p.element('#backButton').onclick();
  assert.equal(p.reloads, 0);
  assert.equal(p.element('#backButton').disabled, false);
  assert.equal(p.writes, 0);
});

test('new iPhone and saved drive sessions retain normal saving', async () => {
  for (const native of [true, false]) {
    const p = makePlayer({ native, hasSave: false });
    await until(() => p.element('#playButton').disabled === false && p.element('#gameTitle').textContent === 'Game');
    await p.element('#playButton').onclick();
    p.window.EJS_emulator = { gameManager: { getState: () => new Uint8Array([7]) } };
    p.window.EJS_onGameStart();
    assert.equal(p.element('#saveButton').disabled, false);
    assert.equal(p.intervals.length, 1);
    assert.equal(await p.saveDirect(), true);
    assert.equal(native ? p.writes : p.posts, 1);
    await p.intervals[0]();
    assert.equal(native ? p.writes : p.posts, 2);
    p.background();
    await until(() => (native ? p.writes : p.posts) === 3);
    await new Promise(resolve => setImmediate(resolve)); // let the background transaction settle
    await p.element('#backButton').onclick();
    assert.equal(native ? p.writes : p.posts, 4);
    assert.equal(p.reloads, 1);
  }
});

test('failed iPhone inventory offers retry and never starts with unknown save status', async () => {
  const p = makePlayer({ keys: ['error', 'ok'], reads: [new Uint8Array([1])] });
  await until(() => p.element('#playButton span').textContent === 'Retry library');
  p.key('ArrowLeft');
  assert.equal(p.readCount, 0);
  assert.equal(p.writes, 0);
  assert.deepEqual(p.scripts, []);
  await p.element('#playButton').onclick();
  await until(() => p.element('#playButton span').textContent === 'Continue game');
  assert.equal(p.keyCount, 2);
  await p.element('#playButton').onclick();
  assert.deepEqual(p.scripts, ['/emulator/loader.js']);
  assert.equal(p.writes, 0);
});

test('blocked iPhone database open offers retry instead of leaving the library loading', async () => {
  const p = makePlayer({ openOutcomes: ['blocked-pending', 'ok'] });
  await until(() => p.openCount === 1);
  p.fireOpenTimeout();
  await until(() => p.element('#playButton span').textContent === 'Retry library');
  assert.equal(p.element('#playButton').disabled, false);
  assert.equal(p.scripts.length, 0);
  await p.element('#playButton').onclick();
  assert.equal(p.openCount, 1, 'retry does not overlap the still-pending request');
  p.completePendingOpen();
  await until(() => p.closedOpenDatabases === 1);
  await p.element('#playButton').onclick();
  await until(() => p.element('#playButton span').textContent === 'Continue game');
  assert.equal(p.openCount, 2, 'a fresh request starts only after the old request completes');
  assert.equal(p.writes, 0);
});

test('version changes invalidate the cached native database connection', async () => {
  const p = makePlayer();
  await until(() => p.element('#playButton span').textContent === 'Continue game');
  p.changeVersion();
  assert.equal(p.closedOpenDatabases, 1);
  await p.element('#romFile').onchange({target:{files:[]}});
  await until(() => p.openCount === 2 && p.element('#playButton span').textContent === 'Continue game');
  assert.equal(p.closedOpenDatabases, 1);
});

test('failed library refresh clears stale game selection and allows a fresh retry', async () => {
  const p = makePlayer({libraryOutcomes:['ok','error','ok']});
  await until(() => p.element('#playButton span').textContent === 'Continue game');
  assert.equal(p.element('#gameTitle').textContent, 'Game');
  await p.element('#romFile').onchange({target:{files:[]}});
  await until(() => p.element('#playButton span').textContent === 'Retry library');
  assert.equal(p.element('#gameTitle').textContent, '');
  assert.equal(p.element('#playButton').disabled, false);
  await p.element('#playButton').onclick();
  await until(() => p.element('#playButton span').textContent === 'Continue game');
});

test('failed, missing, malformed and empty iPhone saves never start or write; retry can load', async () => {
  for (const bad of ['error', undefined, { bad: true }, new Uint8Array()]) {
    const p = makePlayer({ reads: [bad, new Uint8Array([5])] });
    await until(() => p.element('#playButton span').textContent === 'Continue game');
    await p.element('#playButton').onclick();
    assert.equal(p.element('#library').hidden, false);
    assert.match(p.element('#saveNote').textContent, /No player save was written/);
    assert.equal(p.element('#playButton').disabled, false);
    assert.deepEqual(p.scripts, []);
    assert.equal(p.writes, 0);
    await p.element('#playButton').onclick();
    assert.deepEqual(p.scripts, ['/emulator/loader.js']);
    assert.equal(p.window.EJS_loadStateURL, 'blob:state');
    assert.equal(p.createdURLs[0].size, 1);
    assert.equal(p.writes, 0);
  }
});

test('drive launch continues using the server save URL without IndexedDB', async () => {
  const p = makePlayer({ native: false });
  await until(() => p.element('#playButton span').textContent === 'Continue game');
  await p.element('#playButton').onclick();
  assert.deepEqual(p.scripts, ['/emulator/loader.js']);
  assert.equal(p.window.EJS_loadStateURL, '/api/save/abc123');
  assert.equal(p.keyCount, 0);
  assert.equal(p.readCount, 0);
  assert.equal(p.writes, 0);
});
