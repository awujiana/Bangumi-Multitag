const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RELATION_TYPES,
  PLATFORMS,
  platformName,
  relationName,
  parseRelations,
  filterMapFromValues,
  parseTagQuery,
  matches,
  rankLabel,
  sortRecords,
} = require('../filters.js');

/** 构造一条最小可筛选记录。 */
function makeRecord(overrides = {}) {
  return {
    key: 'anime:1',
    type: 'anime',
    platform: 3,
    name: '测试动画',
    original: 'Test Anime',
    tags: ['治愈', '日常'],
    relations: [
      { type: 3, id: '2' },
      { type: 3001, id: '9' },
    ],
    score: 8.5,
    rank: 10,
    date: '2026-01-01',
    ...overrides,
  };
}

function emptyFilter() {
  return new Map();
}

test('作品形态：按条目类型映射中文且互不串味', () => {
  assert.equal(platformName('anime', 1), 'TV');
  assert.equal(platformName('anime', 5), 'WEB');
  assert.equal(platformName('anime', 2), 'OVA');
  assert.equal(platformName('anime', 3), '剧场版');
  assert.equal(platformName('anime', 2006), '动态漫画');
  assert.equal(platformName('anime', 4), '短片');

  assert.equal(platformName('manga', 1001), '漫画');
  assert.equal(platformName('manga', 1006), '公式书');

  assert.equal(platformName('real', 1), '日剧');
  assert.equal(platformName('real', 6001), '电视剧');
  assert.equal(platformName('real', 6003), '演出');

  assert.equal(platformName('music', 3004), '电台');
  assert.equal(platformName('game', 4005), '桌游');
  assert.equal(platformName('game', 4004), '试玩版');
});

test('作品形态：0、空值与未知编码都归入「其他」', () => {
  assert.equal(platformName('anime', 0), '其他');
  assert.equal(platformName('anime', ''), '其他');
  assert.equal(platformName('anime', 999999), '其他');
  assert.equal(platformName('unknown', 1), '其他');
});

test('作品形态：字符串编码与数字等价', () => {
  assert.equal(platformName('real', '6002'), '电影');
  assert.equal(platformName('anime', '2006'), '动态漫画');
});

test('作品形态：覆盖文档中的全部分类', () => {
  assert.equal(PLATFORMS.anime.length, 7);
  assert.equal(PLATFORMS.manga.length, 7);
  assert.equal(PLATFORMS.music.length, 5);
  assert.equal(PLATFORMS.game.length, 6);
  assert.equal(PLATFORMS.real.length, 8);

  const codes = (type) => PLATFORMS[type].map(([code]) => code);
  assert.deepEqual(codes('anime'), [1, 5, 2, 3, 2006, 4, 0]);
  assert.deepEqual(codes('manga'), [1001, 1002, 1003, 1004, 1005, 1006, 0]);
  assert.deepEqual(codes('real'), [1, 2, 3, 6001, 6002, 6003, 6004, 0]);
});

test('关系类型：自身类型优先，跨类型编码按区间回退', () => {
  assert.equal(relationName('anime', 3), '续集');
  assert.equal(relationName('game', 4006), '外传');
  // 动画条目上可以出现书籍 / 音乐 / 游戏的关系编码
  assert.equal(relationName('anime', 1004), '画集');
  assert.equal(relationName('anime', 3001), '原声集');
  assert.equal(relationName('anime', 4015), '扩展包');
  // 无法识别的编码不显示
  assert.equal(relationName('anime', 7777), null);
});

test('关系类型：所有定义都有中文名', () => {
  for (const [type, labels] of Object.entries(RELATION_TYPES)) {
    for (const [code, name] of Object.entries(labels)) {
      assert.ok(name, `${type}:${code} 缺少中文名`);
      assert.equal(relationName(type, Number(code)), name);
    }
  }
});

test('解析关联关系字段', () => {
  assert.deepEqual(parseRelations('1:344 | 2:793'), [
    { type: 1, id: '344' },
    { type: 2, id: '793' },
  ]);
  assert.deepEqual(parseRelations('3001:9'), [{ type: 3001, id: '9' }]);
  assert.deepEqual(parseRelations(''), []);
  assert.deepEqual(parseRelations(null), []);
  assert.deepEqual(parseRelations('abc'), []);
  assert.deepEqual(parseRelations('3:'), []);
});

test('checkbox 值转筛选表：按类型分组并忽略空值', () => {
  const map = filterMapFromValues(['anime:3', 'anime:5', 'real:1', 'bad', 'anime:']);
  assert.deepEqual([...map.get('anime')].sort((a, b) => a - b), [3, 5]);
  assert.deepEqual([...map.get('real')], [1]);
  assert.equal(map.size, 2);
});

test('筛选：不设置任何条件时全部通过', () => {
  const record = makeRecord();
  assert.equal(
    matches(record, [], parseTagQuery(''), emptyFilter(), emptyFilter(), 'all', false),
    true,
  );
});

test('筛选：作品形态按所选类型生效，其他类型不受约束', () => {
  const record = makeRecord({ platform: 3 });

  const hit = filterMapFromValues(['anime:3']);
  assert.equal(matches(record, [], parseTagQuery(''), hit, emptyFilter(), 'all', false), true);

  const miss = filterMapFromValues(['anime:1']);
  assert.equal(matches(record, [], parseTagQuery(''), miss, emptyFilter(), 'all', false), false);

  const multi = filterMapFromValues(['anime:1', 'anime:3']);
  assert.equal(matches(record, [], parseTagQuery(''), multi, emptyFilter(), 'all', false), true);

  const otherType = filterMapFromValues(['manga:1001']);
  assert.equal(
    matches(record, [], parseTagQuery(''), otherType, emptyFilter(), 'all', false),
    true,
  );
});

test('筛选：关系类型为任一匹配，且只约束所选类型', () => {
  const record = makeRecord();

  assert.equal(
    matches(record, [], parseTagQuery(''), emptyFilter(), filterMapFromValues(['anime:3']), 'all', false),
    true,
  );
  assert.equal(
    matches(record, [], parseTagQuery(''), emptyFilter(), filterMapFromValues(['anime:2']), 'all', false),
    false,
  );
  assert.equal(
    matches(
      record,
      [],
      parseTagQuery(''),
      emptyFilter(),
      filterMapFromValues(['anime:2', 'anime:3']),
      'all',
      false,
    ),
    true,
  );
  // 未选的条目类型不参与关系约束
  assert.equal(
    matches(record, [], parseTagQuery(''), emptyFilter(), filterMapFromValues(['game:4002']), 'all', false),
    true,
  );
});

test('筛选：作品形态与关系类型可以叠加', () => {
  const record = makeRecord({ platform: 3 });
  assert.equal(
    matches(
      record,
      [],
      parseTagQuery(''),
      filterMapFromValues(['anime:3']),
      filterMapFromValues(['anime:3']),
      'all',
      false,
    ),
    true,
  );
  assert.equal(
    matches(
      record,
      [],
      parseTagQuery(''),
      filterMapFromValues(['anime:1']),
      filterMapFromValues(['anime:3']),
      'all',
      false,
    ),
    false,
  );
});

test('筛选：关键词、必选标签、排除标签与标签逻辑', () => {
  const record = makeRecord();
  const empty = emptyFilter();

  assert.equal(matches(record, ['test'], parseTagQuery(''), empty, empty, 'all', false), true);
  assert.equal(matches(record, ['missing'], parseTagQuery(''), empty, empty, 'all', false), false);

  assert.equal(matches(record, [], parseTagQuery('+治愈'), empty, empty, 'all', false), true);
  assert.equal(matches(record, [], parseTagQuery('+血腥'), empty, empty, 'all', false), false);

  assert.equal(matches(record, [], parseTagQuery('-血腥'), empty, empty, 'all', false), true);
  assert.equal(matches(record, [], parseTagQuery('-治愈'), empty, empty, 'all', false), false);

  const twoTags = parseTagQuery('治愈,日常');
  assert.equal(matches(record, [], twoTags, empty, empty, 'all', false), true);
  assert.equal(matches(record, [], twoTags, empty, empty, 'any', false), true);

  const oneMissing = parseTagQuery('治愈,机械');
  assert.equal(matches(record, [], oneMissing, empty, empty, 'all', false), false);
  assert.equal(matches(record, [], oneMissing, empty, empty, 'any', false), true);
});

test('筛选：只看收藏', () => {
  const record = makeRecord();
  const empty = emptyFilter();

  assert.equal(matches(record, [], parseTagQuery(''), empty, empty, 'all', true), false);
  assert.equal(
    matches(record, [], parseTagQuery(''), empty, empty, 'all', true, new Set([record.key])),
    true,
  );
});

test('标签表达式解析', () => {
  assert.deepEqual(parseTagQuery('治愈,日常,-血腥 +机战'), {
    required: ['机战'],
    excluded: ['血腥'],
    optional: ['治愈', '日常'],
  });
  assert.deepEqual(parseTagQuery('  '), { required: [], excluded: [], optional: [] });
});

test('排名展示：始终标注所属条目类型', () => {
  assert.equal(rankLabel('动画', 123), '动画排名 #123');
  assert.equal(rankLabel('漫画', 1), '漫画排名 #1');
  assert.equal(rankLabel('三次元', 45), '三次元排名 #45');
  // 不能退化成不带类型的裸排名
  assert.notEqual(rankLabel('动画', 7), '#7');
  assert.ok(rankLabel('动画', 7).startsWith('动画排名'));
});

test('排名展示：无排名时显示「—」且保留类型', () => {
  for (const value of [0, null, undefined, '', NaN, 'abc']) {
    assert.equal(rankLabel('动画', value), '动画排名 —');
  }
});

test('排名展示：数字字符串按数值处理', () => {
  assert.equal(rankLabel('游戏', '12'), '游戏排名 #12');
  // 前导零按数值归一
  assert.equal(rankLabel('游戏', '0012'), '游戏排名 #12');
});

test('排序：评分 / 排名 / 日期 / 名称', () => {
  const records = [
    makeRecord({ key: 'a', name: 'B', score: 7, rank: 0, date: '2024-01-01' }),
    makeRecord({ key: 'b', name: 'A', score: 9, rank: 5, date: '2026-01-01' }),
    makeRecord({ key: 'c', name: 'C', score: 8, rank: 2, date: '2025-01-01' }),
  ];

  assert.deepEqual(sortRecords(records, 'score').map((r) => r.key), ['b', 'c', 'a']);
  assert.deepEqual(sortRecords(records, 'rank').map((r) => r.key), ['c', 'b', 'a']);
  assert.deepEqual(sortRecords(records, 'date').map((r) => r.key), ['b', 'c', 'a']);
  assert.deepEqual(sortRecords(records, 'name').map((r) => r.key), ['b', 'a', 'c']);
  // 不改动原数组
  assert.deepEqual(records.map((r) => r.key), ['a', 'b', 'c']);
});
