/**
 * 冒烟测试专用的探针入口：只把三个 peggy 解析器拉进构建图，
 * 用来验证构建期预编译出来的解析器在禁止 eval 的环境里仍能正常工作。
 */

import getLoonParser from '@/core/proxy-utils/parsers/peggy/loon';
import getQXParser from '@/core/proxy-utils/parsers/peggy/qx';
import getSurgeParser from '@/core/proxy-utils/parsers/peggy/surge';

export const parsers = {
    loon: getLoonParser(),
    qx: getQXParser(),
    surge: getSurgeParser(),
};
