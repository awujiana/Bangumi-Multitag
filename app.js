const TYPES = [
  { key: 'manga', name: '漫画', type: 1, color: '#8250df' },
  { key: 'anime', name: '动画', type: 2, color: '#0969da' },
  { key: 'music', name: '音乐', type: 3, color: '#bf8700' },
  { key: 'game', name: '游戏', type: 4, color: '#9a6700' },
  { key: 'real', name: '三次元', type: 6, color: '#1a7f37' },
];

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
    const picked = manifest.shards.filter((shard) => shard.name === 'base' || shard.name === 'stats');
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
    const records = baseRows.map((row, index) => buildRecord(type, { ...row, ...(statsRows[index] || {}) }));
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

function matches(record, keywords, tagQuery, mode, onlyFav) {
  if (onlyFav && !state.favorites.has(record.key)) return false;
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
    empty.textContent = '没有匹配结果。试试减少标签、切换 AND/OR，或加载更多类型。';
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
    const mode = document.querySelector('input[name="tag-mode"]:checked').value;
    const filtered = allRecords.filter((record) =>
      matches(record, keywords, tagQuery, mode, elements.onlyFav.checked),
    );
    renderResults(sortRecords(filtered, elements.sort.value), tagQuery);
    setStatus(`检索完成：${allRecords.length.toLocaleString('zh-CN')} 条候选`);
  } catch (error) {
    setStatus(`加载失败：${error.message}`, true);
  } finally {
    elements.search.disabled = false;
  }
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
    elements.typeFilters.append(label);
  });
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
