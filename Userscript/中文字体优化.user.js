// ==UserScript==
// @name 中文字体优化
// @namespace https://github.com/aenerv7/Dox
// @version 5.7
// @description 优化中文字体的显示
// @icon https://github.com/aenerv7/Dox/raw/refs/heads/main/Userscript/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.png
// @author AENERV7
// @license CC-BY-NC-ND-4.0
// @grant GM_addStyle
// @run-at document-start
// @match *://*/*
// @downloadURL https://github.com/aenerv7/Dox/raw/refs/heads/main/Userscript/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.user.js
// @updateURL https://github.com/aenerv7/Dox/raw/refs/heads/main/Userscript/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.user.js
// ==/UserScript==

(function () {
    let css = `

    /* 标准字体 */

    @font-face {
        font-family: standard;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: Standard;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: serif;
        src: local('Noto Serif SC'), local('Songti SC');
    }

    @font-face {
        font-family: Serif;
        src: local('Noto Serif SC'), local('Songti SC');
    }

    @font-face {
        font-family: sans-serif;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: Sans-Serif;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: monospace;
        src: local('Maple Mono Normal NF CN');
    }

    @font-face {
        font-family: Monospace;
        src: local('Maple Mono Normal NF CN');
    }

    @font-face {
        font-family: cursive;
        src: local('LXGW WenKai');
    }

    @font-face {
        font-family: Cursive;
        src: local('LXGW WenKai');
    }

    @font-face {
        font-family: fantasy;
        src: local('Yozai');
    }

    @font-face {
        font-family: Fantasy;
        src: local('Yozai');
    }

    @font-face {
        font-family: -webkit-standard;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    /* 英文 衬线 */

    @font-face {
        font-family: Georgia;
        src: local(Georgia), local('Noto Serif SC'), local('Songti SC');
    }

    @font-face {
        font-family: Georgia;
        src: local('Noto Serif SC'), local('Songti SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: Times;
        src: local(Times), local('Noto Serif SC'), local('Songti SC');
    }

    @font-face {
        font-family: Times;
        src: local('Noto Serif SC'), local('Songti SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: 'Times New Roman';
        src: local('Times New Roman'), local('Noto Serif SC'), local('Songti SC');
    }

    @font-face {
        font-family: 'Times New Roman';
        src: local('Noto Serif SC'), local('Songti SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    /* 英文 无衬线 */

    @font-face {
        font-family: -apple-system;
        src: local(-apple-system), local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: -apple-system;
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: Helvetica;
        src: local(Helvetica), local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: Helvetica;
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: 'helvetica neue';
        src: local('helvetica neue'), local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: 'helvetica neue';
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: 'Helvetica Neue';
        src: local('Helvetica Neue'), local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: 'Helvetica Neue';
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: 'lucida grande';
        src: local('lucida grande'), local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: 'lucida grande';
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: 'Lucida Grande';
        src: local('Lucida Grande'), local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: 'Lucida Grande';
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: 'Open Sans';
        src: local('Open Sans'), local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: 'Open Sans';
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: 'Segoe UI';
        src: local('Segoe UI'), local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: 'Segoe UI';
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: Tahoma;
        src: local(Tahoma), local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: Tahoma;
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: Verdana;
        src: local(Verdana), local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: Verdana;
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    /* 等宽 */

    @font-face {
        font-family: Consolas;
        src: local(Consolas), local('Maple Mono Normal NF CN');
    }

    @font-face {
        font-family: Consolas;
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: Courier;
        src: local(Courier), local('Maple Mono Normal NF CN');
    }

    @font-face {
        font-family: Courier;
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: 'Courier New';
        src: local('Courier New'), local('Maple Mono Normal NF CN');
    }

    @font-face {
        font-family: 'Courier New';
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: FantasqueSansMonoRegular;
        src: local(FantasqueSansMonoRegular), local('JetBrains Maple Mono'), local('SF Mono');
    }

    @font-face {
        font-family: FantasqueSansMonoRegular;
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: 'lucida console';
        src: local('lucida console'), local('Maple Mono Normal NF CN');
    }

    @font-face {
        font-family: 'lucida console';
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: 'Lucida Console';
        src: local('Lucida Console'), local('Maple Mono Normal NF CN');
    }

    @font-face {
        font-family: 'Lucida Console';
        src: local('Noto Sans SC'), local('PingFang SC');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    /* 旧式中文字体替换 */

    @font-face {
        font-family: SimSun;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: simsun;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: 宋体;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: '宋体';
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: 宋體;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: '宋體';
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: NSimSun;
        src: local('Maple Mono Normal NF CN');
    }

    @font-face {
        font-family: nsimsun;
        src: local('Maple Mono Normal NF CN');
    }

    @font-face {
        font-family: 新宋体;
        src: local('Maple Mono Normal NF CN');
    }

    @font-face {
        font-family: '新宋体';
        src: local('Maple Mono Normal NF CN');
    }

    @font-face {
        font-family: 新宋體;
        src: local('Maple Mono Normal NF CN');
    }

    @font-face {
        font-family: '新宋體';
        src: local('Maple Mono Normal NF CN');
    }

    @font-face {
        font-family: MingLiU;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: MingLiU-ExtB;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: MingLiU_HKSCS;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: MingLiU_HKSCS-ExtB;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: 细明体;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: '细明体';
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: 細明體;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: '細明體';
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    /* 特殊 */

    @font-face {
        font-family: 'Comic Sans MS';
        src: local('Comic Sans MS'), local('LXGW WenKai');
    }

    @font-face {
        font-family: 'Comic Sans MS';
        src: local('LXGW WenKai');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    @font-face {
        font-family: Impact;
        src: local(Impact), local('LXGW WenKai');
    }

    @font-face {
        font-family: Impact;
        src: local('LXGW WenKai');
        unicode-range: U+4E00-9FFF, U+3400-4DBF, U+20000-2A6DF, U+2A700-2B739, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2EBF0-2F7FF, U+30000-3134A, U+31350-323AF, U+F900-FAFF, U+2F800-2FA1F, U+2F00-2FD5, U+2E80-2EFF, U+31C0-31EF, U+2FF0-2FFF, U+3000-303F, U+FF00-FFEF, U+FE10-FE1F, U+FE30-FE4F, U+3200-32FF, U+3300-33FF, U+3100-312F, U+31A0-31BF, U+3040-309F, U+30A0-30FF, U+31F0-31FF, U+AC00-D7AF, U+1100-11FF, U+3130-318F, U+4DC0-4DFF, U+A000-A48F, U+A490-A4CF, U+1D300-1D35F, U+2600-26FF, U+2700-27BF, U+2800-28FF, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+3007;
    }

    /* "瀹嬩綋" 是 "宋体" 的 GBK→UTF-8 mojibake 编码产物，保留以兼容错误编码的网页 */

    @font-face {
        font-family: 瀹嬩綋;
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    @font-face {
        font-family: '瀹嬩綋';
        src: local('Noto Sans SC'), local('PingFang SC');
    }

    `;
    if (typeof GM_addStyle !== "undefined") {
        GM_addStyle(css);
    } else {
        const styleNode = document.createElement("style");
        styleNode.appendChild(document.createTextNode(css));
        (document.querySelector("head") || document.documentElement).appendChild(styleNode);
    }
})();
