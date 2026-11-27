import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// Use the caller's happy-dom installation; userscripts have no runtime dependencies.
const require = createRequire(resolve('package.json'));
const { Window } = await import(pathToFileURL(require.resolve('happy-dom')).href);

function fixture(t, script, html, url) {
    const win = new Window({ url });
    t.after(() => win.happyDOM.abort());
    win.document.body.innerHTML = html;
    const source = readFileSync(new URL(`../${script}.user.js`, import.meta.url), 'utf8');
    return { win, doc: win.document, run: () => win.eval(source) };
}

test('download links use only the numeric path ID', (t) => {
    const { doc, run } = fixture(t, 'EmuParadise Download Workaround', '<div class="download-link"></div>'.repeat(2), 'https://www.emuparadise.me/roms/game/123?gid=other#extra');
    run();
    const links = [...doc.querySelectorAll('.download-link > a')];
    assert.equal(links.length, 2);
    for (const link of links) {
        assert.equal(link.href, 'https://www.emuparadise.me/roms/get-download.php?gid=123&test=true');
    }
});

test('non-game pages receive no download link', (t) => {
    const { doc, run } = fixture(t, 'EmuParadise Download Workaround', '<div class="download-link"></div>', 'https://www.emuparadise.me/roms/game/about');
    run();
    assert.equal(doc.querySelector('a'), null);
});

test('inject only a missing submit control, independent of style', (t) => {
    for (const content of ['', '<button>Existing</button>', '<input type="submit">', '<input type="image">']) {
        const { doc, run } = fixture(t, "Re-add Download Button Vimm's Lair", `<form id="dl_form">${content}</form>`);
        run();
        run();
        assert.equal(doc.querySelectorAll('button, input').length, 1);
    }
});

test('copy feedback never becomes part of the track title', async (t) => {
    const { win, doc, run } = fixture(t, 'VGMdb Tracklist Copy Button', '<table id="tracklist"><tr class="rolebit"><td><span class="label">01</span></td><td>Track A</td></tr></table>');
    const copied = [];
    Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: async (s) => copied.push(s) } });
    run();
    await new Promise((resolve) => win.requestAnimationFrame(resolve));
    const button = doc.querySelector('button');
    assert.equal(button.getAttribute('aria-label'), 'Copy track title: Track A');
    for (let i = 0; i < 2; i++) {
        button.click();
        await new Promise(setImmediate);
        assert.equal(doc.querySelector('[role="status"]').textContent.trim(), 'Copied');
    }
    assert.deepEqual(copied, ['Track A', 'Track A']);
    button.focus();
    win.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
    doc.execCommand = () => false;
    button.click();
    await new Promise(setImmediate);
    assert.equal(doc.querySelector('[role="status"]').textContent, 'Copy failed');
    assert.equal(doc.activeElement, button);
    assert.equal(doc.querySelector('textarea'), null);
});
