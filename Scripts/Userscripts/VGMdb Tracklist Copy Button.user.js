// ==UserScript==
// @name         VGMdb Tracklist Copy Button
// @namespace    https://github.com/aenerv7/Dox
// @version      1.1
// @description  Add a button between the track number and the title in VGMdb tracklists to copy that track title
// @author       AENERV7
// @match        https://vgmdb.net/album/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://github.com/aenerv7/Dox/raw/refs/heads/main/Scripts/Userscripts/VGMdb%20Tracklist%20Copy%20Button.user.js
// @updateURL    https://github.com/aenerv7/Dox/raw/refs/heads/main/Scripts/Userscripts/VGMdb%20Tracklist%20Copy%20Button.user.js
// ==/UserScript==

(function () {
    'use strict';

    const BUTTON_CLASS = 'vgmdb-copy-track';
    const STATUS_CLASS = 'vgmdb-copy-status';
    const RESET_DELAY = 1200;

    const ICON_COPY = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    const ICON_DONE = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

    const style = document.createElement('style');
    style.textContent = `
.${BUTTON_CLASS} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 24px;
    min-block-size: 24px;
    margin-inline-end: 5px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    vertical-align: -1px;
    opacity: .4;
    cursor: pointer;
    transition: opacity .15s, color .15s;
}
.${BUTTON_CLASS}:hover,
.${BUTTON_CLASS}:focus-visible { opacity: 1; }
.${BUTTON_CLASS}:focus-visible { outline: 1px dotted currentColor; outline-offset: 1px; }
.${STATUS_CLASS}:not(:empty) { margin-inline-end: .5em; }
.${BUTTON_CLASS}.is-done { color: #6cc26c; opacity: 1; }
`;
    document.head.appendChild(style);

    // 标题文本：克隆一份并剔除按钮自身，再把排版空白压成单个空格
    function titleOf(titleCell) {
        const clone = titleCell.cloneNode(true);
        clone.querySelectorAll(`.${BUTTON_CLASS}, .${STATUS_CLASS}`).forEach((node) => node.remove());
        return clone.textContent.replace(/\s+/g, ' ').trim();
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            // 非安全上下文或未授权时的兜底
            const previousFocus = document.activeElement;
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
            document.body.appendChild(textarea);
            try {
                textarea.select();
                return document.execCommand('copy');
            } catch {
                return false;
            } finally {
                textarea.remove();
                previousFocus?.focus?.({ preventScroll: true });
            }
        }
    }

    function makeControls(titleCell) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = BUTTON_CLASS;
        button.innerHTML = ICON_COPY;
        button.title = 'Copy track title';
        button.setAttribute('aria-label', `Copy track title: ${titleOf(titleCell)}`);

        const status = document.createElement('span');
        status.className = STATUS_CLASS;
        status.setAttribute('role', 'status');

        let lastMessage = '';
        let resetTimer = 0;
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const ok = await copyText(titleOf(titleCell));
            button.classList.toggle('is-done', ok);
            button.innerHTML = ok ? ICON_DONE : ICON_COPY;
            const message = ok ? 'Copied' : 'Copy failed';
            lastMessage = message === lastMessage ? message + '\u00a0' : message;
            status.textContent = lastMessage;

            clearTimeout(resetTimer);
            resetTimer = setTimeout(() => {
                button.classList.remove('is-done');
                button.innerHTML = ICON_COPY;
                status.textContent = '';
            }, RESET_DELAY);
        });

        const controls = document.createDocumentFragment();
        controls.append(button, status);
        return controls;
    }

    // 曲目行固定为「序号 td / 标题 td / 时长 td」，但序号格用 span.label 定位更稳。
    // 一个专辑页可能有多个语言块（#tlnav 标签页），每个块都要注入。
    function decorate() {
        document.querySelectorAll('#tracklist tr.rolebit').forEach((row) => {
            const cells = row.cells;
            let index = 0;
            while (index < cells.length && !cells[index].querySelector('span.label')) {
                index++;
            }
            if (index >= cells.length) {
                index = 0;
            }

            const titleCell = cells[index + 1];
            if (!titleCell || titleCell.querySelector('.' + BUTTON_CLASS)) {
                return;
            }

            titleCell.prepend(makeControls(titleCell));
        });
    }

    let scheduled = false;
    function schedule() {
        if (scheduled) {
            return;
        }
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            decorate();
        });
    }

    schedule();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
})();
