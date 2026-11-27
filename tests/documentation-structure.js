/*
 * README / CONTRIBUTING / AGENTS / CHANGELOG 的结构校验纯函数。
 * 不读取文件，便于在测试里传入真实文档或边界样例。
 */

const SHIELDS_BADGE = /!\[[^\]]*\]\(https:\/\/img\.shields\.io\/[^)\s]+\)/g;
const HAND_WRITTEN_WARNING = /⚠️\s*Warning/i;
const AI_ALERT = /^> \[!WARNING\]$/m;

/** 统计 shields.io 徽章数量（普通图片不计入）。 */
function countShieldsBadges(markdown) {
  return (markdown.match(SHIELDS_BADGE) || []).length;
}

/** 解析「目录」章节的 `- [文本](#锚点)` 条目，遇到下一个二级标题停止。 */
function parseTableOfContents(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+.*目录\s*$/.test(line));
  if (start < 0) return [];

  const entries = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line)) break;
    const matched = line.trimEnd().match(/^- \[([^\]]+)\]\(#([^)]+)\)$/);
    if (matched) entries.push({ text: matched[1], anchor: matched[2] });
  }
  return entries;
}

/** 双名标题必须完整闭合，且中文 <h1> 位于仓库名 <h2> 之前。 */
function isDualTitleOrdered(markdown) {
  const chinese = markdown.indexOf('<h1>');
  const chineseEnd = markdown.indexOf('</h1>');
  const english = markdown.indexOf('<h2>');
  const englishEnd = markdown.indexOf('</h2>');
  if (chinese < 0 || chineseEnd < 0 || english < 0 || englishEnd < 0) return false;
  return chinese < chineseEnd && chineseEnd < english && english < englishEnd;
}

function hasAiWarning(markdown) {
  return AI_ALERT.test(markdown);
}

function hasHandWrittenWarning(markdown) {
  return HAND_WRITTEN_WARNING.test(markdown);
}

/** 查找二级标题中包含指定文本的位置，找不到返回 -1。 */
function findSectionPosition(markdown, text) {
  const matched = new RegExp(`^## .*${escapeRegExp(text)}.*$`, 'm').exec(markdown);
  return matched ? matched.index : -1;
}

function hasSection(markdown, text) {
  return findSectionPosition(markdown, text) > -1;
}

/** 按给定顺序检查章节是否齐全且先后有序。 */
function isSectionOrderValid(markdown, texts) {
  let previous = -1;
  for (const text of texts) {
    const position = findSectionPosition(markdown, text);
    if (position < 0 || position <= previous) return false;
    previous = position;
  }
  return true;
}

/** 列出重复的二级标题（同名章节会破坏锚点）。 */
function findDuplicateHeadings(markdown) {
  const counts = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    if (!/^##\s+/.test(line)) continue;
    const title = line.trim();
    counts.set(title, (counts.get(title) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([title]) => title);
}

/** 提取本地链接，忽略 http(s)、mailto、纯锚点与协议相对地址，并去掉片段。 */
function extractLocalLinks(markdown) {
  const links = [];
  for (const matched of markdown.matchAll(/\]\((?!https?:|mailto:|#|\/\/)([^)\s]+)\)/g)) {
    const withoutFragment = matched[1].split('#')[0];
    if (!withoutFragment) continue;
    links.push(decodeURIComponent(withoutFragment));
  }
  return [...new Set(links)];
}

/** 赞助章节必须位于反馈建议之后、关联仓库之前，且包含图片与自愿说明。 */
function isSponsorPlacementValid(markdown) {
  const feedback = findSectionPosition(markdown, '反馈建议');
  const sponsor = findSectionPosition(markdown, '赞助');
  const related = findSectionPosition(markdown, '关联仓库');
  if (feedback < 0 || sponsor < 0 || related < 0) return false;
  if (!(feedback < sponsor && sponsor < related)) return false;
  if (!/assets\/sponsor-qrcode\.(png|jpg|jpeg|webp)/.test(markdown)) return false;
  return /自愿/.test(markdown);
}

/** CONTRIBUTING 的命名规范小节必须包含全拼与禁用数字后缀两条硬规则。 */
function hasRequiredNamingRules(markdown) {
  return /命名规范（不缩写）/.test(markdown) && /全拼/.test(markdown) && /数字后缀/.test(markdown);
}

/** CHANGELOG 必含未发布、语义化版本与更早版本说明。 */
function isChangelogValid(markdown) {
  return (
    /^# 更新日志$/m.test(markdown) &&
    /^## \[未发布\]$/m.test(markdown) &&
    /^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$/m.test(markdown) &&
    /^## 更早的版本$/m.test(markdown)
  );
}

/** AGPL-3.0 必须包含标题、版本与条款结尾三个标记。 */
function isCompleteAgpl(license) {
  return (
    /GNU AFFERO GENERAL PUBLIC LICENSE/.test(license) &&
    /Version 3, 19 November 2007/.test(license) &&
    /END OF TERMS AND CONDITIONS/.test(license)
  );
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  countShieldsBadges,
  parseTableOfContents,
  isDualTitleOrdered,
  hasAiWarning,
  hasHandWrittenWarning,
  findSectionPosition,
  hasSection,
  isSectionOrderValid,
  findDuplicateHeadings,
  extractLocalLinks,
  isSponsorPlacementValid,
  hasRequiredNamingRules,
  isChangelogValid,
  isCompleteAgpl,
};
