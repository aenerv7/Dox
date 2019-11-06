// ==UserScript==
// @name          中文字体优化
// @description	  根据平台自适应中文字体优化
// @author        aenerv7
// @run-at        document-start
// @version       2.2
// @namespace 	  https://greasyfork.org/users/4220
// ==/UserScript==
(function () {
	// 通用字体
	var css = "@font-face { font-family: serif; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n";
	css = css.concat("@font-face { font-family: sans-serif; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: -webkit-standard; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: monospace; src: local('Sarasa Term SC'); } \n");
	// 英文
	css = css.concat("@font-face { font-family: -apple-system; src: local(-apple-system), local(BlinkMacSystemFont), local('Segoe UI'); } \n");
	css = css.concat("@font-face { font-family: -apple-system; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: Arial; src: local(Arial), local(-apple-system), local(BlinkMacSystemFont), local('Segoe UI'); } \n");
	css = css.concat("@font-face { font-family: Arial; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: BlinkMacSystemFont; src: local(BlinkMacSystemFont), local(-apple-system), local('Segoe UI'); } \n");
	css = css.concat("@font-face { font-family: BlinkMacSystemFont; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: Helvetica; src: local(Helvetica), local(-apple-system), local(BlinkMacSystemFont), local('Segoe UI'); } \n");
	css = css.concat("@font-face { font-family: Helvetica; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: 'helvetica neue'; src: local('Helvetica Neue'), local(-apple-system), local(BlinkMacSystemFont), local('Segoe UI'); } \n");
	css = css.concat("@font-face { font-family: 'helvetica neue'; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: 'Helvetica Neue'; src: local('Helvetica Neue'), local(-apple-system), local(BlinkMacSystemFont), local('Segoe UI'); } \n");
	css = css.concat("@font-face { font-family: 'Helvetica Neue'; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: 'lucida grande'; src: local('lucida grande'), local(-apple-system), local(BlinkMacSystemFont), local('Segoe UI'); } \n");
	css = css.concat("@font-face { font-family: 'lucida grande'; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: 'Lucida Grande'; src: local('Lucida Grande'), local(-apple-system), local(BlinkMacSystemFont), local('Segoe UI'); } \n");
	css = css.concat("@font-face { font-family: 'Lucida Grande'; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: 'Open Sans'; src: local('Open Sans'), local(-apple-system), local(BlinkMacSystemFont), local('Segoe UI'); } \n");
	css = css.concat("@font-face { font-family: 'Open Sans'; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: 'Segoe UI'; src: local('Segoe UI'), local(-apple-system), local(BlinkMacSystemFont); } \n");
	css = css.concat("@font-face { font-family: 'Segoe UI'; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: Tahoma; src: local(Tahoma), local(-apple-system), local(BlinkMacSystemFont), local('Segoe UI'); } \n");
	css = css.concat("@font-face { font-family: Tahoma; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: Times; src: local(Times), local(-apple-system), local(BlinkMacSystemFont), local('Segoe UI'); } \n");
	css = css.concat("@font-face { font-family: Times; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: 'Times New Roman'; src: local('Times New Roman'), local(-apple-system), local(BlinkMacSystemFont), local('Segoe UI'); } \n");
	css = css.concat("@font-face { font-family: 'Times New Roman'; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: Verdana; src: local(Verdana), local(-apple-system), local(BlinkMacSystemFont), local('Segoe UI'); } \n");
	css = css.concat("@font-face { font-family: Verdana; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	// 简体
	css = css.concat("@font-face { font-family: 'Heiti SC'; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: 'Hiragino Sans GB'; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: 'Microsoft Yahei'; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: 'Microsoft YaHei'; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: 'WenQuanYi Micro Hei'; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: simhei; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: Simhei; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	css = css.concat("@font-face { font-family: simsun; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
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
	css = css.concat("@font-face { font-family: Consolas; src: local(Consolas), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: Consolas; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: 'Lucida Console'; src: local('Lucida Console'), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: 'Lucida Console'; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: MingLiU; src: local(MingLiU), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: MingLiU; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: MingLiU-ExtB; src: local(MingLiU-ExtB), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: MingLiU-ExtB; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: MingLiU_HKSCS; src: local(MingLiU_HKSCS), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: MingLiU_HKSCS; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: MingLiU_HKSCS-ExtB; src: local(MingLiU_HKSCS-ExtB), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: MingLiU_HKSCS-ExtB; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: nsimsun; src: local(nsimsun), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: nsimsun; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: NSimsun; src: local(NSimsun), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: NSimsun; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: 细明体; src: local(细明体), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: 细明体; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: '细明体'; src: local('细明体'), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: '细明体'; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: 細明體; src: local(細明體), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: 細明體; src: local('PingFang TC'), local('Microsoft JhengHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: '細明體'; src: local('細明體'), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: '細明體'; src: local('PingFang TC'), local('Microsoft JhengHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: 新宋体; src: local(新宋体), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: 新宋体; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: '新宋体'; src: local('新宋体'), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: '新宋体'; src: local('PingFang SC'), local('Microsoft YaHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: 新宋體; src: local(新宋體), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: 新宋體; src: local('PingFang TC'), local('Microsoft JhengHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	css = css.concat("@font-face { font-family: '新宋體'; src: local('新宋體'), local('Sarasa Term SC'); } \n");
	css = css.concat("@font-face { font-family: '新宋體'; src: local('PingFang TC'), local('Microsoft JhengHei UI'); unicode-range: U+2E80-2EF3, U+2F00-2FD5, U+2FF0-2FFB, U+3007, U+3105-3120, U+31A0-31BA, U+31C0-31E3, U+3400-4DB5, U+4E00-9FA5, U+9FA6-9FCB, U+E400-E5E8, U+E600-E6CF, U+E815-E86F, U+F900-FAD9, U+20000-2A6D6, U+2A700-2B734, U+2B740-2B81D, U+2F800-2FA1D; } \n");
	// 特殊
	css = css.concat("@font-face { font-family: 瀹嬩綋; src: local('PingFang SC'), local('Microsoft YaHei UI'); } \n");
	// 元素修改
	css = css.concat("textarea { font-family: 'Sarasa Term SC'; }");

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