// ==UserScript==
// @name         Re-add Download Button Vimm's Lair
// @version      1.3
// @description  Grabs the mediaId and re-adds the download button only on pages that have them removed
// @author       anonymous
// @match        https://vimm.net/vault/*
// @from         https://www.reddit.com/r/Roms/comments/1hcckqw/comment/m9f0p68/
// @downloadURL  https://github.com/aenerv7/Dox/raw/refs/heads/main/Scripts/Userscripts/Re-add%20Download%20Button%20Vimm's%20Lair.user.js
// @updateURL    https://github.com/aenerv7/Dox/raw/refs/heads/main/Scripts/Userscripts/Re-add%20Download%20Button%20Vimm's%20Lair.user.js
// ==/UserScript==

(function() {
    const downloadForm = document.querySelector('#dl_form');
    if (!downloadForm) {
        return;
    }

    // Match by form owner, not inline width or placement in the page.
    const controls = document.querySelectorAll('button, input[type="submit"], input[type="image"]');
    if (Array.from(controls).some((control) => control.form === downloadForm && ['submit', 'image'].includes(control.type))) {
        return;
    }

    const button = document.createElement('button');
    button.type = 'submit';
    button.style.width = '34%';
    button.textContent = 'Download';
    downloadForm.append(button);
})();
