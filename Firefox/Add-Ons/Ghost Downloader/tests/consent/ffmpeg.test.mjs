import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../../src/background/ffmpeg-consent.ts', import.meta.url))],
  bundle: true, write: false, format: 'esm',
});
const {createConsent} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const page = 'moz-extension://fixture/ffmpeg-consent.html';
const target = 'https://ffmpeg.bmmmd.com/';
const sender = {id: 'test', frameId: 0, url: 'https://media.example/watch', tab: {id: 1}};
const trusted = {id: 'test', frameId: 0, url: page, tab: {id: 2}};
const blob = new Blob(['fixture'], {type: 'video/mp4'});
const input = {Message: 'catCatchFFmpeg', action: 'transcode', title: 'Recording', files: [{data: blob, type: 'video/mp4'}]};
const tick = () => new Promise(setImmediate);

function setup(overrides = {}) {
  const created = [], sent = [];
  globalThis.chrome = {runtime: {id: 'test', getURL: () => page}, tabs: {
    create: async ({url}) => { created.push(url); return {id: 2, url}; },
    query: async () => [{id: 3, url: target, status: 'complete'}],
    get: async id => ({id, url: id === 2 ? page : target, status: 'complete'}),
    remove: async () => {},
    sendMessage: async (...args) => { sent.push(args); return 'ok'; },
    ...overrides,
  }};
  return {gate: createConsent(), created, sent};
}

test('only the designated top-level extension page may allow a single transfer', async () => {
  const {gate, created, sent} = setup();
  gate.request(input, sender);
  gate.request(input, sender);
  await tick();
  assert.deepEqual(created, [page]);
  assert.equal(sent.length, 0);
  for (const wrong of [sender, {...trusted, frameId: 1}, {...trusted, tab: {id: 9}}, {...trusted, id: 'other'}]) {
    assert.equal(gate.inspect(wrong), null);
    assert.equal(gate.answer(wrong, 'allow'), false);
  }
  assert.equal(gate.inspect(trusted).title, 'Recording');
  assert.equal(gate.answer(trusted, 'allow'), true);
  assert.equal(gate.answer(trusted, 'allow'), false);
  await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][1].files[0].data, blob);
  assert.equal(sent[0][2].frameId, 0);
});

for (const [cause, finish] of [
  ['cancel', gate => gate.answer(trusted, 'cancel')],
  ['close prompt', gate => gate.removed(2)],
  ['close source', gate => gate.removed(1)],
  ['navigate source', gate => gate.navigated(1, 0, 'https://media.example/next')],
  ['navigate prompt', gate => gate.navigated(2, 0, 'about:blank')],
  ['expire', (_, timers) => timers.tick(180000)],
]) {
  test(`${cause}: discard media without opening the processor`, async t => {
    t.mock.timers.enable({apis: ['setTimeout', 'Date']});
    const {gate, created, sent} = setup();
    gate.request(input, sender);
    await tick();
    finish(gate, t.mock.timers);
    assert.equal(gate.answer(trusted, 'allow'), false);
    await tick();
    assert.deepEqual(created, [page]);
    assert.equal(sent.length, 0);
  });
}

test('a closed localhost fixture, redirect or unavailable target does not receive media', async () => {
  for (const get of [async () => { throw Error('tab closed'); }, async () => ({url: 'https://different.example/', status: 'complete'})]) {
    const {gate, sent} = setup({get});
    gate.request(input, sender);
    await tick();
    gate.answer(trusted, 'allow');
    await tick();
    assert.equal(sent.length, 0);
  }
});

test('cancellation throttles prompts; later requests still require fresh consent', async t => {
  t.mock.timers.enable({apis: ['setTimeout', 'Date']});
  const {gate, created, sent} = setup();
  gate.request(input, sender);
  await tick();
  gate.answer(trusted, 'cancel');
  assert.equal(gate.request(input, sender), false);
  t.mock.timers.tick(11000);
  assert.equal(gate.request(input, sender), true);
  await tick();
  assert.deepEqual(created, [page, page]);
  assert.equal(sent.length, 0);
  gate.removed(2);
});
