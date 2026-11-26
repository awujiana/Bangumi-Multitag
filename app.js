const TYPES = [
  { key: 'manga', name: '漫画', type: 1, color: '#8250df' },
  { key: 'anime', name: '动画', type: 2, color: '#0969da' },
  { key: 'music', name: '音乐', type: 3, color: '#bf8700' },
  { key: 'game', name: '游戏', type: 4, color: '#9a6700' },
  { key: 'real', name: '三次元', type: 6, color: '#1a7f37' },
];

// 关系类型编码按条目类型各自定义，数字会跨类型撞车，必须按 type.key 取表。
const RELATION_TYPES = {
  manga: {
    1: '改编', 1002: '系列', 1003: '单行本', 1004: '画集', 1005: '前传',
    1006: '续集', 1007: '番外篇', 1008: '主线故事', 1010: '不同版本',
    1011: '角色出演', 1012: '相同世界观', 1013: '不同世界观', 1014: '联动',
    1015: '不同演绎', 1099: '其他',
  },
  anime: {
    1: '改编', 2: '前传', 3: '续集', 4: '总集篇', 5: '全集', 6: '番外篇',
    7: '角色出演', 8: '相同世界观', 9: '不同世界观', 10: '不同演绎',
    11: '衍生', 12: '主线故事', 14: '联动', 99: '其他',
  },
  music: {
    3001: '原声集', 3002: '角色歌', 3003: '片头曲', 3004: '片尾曲',
    3005: '插入歌', 3006: '印象曲', 3007: '广播剧', 3099: '其他',
  },
  game: {
    1: '改编', 4002: '前传', 4003: '续集', 4006: '外传', 4007: '角色出演',
    4008: '相同世界观', 4009: '不同世界观', 4010: '不同演绎', 4012: '主线故事',
    4014: '联动', 4015: '扩展包', 4016: '不同版本', 4017: '主版本',
    4018: '合集', 4019: '收录作品', 4099: '其他',
  },
  real: {
    1: '改编', 2: '前传', 3: '续集', 4: '总集篇', 5: '全集', 6: '番外篇',
    7: '角色出演', 8: '相同世界观', 9: '不同世界观', 10: '不同演绎',
    11: '衍生', 12: '主线故事', 14: '联动', 99: '其他',
  },
};

const DATA_BASE =
  'https://raw.githubusercontent.com/awujiana/Bangumi-Archive-Excel/main/data/';
const FAV_KEY = 'awujiana-bangumi-multitag-favorites';

const state = {
  manifests: new Map(),
  records: new Map(),
  loading: new Map(),
  favorites: new Set(readFavorites()),
};

const elements = {
  typeFilters: document.getElementById('type-filters'),
  relationFilters: document.getElementById('relation-filters'),
  relationHint: document.getElementById('relation-hint'),
  clearRelations: document.getElementById('clear-relations'),
  keyword: document.getElementById('keyword'),
  tags: document.getElementById('tags'),
  sort: document.getElementById('sort'),
  limit: document.getElementById('limit'),
  onlyFav: document.getElementById('only-fav'),
  search: document.getElementById('search'),
  loadAll: document.getElementById('load-all'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  resultCount: document.getElementById('result-count'),
};

function readFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function saveFavorites() {
  localStorage.setItem(FAV_KEY, JSON.stringify([...state.favorites]));
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('error', Boolean(isError));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

async function decodeShard(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('当前浏览器不支持 DecompressionStream，无法解压 gzip 分片');
    }
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  return new TextDecoder().decode(buffer);
}

function parseJsonLines(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const header = JSON.parse(lines[0]);
  if (!Array.isArray(header)) throw new Error('分片首行不是字段名数组');
  return lines.slice(1).map((line) => {
    const values = JSON.parse(line);
    const row = {};
    header.forEach((field, index) => {
      row[field] = values[index];
    });
    return row;
  });
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value !== 'string' || !value) return [];
  if (value.includes('|') || value.includes(':')) {
    return value.split('|').map((part) => part.split(':')[0].trim()).filter(Boolean);
  }
  return [value];
}

function normalizeTag(tag) {
  return String(tag).trim().toLowerCase();
}

/** 解析「关系类型:关联ID | 关系类型:关联ID」字段。 */
function parseRelations(value) {
  if (typeof value !== 'string' || !value) return [];
  return value
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf(':');
      if (index < 0) return null;
      const relationType = Number(part.slice(0, index));
      const id = part.slice(index + 1).trim();
      if (!Number.isFinite(relationType) || !id) return null;
      return { type: relationType, id };
    })
    .filter(Boolean);
}

/**
 * 关系类型中文名。关系编码由「被关联条目」的类型决定，因此同一部动画可能带有
 * 书籍/音乐/游戏编码（如 3001 原声集）；先查自身类型，再按编码区间回退。
 */
function relationName(recordType, relationType) {
  const own = RELATION_TYPES[recordType] || {};
  if (own[relationType]) return own[relationType];
  if (relationType >= 1002 && relationType <= 1099) return RELATION_TYPES.manga[relationType] || '其他';
  if (relationType >= 3001 && relationType <= 3099) return RELATION_TYPES.music[relationType] || '其他';
  if (relationType >= 4002 && relationType <= 4099) return RELATION_TYPES.game[relationType] || '其他';
  return null;
}

function buildRecord(type, row) {
  const sid = String(row.sid ?? '');
  const tags = [...new Set([...toStringArray(row.tags), ...toStringArray(row.meta_tags)].map(normalizeTag).filter(Boolean))];
  return {
    key: `${type.key}:${sid}`,
    type: type.key,
    typeName: type.name,
    color: type.color,
    sid,
    name: String(row.name || row.name_original || ''),
    original: String(row.name_original || ''),
    date: String(row.date || ''),
    score: Number(row.score) || 0,
    rank: Number(row.rank) || 0,
    tags,
    relations: parseRelations(row['关联关系']),
  };
}

async function loadType(type) {
  if (state.records.has(type.key)) return state.records.get(type.key);
  if (state.loading.has(type.key)) return state.loading.get(type.key);

  const task = (async () => {
    setStatus(`正在加载${type.name}…`);
    let manifest = state.manifests.get(type.key);
    if (!manifest) {
      manifest = await fetchJson(`${DATA_BASE}${type.key}/${type.key}.manifest.json`);
      state.manifests.set(type.key, manifest);
    }

    const names = new Set(manifest.shards.map((shard) => shard.name));
    const wanted = new Set(['base', 'stats', 'relations']);
    const picked = manifest.shards.filter((shard) => wanted.has(shard.name));
    if (!names.has('base')) throw new Error(`${type.key} 清单缺少 base 分片`);

    const parsed = await Promise.all(
      picked.map(async (shard) => ({
        name: shard.name,
        rows: parseJsonLines(await decodeShard(`${DATA_BASE}${type.key}/${shard.file}`)),
      })),
    );
    const byName = Object.fromEntries(parsed.map((item) => [item.name, item.rows]));
    const baseRows = byName.base || [];
    const statsRows = byName.stats || [];
    const relationRows = byName.relations || [];
    const records = baseRows.map((row, index) =>
      buildRecord(type, {
        ...row,
        ...(statsRows[index] || {}),
        ...(relationRows[index] || {}),
      }),
    );
    state.records.set(type.key, records);
    setStatus(`${type.name}已加载 ${records.length.toLocaleString('zh-CN')} 条`);
    return records;
  })();

  state.loading.set(type.key, task);
  try {
    return await task;
  } finally {
    state.loading.delete(type.key);
  }
}

function selectedTypes() {
  return TYPES.filter((type) => {
    const input = elements.typeFilters.querySelector(`input[value="${type.key}"]`);
    return input && input.checked;
  });
}

/** 读取关系类型筛选：Map<条目类型 key, Set<关系类型编码>>。 */
function selectedRelations() {
  const result = new Map();
  elements.relationFilters.querySelectorAll('input:checked').forEach((input) => {
    const [typeKey, relationType] = input.value.split(':');
    if (!typeKey || !relationType) return;
    if (!result.has(typeKey)) result.set(typeKey, new Set());
    result.get(typeKey).add(Number(relationType));
  });
  return result;
}

function parseTagQuery(input) {
  const tokens = input.split(/[,，\s]+/).map(normalizeTag).filter(Boolean);
  const required = [];
  const excluded = [];
  const optional = [];
  for (const token of tokens) {
    if (token.startsWith('+') && token.length > 1) required.push(token.slice(1));
    else if (token.startsWith('-') && token.length > 1) excluded.push(token.slice(1));
    else optional.push(token);
  }
  return { required, excluded, optional };
}

function hasTag(recordTags, needle) {
  return recordTags.some((tag) => tag.includes(needle) || needle.includes(tag));
}

function matches(record, keywords, tagQuery, relationFilter, mode, onlyFav) {
  if (onlyFav && !state.favorites.has(record.key)) return false;
  const wanted = relationFilter.get(record.type);
  if (wanted && wanted.size) {
    if (!record.relations.some((relation) => wanted.has(relation.type))) return false;
  }
  const haystack = `${record.name} ${record.original}`.toLowerCase();
  if (!keywords.every((word) => haystack.includes(word))) return false;
  if (tagQuery.excluded.some((tag) => hasTag(record.tags, tag))) return false;
  if (!tagQuery.required.every((tag) => hasTag(record.tags, tag))) return false;
  if (tagQuery.optional.length) {
    if (mode === 'all') return tagQuery.optional.every((tag) => hasTag(record.tags, tag));
    return tagQuery.optional.some((tag) => hasTag(record.tags, tag));
  }
  return true;
}

function sortRecords(records, sortBy) {
  const sorted = [...records];
  if (sortBy === 'score') sorted.sort((a, b) => b.score - a.score);
  else if (sortBy === 'rank') sorted.sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity));
  else if (sortBy === 'date') sorted.sort((a, b) => b.date.localeCompare(a.date));
  else sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  return sorted;
}

function makeCard(record, hitTags) {
  const card = document.createElement('article');
  card.className = 'result';

  const head = document.createElement('div');
  head.className = 'result-head';
  const title = document.createElement('h3');
  const link = document.createElement('a');
  link.href = `https://bgm.tv/subject/${record.sid}`;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = record.name || record.original || `#${record.sid}`;
  title.append(link);
  const badge = document.createElement('span');
  badge.className = 'type-badge';
  badge.style.background = record.color;
  badge.textContent = record.typeName;
  head.append(title, badge);
  card.append(head);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const score = record.score ? record.score.toFixed(1) : '—';
  const rank = record.rank ? `#${record.rank}` : '—';
  meta.textContent = `${record.date || '日期未知'} · 评分 ${score} · 排名 ${rank}`;
  card.append(meta);

  const relationNames = [
    ...new Set(
      record.relations
        .map((relation) => relationName(record.type, relation.type))
        .filter(Boolean),
    ),
  ].slice(0, 4);
  if (relationNames.length) {
    const relations = document.createElement('div');
    relations.className = 'relations';
    relations.textContent = `关系：${relationNames.join('、')}`;
    card.append(relations);
  }

  const tags = document.createElement('div');
  tags.className = 'tags';
  record.tags.slice(0, 14).forEach((tag) => {
    const chip = document.createElement('span');
    chip.className = hitTags.has(tag) ? 'tag hit' : 'tag';
    chip.textContent = tag;
    tags.append(chip);
  });
  card.append(tags);

  const fav = document.createElement('button');
  fav.type = 'button';
  fav.className = state.favorites.has(record.key) ? 'fav on' : 'fav';
  fav.textContent = state.favorites.has(record.key) ? '已收藏' : '收藏';
  fav.addEventListener('click', () => {
    if (state.favorites.has(record.key)) state.favorites.delete(record.key);
    else state.favorites.add(record.key);
    saveFavorites();
    fav.classList.toggle('on', state.favorites.has(record.key));
    fav.textContent = state.favorites.has(record.key) ? '已收藏' : '收藏';
    if (elements.onlyFav.checked) runSearch();
  });
  card.append(fav);
  return card;
}

function renderResults(records, tagQuery) {
  elements.results.replaceChildren();
  elements.resultCount.textContent = `${records.length.toLocaleString('zh-CN')} 条`;
  if (!records.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '没有匹配结果。试试减少标签或关系类型、切换 AND/OR，或加载更多类型。';
    elements.results.append(empty);
    return;
  }

  const hitTags = new Set([...tagQuery.required, ...tagQuery.excluded, ...tagQuery.optional].map(normalizeTag));
  const limit = Number(elements.limit.value) || 100;
  const fragment = document.createDocumentFragment();
  records.slice(0, limit).forEach((record) => fragment.append(makeCard(record, hitTags)));
  elements.results.append(fragment);
}

async function runSearch() {
  const types = selectedTypes();
  if (!types.length) {
    setStatus('至少选择一种条目类型', true);
    return;
  }

  elements.search.disabled = true;
  try {
    const allRecords = [];
    for (const type of types) {
      allRecords.push(...(await loadType(type)));
    }
    const keywords = elements.keyword.value.toLowerCase().split(/\s+/).filter(Boolean);
    const tagQuery = parseTagQuery(elements.tags.value);
    const relationFilter = selectedRelations();
    const mode = document.querySelector('input[name="tag-mode"]:checked').value;
    const filtered = allRecords.filter((record) =>
      matches(record, keywords, tagQuery, relationFilter, mode, elements.onlyFav.checked),
    );
    renderResults(sortRecords(filtered, elements.sort.value), tagQuery);
    setStatus(`检索完成：${allRecords.length.toLocaleString('zh-CN')} 条候选`);
  } catch (error) {
    setStatus(`加载失败：${error.message}`, true);
  } finally {
    elements.search.disabled = false;
  }
}

/** 按当前选中的条目类型重建关系类型 chips，并保留仍然有效的勾选。 */
function renderRelationFilters() {
  const previous = selectedRelations();
  elements.relationFilters.replaceChildren();
  const types = selectedTypes();
  if (!types.length) {
    elements.relationHint.textContent = '先选择条目类型，再按关联关系筛选。';
    return;
  }

  const fragment = document.createDocumentFragment();
  let total = 0;
  const showPrefix = types.length > 1;
  types.forEach((type) => {
    const labels = RELATION_TYPES[type.key] || {};
    Object.entries(labels).forEach(([relationType, name]) => {
      total += 1;
      const label = document.createElement('label');
      label.className = 'chip';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = `${type.key}:${relationType}`;
      input.checked = previous.get(type.key)?.has(Number(relationType)) ?? false;
      const text = document.createElement('span');
      text.textContent = showPrefix ? `${type.name}·${name}` : name;
      label.append(input, text);
      fragment.append(label);
    });
  });
  elements.relationFilters.append(fragment);
  elements.relationHint.textContent = `共 ${total} 种关系类型，勾选后为「任一匹配」；不选则不限制。`;
}

function initTypeFilters() {
  TYPES.forEach((type) => {
    const label = document.createElement('label');
    label.className = 'chip';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = type.key;
    input.checked = type.key === 'anime';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = type.color;
    const text = document.createElement('span');
    text.textContent = type.name;
    label.append(input, dot, text);
    input.addEventListener('change', renderRelationFilters);
    elements.typeFilters.append(label);
  });
  renderRelationFilters();
}

function initEvents() {
  elements.search.addEventListener('click', runSearch);
  elements.loadAll.addEventListener('click', async () => {
    elements.loadAll.disabled = true;
    try {
      for (const type of TYPES) await loadType(type);
      setStatus('全部类型已加载');
    } catch (error) {
      setStatus(`预加载失败：${error.message}`, true);
    } finally {
      elements.loadAll.disabled = false;
    }
  });
  [elements.keyword, elements.tags].forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') runSearch();
    });
  });
  elements.sort.addEventListener('change', runSearch);
  elements.limit.addEventListener('change', runSearch);
  elements.onlyFav.addEventListener('change', runSearch);
  elements.clearRelations.addEventListener('click', () => {
    elements.relationFilters.querySelectorAll('input:checked').forEach((input) => {
      input.checked = false;
    });
  });
}

async function init() {
  initTypeFilters();
  initEvents();
  setStatus('清单就绪，点击检索或预加载');
  elements.search.disabled = false;
  try {
    await runSearch();
  } catch (error) {
    setStatus(`初始化失败：${error.message}`, true);
  }
}

init();
