// ==UserScript==
// @name 中文字体优化
// @namespace https://github.com/aenerv7/Dox
// @version 5.1
// @description 优化中文字体的显示
// @author AENERV7
// @license CC-BY-NC-ND-4.0
// @grant GM_addStyle
// @run-at document-start
// @match *://*/*
// @icon https://github.com/aenerv7/Dox/raw/refs/heads/master/Userscript/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.png
// @downloadURL https://github.com/aenerv7/Dox/raw/refs/heads/master/Userscript/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.user.js
// @updateURL https://github.com/aenerv7/Dox/raw/refs/heads/master/Userscript/%E4%B8%AD%E6%96%87%E5%AD%97%E4%BD%93%E4%BC%98%E5%8C%96.user.js
// ==/UserScript==

(function() {
    let css = `
    
    /* 标准字体 */

    @font-face {
        font-family: standard;
        src: local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face {
        font-family: Standard;
        src: local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face
    {
    font-family: serif;
    src: local('Source Han Serif CN');
    }

    @font-face
    {
    font-family: Serif;
    src: local('Source Han Serif CN');
    }

    @font-face
    {
    font-family: sans-serif;
    src: local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face
    {
    font-family: Sans-Serif;
    src: local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face
    {
    font-family: monospace;
    src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face
    {
    font-family: Monospace;
    src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
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
        src: local('Microsoft YaHei'), local('PingFang SC');
    }

    /* 英文 衬线 */

    @font-face {
        font-family: Georgia;
        src: local(Georgia), local('Source Han Serif CN');
    }

    @font-face {
        font-family: Georgia;
        src: local('Source Han Serif CN');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: Times;
        src: local(Times), local('Source Han Serif CN');
    }

    @font-face {
        font-family: Times;
        src: local('Source Han Serif CN');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: 'Times New Roman';
        src: local('Times New Roman'), local('Source Han Serif CN');
    }

    @font-face {
        font-family: 'Times New Roman';
        src: local('Source Han Serif CN');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    /* 英文 无衬线 */

    @font-face {
        font-family: -apple-system;
        src: local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face {
        font-family: -apple-system;
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: Helvetica;
        src: local(Helvetica), local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face {
        font-family: Helvetica;
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: 'helvetica neue';
        src: local('helvetica neue'), local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face {
        font-family: 'helvetica neue';
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: 'Helvetica Neue';
        src: local('Helvetica Neue'), local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face {
        font-family: 'Helvetica Neue';
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: 'lucida grande';
        src: local('lucida grande'), local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face {
        font-family: 'lucida grande';
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: 'Lucida Grande';
        src: local('Lucida Grande'), local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face {
        font-family: 'Lucida Grande';
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: 'Open Sans';
        src: local('Open Sans'), local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face {
        font-family: 'Open Sans';
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: 'Segoe UI';
        src: local('Segoe UI'), local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face {
        font-family: 'Segoe UI';
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: Tahoma;
        src: local(Tahoma), local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face {
        font-family: Tahoma;
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: Verdana;
        src: local(Verdana), local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face {
        font-family: Verdana;
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    /* 等宽 */

    @font-face {
        font-family: Consolas;
        src: local(Consolas), local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: Consolas;
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: Courier;
        src: local(Courier), local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: Courier;
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: 'Courier New';
        src: local('Courier New'), local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: 'Courier New';
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: FantasqueSansMonoRegular;
        src: local(FantasqueSansMonoRegular), local('JetBrains Maple Mono'), local('SF Mono');
    }

    @font-face {
        font-family: FantasqueSansMonoRegular;
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: 'lucida console';
        src: local('lucida console'), local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: 'lucida console';
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: 'Lucida Console';
        src: local('Lucida Console'), local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: 'Lucida Console';
        src: local('Microsoft YaHei'), local('PingFang SC');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: MingLiU;
        src: local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face {
        font-family: MingLiU-ExtB;
        src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: MingLiU_HKSCS;
        src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: MingLiU_HKSCS-ExtB;
        src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: nsimsun;
        src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: NSimsun;
        src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: 细明体;
        src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: '细明体';
        src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: 細明體;
        src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: '細明體';
        src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: 新宋体;
        src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: '新宋体';
        src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: 新宋體;
        src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    @font-face {
        font-family: '新宋體';
        src: local('JetBrains Maple Mono'), local('Cascadia Mono'), local('SF Mono');
    }

    /* 特殊 */

    @font-face {
        font-family: 'Comic Sans MS';
        src: local('Comic Sans MS'), local('LXGW WenKai');
    }

    @font-face {
        font-family: 'Comic Sans MS';
        src: local('LXGW WenKai');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: Impact;
        src: local(Impact), local('LXGW WenKai');
    }

    @font-face {
        font-family: Impact;
        src: local('LXGW WenKai');
        unicode-range: U+4E00-9FA5, U+9FA6-9FEF, U+3400-4DB5, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2B820-2CEA1, U+2CEB0-2EBE0, U+2F00-2FD5, U+2E80-2EF3, U+F900-FAD9, U+2F800-2FA1D, U+E815-E86F, U+E400-E5E8, U+E600-E6CF, U+31C0-31E3, U+2FF0-2FFB, U+3105-312F, U+31A0-31BA, U+3007;
    }

    @font-face {
        font-family: 瀹嬩綋;
        src: local('Microsoft YaHei'), local('PingFang SC');
    }

    @font-face {
        font-family: '瀹嬩綋';
        src: local('Microsoft YaHei'), local('PingFang SC');
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
    