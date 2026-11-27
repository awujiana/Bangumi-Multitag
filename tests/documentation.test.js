const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
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
} = require('./documentation-structure.js');

const root = path.resolve(__dirname, '..');

function read(fileName) {
  return fs.readFileSync(path.join(root, fileName), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

/* ---------------------------- 真实文档校验 ---------------------------- */

test('README：徽章、双名标题与 AI 声明齐备', () => {
  const readme = read('README.md');

  assert.ok(countShieldsBadges(readme) >= 3, 'README 至少需要 3 个 shields.io 徽章');
  assert.match(readme, /协议-AGPL--3\.0/);
  assert.match(readme, /作者-awujiana/);

  assert.match(readme, /<h1>Bangumi 多标签检索<\/h1>/);
  assert.match(readme, /<h2>Bangumi-Multitag<\/h2>/);
  assert.ok(isDualTitleOrdered(readme), '中文标题 <h1> 必须完整闭合且位于仓库名 <h2> 之上');

  assert.ok(hasAiWarning(readme), '缺少 [!WARNING] AI 声明');
  assert.match(readme, /AI 辅助生成/);
  assert.ok(!hasHandWrittenWarning(readme), '不得手写 ⚠️ Warning');
});

test('README：目录条目都有对应章节，且无重复标题', () => {
  const readme = read('README.md');
  const entries = parseTableOfContents(readme);

  assert.ok(entries.length >= 6, '目录条目过少');
  for (const entry of entries) {
    assert.ok(hasSection(readme, entry.text), `目录「${entry.text}」缺少对应章节`);
  }
  assert.deepEqual(findDuplicateHeadings(readme), [], '存在重复的二级标题');
});

test('README：底部三节顺序与协议链接正确', () => {
  const readme = read('README.md');

  assert.ok(
    isSectionOrderValid(readme, ['关联仓库', '作者联系方式', '开源协议']),
    '底部三节顺序应为关联仓库 → 作者联系方式 → 开源协议',
  );
  assert.match(readme, /\[AGPL-3\.0\]\(LICENSE\)/);
  assert.match(readme, /bingshanlengtie@qq\.com/);
});

test('README：赞助章节位置、图片与自愿说明', () => {
  const readme = read('README.md');

  assert.ok(isSponsorPlacementValid(readme), '赞助章节应位于反馈建议之后、关联仓库之前，且含图片与自愿说明');
  assert.ok(exists('assets/sponsor-qrcode.png'), '赞赏码图片不存在');
});

test('README：本地链接与图片都存在', () => {
  const readme = read('README.md');
  const links = extractLocalLinks(readme);

  assert.ok(links.length > 0);
  for (const relativePath of links) {
    assert.ok(exists(relativePath), `引用的本地文件不存在：${relativePath}`);
  }
});

test('CONTRIBUTING：含完整命名规范与协议', () => {
  const contributing = read('CONTRIBUTING.md');

  assert.match(contributing, /<h1>贡献指南<\/h1>/);
  assert.ok(hasAiWarning(contributing), '缺少 [!WARNING] AI 声明');
  assert.ok(hasRequiredNamingRules(contributing), '命名规范缺项');
  assert.match(contributing, /\[AGPL-3\.0\]\(LICENSE\)/);
});

test('AGENTS：五段式结构完整且指向真实模块', () => {
  const agents = read('AGENTS.md');
  const sections = ['## 项目概述', '## 仓库结构', '## 必须遵守的约定', '## 改动前检查', '## 不要做的事'];

  let previous = -1;
  for (const section of sections) {
    const index = agents.indexOf(section);
    assert.ok(index > previous, `缺少或顺序错误的章节：${section}`);
    previous = index;
  }

  assert.match(agents, /filters\.js/);
  assert.match(agents, /requestData/);
  assert.match(agents, /bingshanlengtie@qq\.com/);
});

test('CHANGELOG：未发布与更早版本说明存在', () => {
  assert.ok(isChangelogValid(read('CHANGELOG.md')));
});

test('LICENSE：为完整 AGPL-3.0 文本', () => {
  assert.ok(isCompleteAgpl(read('LICENSE')));
});

/* ---------------------------- 徽章边界用例 ---------------------------- */

test('边界：普通图片不计入 shields.io 徽章', () => {
  const markdown = '![界面](assets/main-interface.png)\n![徽章](https://img.shields.io/badge/a-b-blue)';
  assert.equal(countShieldsBadges(markdown), 1);
});

test('边界：徽章不足 3 个时统计值正确', () => {
  const markdown = [
    '![协议](https://img.shields.io/badge/协议-AGPL--3.0-blue)',
    '![作者](https://img.shields.io/badge/作者-awujiana-orange)',
  ].join('\n');
  assert.equal(countShieldsBadges(markdown), 2);
});

test('边界：非 shields.io 图片链接不计入', () => {
  assert.equal(countShieldsBadges('![x](https://example.com/img.shields.io/badge/a)'), 0);
});

/* -------------------------- 目录解析边界用例 -------------------------- */

test('边界：没有目录章节时返回空数组', () => {
  assert.deepEqual(parseTableOfContents('## 🚀 项目简介\n正文'), []);
});

test('边界：目录含空行与尾部空白仍能解析', () => {
  const markdown = [
    '## 📚 目录',
    '',
    '- [项目简介](#项目简介)   ',
    '',
    '  - [嵌套条目](#嵌套条目)',
    '- [反馈建议](#反馈建议)',
    '',
    '## 🚀 项目简介',
    '- [不应被收录](#不应被收录)',
  ].join('\r\n');
  assert.deepEqual(parseTableOfContents(markdown), [
    { text: '项目简介', anchor: '项目简介' },
    { text: '反馈建议', anchor: '反馈建议' },
  ]);
});

test('边界：目录遇到下一个二级标题立即停止', () => {
  const markdown = '## 目录\n- [A](#a)\n## 正文\n- [B](#b)';
  assert.deepEqual(parseTableOfContents(markdown), [{ text: 'A', anchor: 'a' }]);
});

/* ------------------------- 双名标题边界用例 ------------------------- */

test('边界：英文名在前时判定失败', () => {
  const markdown = '<h2>Bangumi-Multitag</h2>\n<h1>Bangumi 多标签检索</h1>';
  assert.equal(isDualTitleOrdered(markdown), false);
});

test('边界：<h1> 未闭合时判定失败', () => {
  assert.equal(isDualTitleOrdered('<h1>Bangumi 多标签检索\n<h2>Bangumi-Multitag</h2>'), false);
});

test('边界：缺少 <h2> 时判定失败', () => {
  assert.equal(isDualTitleOrdered('<h1>Bangumi 多标签检索</h1>'), false);
});

test('边界：标准双名标题判定通过', () => {
  assert.equal(isDualTitleOrdered('<h1>中文名</h1>\n<h2>english-name</h2>'), true);
});

/* ------------------------- AI 声明边界用例 ------------------------- */

test('边界：小写 [!warning] 不算 AI 声明', () => {
  assert.equal(hasAiWarning('> [!warning]\n> 由 AI 辅助生成'), false);
});

test('边界：行首夹带文字的 [!WARNING] 不算', () => {
  assert.equal(hasAiWarning('说明文字 > [!WARNING]'), false);
});

test('边界：标准 [!WARNING] 判定通过', () => {
  assert.equal(hasAiWarning('> [!WARNING]\n> 由 AI 辅助生成'), true);
});

test('边界：手写 ⚠️ Warning 能被识别，正规告警不会误判', () => {
  assert.equal(hasHandWrittenWarning('> ⚠️ Warning: 请勿用于生产'), true);
  assert.equal(hasHandWrittenWarning('> [!WARNING]\n> 请勿用于生产'), false);
});

/* -------------------------- 章节定位边界用例 -------------------------- */

test('边界：缺失章节返回 -1', () => {
  assert.equal(findSectionPosition('## 项目简介', '反馈建议'), -1);
  assert.equal(hasSection('## 项目简介', '反馈建议'), false);
});

test('边界：章节名含正则特殊字符也能精确定位', () => {
  const markdown = '## 反馈建议（Beta）\n正文';
  assert.ok(findSectionPosition(markdown, '反馈建议（Beta）') > -1);
});

test('边界：章节倒序时顺序校验失败', () => {
  const markdown = '## 关联仓库\n## 作者联系方式\n## 开源协议';
  assert.equal(isSectionOrderValid(markdown, ['关联仓库', '作者联系方式', '开源协议']), true);
  assert.equal(isSectionOrderValid(markdown, ['开源协议', '关联仓库']), false);
});

test('边界：章节齐全但缺少中间项时顺序校验失败', () => {
  assert.equal(isSectionOrderValid('## 关联仓库\n## 开源协议', ['关联仓库', '作者联系方式', '开源协议']), false);
});

test('边界：重复二级标题会被列出', () => {
  const markdown = '## 💰 赞助\n正文\n## 💰 赞助';
  assert.deepEqual(findDuplicateHeadings(markdown), ['## 💰 赞助']);
  assert.deepEqual(findDuplicateHeadings('## A\n## B'), []);
});

/* ------------------------- 本地链接边界用例 ------------------------- */

test('边界：外链、锚点、邮件与协议相对地址都不算本地链接', () => {
  const markdown = [
    '[外链](https://example.com/a.png)',
    '[锚点](#readme)',
    '[邮件](mailto:a@b.com)',
    '[协议相对](//cdn.example.com/a.png)',
  ].join('\n');
  assert.deepEqual(extractLocalLinks(markdown), []);
});

test('边界：本地链接去掉片段并做百分号解码', () => {
  const markdown = '[文档](docs/%E4%B8%AD%E6%96%87.md#L10)';
  assert.deepEqual(extractLocalLinks(markdown), ['docs/中文.md']);
});

test('边界：重复本地链接只保留一次', () => {
  const markdown = '![a](assets/a.png)\n![b](assets/a.png)';
  assert.deepEqual(extractLocalLinks(markdown), ['assets/a.png']);
});

/* -------------------------- 赞助章节边界用例 -------------------------- */

const VALID_SPONSOR = [
  '## 💬 反馈建议',
  '## 💰 赞助',
  '> 赞赏完全自愿，不影响功能使用。',
  '![赞赏码](assets/sponsor-qrcode.png)',
  '## 🔗 关联仓库',
].join('\n');

test('边界：赞助章节位置合法时判定通过', () => {
  assert.equal(isSponsorPlacementValid(VALID_SPONSOR), true);
});

test('边界：赞助章节放在反馈建议之前判定失败', () => {
  const markdown = '## 💰 赞助\n> 自愿\n![赞赏码](assets/sponsor-qrcode.png)\n## 💬 反馈建议\n## 🔗 关联仓库';
  assert.equal(isSponsorPlacementValid(markdown), false);
});

test('边界：赞助章节放在关联仓库之后判定失败', () => {
  const markdown = '## 💬 反馈建议\n## 🔗 关联仓库\n## 💰 赞助\n> 自愿\n![赞赏码](assets/sponsor-qrcode.png)';
  assert.equal(isSponsorPlacementValid(markdown), false);
});

test('边界：缺少赞赏码图片判定失败', () => {
  const markdown = '## 💬 反馈建议\n## 💰 赞助\n> 自愿\n## 🔗 关联仓库';
  assert.equal(isSponsorPlacementValid(markdown), false);
});

test('边界：缺少自愿说明判定失败', () => {
  const markdown = '## 💬 反馈建议\n## 💰 赞助\n![赞赏码](assets/sponsor-qrcode.png)\n## 🔗 关联仓库';
  assert.equal(isSponsorPlacementValid(markdown), false);
});

/* ------------------------- 命名规范边界用例 ------------------------- */

test('边界：命名规范缺少数字后缀条目判定失败', () => {
  const markdown = '## 命名规范（不缩写）\n一律全拼，禁止缩写。';
  assert.equal(hasRequiredNamingRules(markdown), false);
});

test('边界：命名规范三条硬规则齐备判定通过', () => {
  const markdown = '## 命名规范（不缩写）\n一律全拼；不使用数字后缀。';
  assert.equal(hasRequiredNamingRules(markdown), true);
});

/* -------------------------- CHANGELOG 边界用例 -------------------------- */

test('边界：非法版本号（缺少补丁位）判定失败', () => {
  const markdown = '# 更新日志\n\n## [未发布]\n\n## [1.0] - 2026-01-01\n\n## 更早的版本';
  assert.equal(isChangelogValid(markdown), false);
});

test('边界：缺少更早版本说明判定失败', () => {
  const markdown = '# 更新日志\n\n## [未发布]\n\n## [1.0.0] - 2026-01-01';
  assert.equal(isChangelogValid(markdown), false);
});

test('边界：结构完整的 CHANGELOG 判定通过', () => {
  const markdown = '# 更新日志\n\n## [未发布]\n\n## [1.0.0] - 2026-01-01\n\n## 更早的版本';
  assert.equal(isChangelogValid(markdown), true);
});

/* ---------------------------- LICENSE 边界用例 ---------------------------- */

test('边界：截断的 AGPL 文本判定失败', () => {
  assert.equal(isCompleteAgpl('GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3, 19 November 2007'), false);
  assert.equal(isCompleteAgpl(''), false);
});
