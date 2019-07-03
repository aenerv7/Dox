// ==UserScript==
// @name          中文字体优化
// @description	  根据平台自适应中文字体优化
// @author        aenerv7
// @run-at        document-start
// @version       1.3
// @namespace 	  https://greasyfork.org/users/4220
// ==/UserScript==
(function () {
	// 通用字体
	var css = "@font-face { font - family: serif; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode - range: U + 0 - 10FFFF; } \n";
	css = css.concat("@font-face { font - family: sans-serif; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode - range: U + 0 - 10FFFF; } \n");
	css = css.concat("@font-face { font - family: -webkit-standard; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode - range: U + 0 - 10FFFF; } \n");
	css = css.concat("@font-face { font - family: monospace; src: local('Sarasa Term SC'); unicode - range: U + 0 - 10FFFF; } \n");
	// 简体
	css = css.concat("@font-face { font-family: 'Heiti SC'; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: 'Hiragino Sans GB'; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: 'Microsoft Yahei'; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: 'Microsoft YaHei'; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: 'WenQuanYi Micro Hei'; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: Simhei; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: Simsun; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: STHeiti; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: 黑体; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: '黑体'; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: 华文黑体; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: 宋体; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: '宋体'; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: 新细明体; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: '新细明体'; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	// 繁体
	css = css.concat("@font-face { font-family: PMingLiU; src: local('PingFang TC'), local('Microsoft JhengHei UI'); } \n");
	css = css.concat("@font-face { font-family: 宋體; src: local('PingFang TC'), local('Microsoft JhengHei UI'); } \n");
	css = css.concat("@font-face { font-family: '宋體'; src: local('PingFang TC'), local('Microsoft JhengHei UI'); } \n");
	css = css.concat("@font-face { font-family: 新細明體; src: local('PingFang TC'), local('Microsoft JhengHei UI'); } \n");
	css = css.concat("@font-face { font-family: '新細明體'; src: local('PingFang TC'), local('Microsoft JhengHei UI'); } \n");
	// 日文
	css = css.concat("@font-face { font-family: Meiryo; src: local('Hiragino Kaku Gothic ProN'), local('Yu Gothic UI'); } \n");
	css = css.concat("@font-face { font-family: 'Meiryo UI'; src: local('Hiragino Kaku Gothic ProN'), local('Yu Gothic UI'); } \n");
	css = css.concat("@font-face { font-family: 'MS PGothic'; src: local('Hiragino Kaku Gothic ProN'), local('Yu Gothic UI'); } \n");
	css = css.concat("@font-face { font-family: 'ＭＳ Ｐゴシック'; src: local('Hiragino Kaku Gothic ProN'), local('Yu Gothic UI'); } \n");
	css = css.concat("@font-face { font-family: 'ヒラギノ角ゴ Pro W3'; src: local('Hiragino Kaku Gothic ProN'), local('Yu Gothic UI'); } \n");
	// 等宽字体
	css = css.concat("@font-face { font-family: Consolas; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: Courier; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: 'Courier New''; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: FantasqueSansMonoRegular; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: 'Lucida Console'; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: MingLiU; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: MingLiU-ExtB; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: MingLiU_HKSCS; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: MingLiU_HKSCS-ExtB; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: NSimsun; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: 细明体; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: '细明体'; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: 細明體; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: '細明體'; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: 新宋体; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: '新宋体'; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: 新宋體; src: local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: '新宋體'; src: local('Sarasa Term SC'); } \n");
	// 特殊
	css = css.concat("@font-face { font-family: 瀹嬩綋; src: local('PingFang SC'), local('Microsoft YaHei UI'); }");

	if (typeof GM_addStyle != "undefined") {
		GM_addStyle(css);
	} else if (typeof PRO_addStyle != "undefined") {
		PRO_addStyle(css);
	} else if (typeof addStyle != "undefined") {
		addStyle(css);
	} else {
		var node = document.createElement("style");
		node.type = "text/css";
		node.appendChild(document.createTextNode(css));
		var heads = document.getElementsByTagName("head");
		if (heads.length > 0) {
			heads[0].appendChild(node);
		} else {
			// no head yet, stick it whereever
			document.documentElement.appendChild(node);
		}
	}
})();