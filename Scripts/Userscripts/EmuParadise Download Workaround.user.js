// ==UserScript==
// @name         EmuParadise Download Workaround
// @version      1.2.0
// @description  Replaces the download button link with a working one
// @author       Eptun
// @match        https://www.emuparadise.me/*/*/*
// @grant        none
// @downloadURL  https://github.com/aenerv7/Dox/raw/refs/heads/main/Scripts/Userscripts/EmuParadise%20Download%20Workaround.user.js
// @updateURL    https://github.com/aenerv7/Dox/raw/refs/heads/main/Scripts/Userscripts/EmuParadise%20Download%20Workaround.user.js
// ==/UserScript==

(function() {
    'use strict';

    const id = location.pathname.split('/')[3];
    if (!/^\d+$/.test(id)) {
        return;
    }

    const url = new URL('/roms/get-download.php', location.origin);
    url.searchParams.set('gid', id);
    url.searchParams.set('test', 'true');

    for (const container of document.querySelectorAll('.download-link')) {
        const link = document.createElement('a');
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Download using the workaround script';
        link.title = link.textContent;
        container.prepend(link, document.createElement('br'), document.createElement('br'));
    }
})();
