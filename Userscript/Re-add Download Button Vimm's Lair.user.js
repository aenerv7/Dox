// ==UserScript==
// @name         Re-add Download Button Vimm's Lair
// @version      1.2
// @description  Grabs the mediaId and re-adds the download button only on pages that have them removed
// @author       anonymous
// @match        https://vimm.net/vault/*
// @from         https://www.reddit.com/r/Roms/comments/1hcckqw/comment/m9f0p68/
// @downloadURL  https://github.com/aenerv7/Dox/raw/refs/heads/main/Userscript/Re-add%20Download%20Button%20Vimm's%20Lair.user.js
// @updateURL    https://github.com/aenerv7/Dox/raw/refs/heads/main/Userscript/Re-add%20Download%20Button%20Vimm's%20Lair.user.js
// ==/UserScript==

(function() {
    const downloadForm = document.querySelector('#dl_form');
    const downloadButton = downloadForm?.querySelector('button[type="submit"][style="width:100%"]');

    if (downloadForm && !downloadButton) {
        downloadForm.insertAdjacentHTML('beforeend', '<button type="submit" style="width:34%">Download</button>');
    }
})();
