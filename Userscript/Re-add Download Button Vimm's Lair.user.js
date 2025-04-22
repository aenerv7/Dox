// ==UserScript==
// @name         Re-add Download Button Vimm's Lair
// @version      1.2
// @description  Grabs the mediaId and re-adds the download button only on pages that have them removed
// @author       anonymous
// @match        https://vimm.net/vault/*
// @from         https://www.reddit.com/r/Roms/comments/1hcckqw/comment/m9f0p68/
// ==/UserScript==

(function() {
    const downloadForm = document.querySelector('#dl_form');
    const downloadButton = downloadForm?.querySelector('button[type="submit"][style="width:100%"]');

    if (downloadForm && !downloadButton) {
        downloadForm.insertAdjacentHTML('beforeend', '<button type="submit" style="width:34%">Download</button>');
    }
})();
