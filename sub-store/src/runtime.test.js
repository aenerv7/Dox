import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, installGlobals, runInContext } from './runtime.js';

installGlobals();

test('$done settles only its request and keeps the first value', async () => {
    const first = createContext([]);
    const second = createContext([]);
    await Promise.all([first, second].map((context, index) => runInContext(context, async () => {
        await Promise.resolve();
        $done(index);
        $done('duplicate');
    })));

    assert.deepEqual(await Promise.all([first.done, second.done]), [0, 1]);
});

test('$httpClient reports AbortError when the response body stalls', { timeout: 1000 }, async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url, { signal }) => ({
        text: () => new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    }));

    const [error, response, body] = await new Promise((resolve) => {
        $httpClient.get({ url: 'https://example.test/', timeout: 0.005 }, (...args) => resolve(args));
    });

    assert.equal(error.name, 'AbortError');
    assert.equal(response, null);
    assert.equal(body, null);
});
