/**
 * HTML/XML 实体解码，用于订阅源中的纯文本字段（标题、作者、摘要、订阅源名称等）。
 *
 * fast-xml-parser 默认只解码 XML 预定义实体（&amp; &lt; &gt; &quot; &apos;），
 * 数字字符引用（&#38;、&#038;、&#x26;）和常见 HTML 命名实体（&rsquo;、&mdash; 等）
 * 会原样保留。WordPress 等系统在标题里把 & 转义成 &#038;，于是阅读器直接显示了
 * 原始实体文本。这里按 fast-xml-parser 的 htmlEntities: true 行为补齐这两类解码。
 */

const NAMED_ENTITIES: Record<string, string> = {
  // XML 预定义
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
  // 常见 HTML（对应 @nodable/entities 的 COMMON_HTML）
  nbsp: "\u00a0",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  laquo: "\u00ab",
  raquo: "\u00bb",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  bull: "\u2022",
  para: "\u00b6",
  sect: "\u00a7",
  deg: "\u00b0",
  frac12: "\u00bd",
  frac14: "\u00bc",
  frac34: "\u00be",
  // 货币（对应 CURRENCY）
  cent: "\u00a2",
  pound: "\u00a3",
  curren: "\u00a4",
  yen: "\u00a5",
  euro: "\u20ac",
  dollar: "$",
  fnof: "\u0192",
  inr: "\u20b9",
  af: "\u060b",
  birr: "\u12ed",
  peso: "\u20b1",
  rub: "\u20bd",
  won: "\u20a9",
  yuan: "\u00a5",
  cedil: "\u00b8",
};

// &name;（命名实体）或 &#38; / &#x26;（数字字符引用，支持前导零与大写 X）
const ENTITY_PATTERN = /&(#x?[0-9a-fA-F]+|[a-z]+);/gi;

function decodeNumericRef(match: string, body: string): string {
  const hex = body[1]?.toLowerCase() === "x";
  const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
  // 跳过非法码点：0、超出 Unicode 范围、代理区（与 HTML 规范一致）
  if (Number.isInteger(code) && code >= 1 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) {
    try {
      return String.fromCodePoint(code);
    } catch {
      return match;
    }
  }
  return match;
}

/**
 * 解码文本中的数字字符引用（&#38;、&#038;、&#x26;）与常见 HTML 命名实体。
 * 未知/非法实体原样保留；对已解码的文本是幂等的。
 */
export function decodeHtmlEntities(value: string): string {
  return value.replace(ENTITY_PATTERN, (match, body: string) => {
    if (body[0] === "#") return decodeNumericRef(match, body);
    return NAMED_ENTITIES[body] ?? match;
  });
}
