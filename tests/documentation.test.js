const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(fileName) {
  return fs.readFileSync(path.join(root, fileName), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

/** 提取 README 目录区的条目文本与锚点。 */
function parseTableOfContents(markdown) {
  const section = markdown.split('## 📚 目录')[1]?.split('\n## ')[0] || '';
  return [...section.matchAll(/^- \[([^\]]+)\]\(#([^)]+)\)$/gm)].map((match) => ({
    text: match[1],
    anchor: match[2],
  }));
}

test('README：徽章、双名标题与 AI 声明齐备', () => {
  const readme = read('README.md');

  const badges = [...readme.matchAll(/!\[[^\]]*\]\(https:\/\/img\.shields\.io\//g)];
  assert.ok(badges.length >= 3, 'README 至少需要 3 个 shields.io 徽章');
  assert.match(readme, /协议-AGPL--3\.0/);
  assert.match(readme, /作者-awujiana/);

  const chineseTitle = readme.indexOf('<h1>Bangumi 多标签检索</h1>');
  const englishTitle = readme.indexOf('<h2>Bangumi-Multitag</h2>');
  assert.ok(chineseTitle > -1, '缺少中文标题 <h1>');
  assert.ok(englishTitle > -1, '缺少仓库名标题 <h2>');
  assert.ok(chineseTitle < englishTitle, '中文标题必须位于英文仓库名之上');

  assert.match(readme, /^> \[!WARNING\]$/m);
  assert.match(readme, /AI 辅助生成/);
  assert.doesNotMatch(readme, /⚠️\s*Warning/);
});

test('README：目录锚点都有对应章节', () => {
  const readme = read('README.md');
  const entries = parseTableOfContents(readme);

  assert.ok(entries.length >= 6, '目录条目过少');
  for (const entry of entries) {
    const heading = new RegExp(`^## .*${entry.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
    assert.match(readme, heading, `目录「${entry.text}」缺少对应章节`);
  }
});

test('README：底部三节顺序与协议链接正确', () => {
  const readme = read('README.md');
  const related = readme.indexOf('## 🔗 关联仓库');
  const contact = readme.indexOf('## 📮 作者联系方式');
  const license = readme.indexOf('## 📄 开源协议');

  assert.ok(related > -1 && contact > -1 && license > -1, '底部三节不完整');
  assert.ok(related < contact && contact < license, '底部三节顺序应为关联仓库 → 作者联系方式 → 开源协议');
  assert.match(readme, /\[AGPL-3\.0\]\(LICENSE\)/);
  assert.match(readme, /bingshanlengtie@qq\.com/);
});

test('README：赞助章节位置、图片与自愿说明', () => {
  const readme = read('README.md');
  const feedback = readme.indexOf('## 💬 反馈建议');
  const sponsor = readme.indexOf('## 💰 赞助');
  const related = readme.indexOf('## 🔗 关联仓库');

  assert.ok(sponsor > feedback && sponsor < related, '赞助章节应位于反馈建议之后、关联仓库之前');
  assert.match(readme, /assets\/sponsor-qrcode\.png/);
  assert.ok(exists('assets/sponsor-qrcode.png'), '赞赏码图片不存在');
  assert.match(readme, /自愿/);
});

test('README：本地链接与图片都存在', () => {
  const readme = read('README.md');
  const links = [...readme.matchAll(/\]\((?!https?:|#)([^)]+)\)/g)].map((match) => match[1]);

  assert.ok(links.length > 0);
  for (const link of new Set(links)) {
    const relativePath = decodeURIComponent(link.split('#')[0]);
    assert.ok(exists(relativePath), `引用的本地文件不存在：${relativePath}`);
  }
});

test('CONTRIBUTING：含完整命名规范与协议', () => {
  const contributing = read('CONTRIBUTING.md');

  assert.match(contributing, /<h1>贡献指南<\/h1>/);
  assert.match(contributing, /^> \[!WARNING\]$/m);
  assert.match(contributing, /命名规范（不缩写）/);
  assert.match(contributing, /全拼/);
  assert.match(contributing, /数字后缀/);
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
  const changelog = read('CHANGELOG.md');

  assert.match(changelog, /^# 更新日志$/m);
  assert.match(changelog, /^## \[未发布\]$/m);
  assert.match(changelog, /^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$/m);
  assert.match(changelog, /^## 更早的版本$/m);
});

test('LICENSE：为完整 AGPL-3.0 文本', () => {
  const license = read('LICENSE');

  assert.match(license, /GNU AFFERO GENERAL PUBLIC LICENSE/);
  assert.match(license, /Version 3, 19 November 2007/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);
});
