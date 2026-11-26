const TYPES = [
  { key: 'manga', name: '漫画', type: 1, color: '#8250df' },
  { key: 'anime', name: '动画', type: 2, color: '#0969da' },
  { key: 'music', name: '音乐', type: 3, color: '#bf8700' },
  { key: 'game', name: '游戏', type: 4, color: '#9a6700' },
  { key: 'real', name: '三次元', type: 6, color: '#1a7f37' },
];

const {
  RELATION_TYPES,
  PLATFORMS,
  platformName,
  relationName,
  parseRelations,
  toStringArray,
  normalizeTag,
  filterMapFromValues,
  parseTagQuery,
  hasTag,
  matches,
  rankLabel,
  sortRecords,
} = window.BgmFilters;

// 数据源按顺序尝试：GitHub Raw 优先，失败后自动回退到 jsDelivr。
const DATA_SOURCES = [
  {
    label: 'GitHub Raw',
    base: 'https://raw.githubusercontent.com/awujiana/Bangumi-Archive-Excel/main/data/',
  },
  {
    label: 'jsDelivr',
    base: 'https://cdn.jsdelivr.net/gh/awujiana/Bangumi-Archive-Excel@main/data/',
  },
];
// 记录最近一次成功的源，后续请求优先复用，避免每个分片都重试失败源。
let activeBase = null;
const FAV_KEY = 'awujiana-bangumi-multitag-favorites';

const state = {
  manifests: new Map(),
  records: new Map(),
  loading: new Map(),
  favorites: new Set(readFavorites()),
};

const elements = {
  typeFilters: document.getElementById('type-filters'),
  platformFilters: document.getElementById('platform-filters'),
  platformHint: document.getElementById('platform-hint'),
  clearPlatforms: document.getElementById('clear-platforms'),
  relationFilters: document.getElementById('relation-filters'),
  relationHint: document.getElementById('relation-hint'),
  clearRelations: document.getElementById('clear-relations'),
  keyword: document.getElementById('keyword'),
  tags: document.getElementById('tags'),
  sort: document.getElementById('sort'),
  rankFilter: document.getElementById('rank-filter'),
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

class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}: ${url}`);
    this.status = status;
    this.url = url;
  }
}

function dataSourcesInOrder() {
  if (!activeBase) return DATA_SOURCES;
  const active = DATA_SOURCES.find((source) => source.base === activeBase);
  return active ? [active, ...DATA_SOURCES.filter((source) => source !== active)] : DATA_SOURCES;
}

function describeFetchFailure(error) {
  if (error instanceof HttpError) return `HTTP ${error.status}`;
  const message = String((error && error.message) || error);
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return '网络请求失败（Failed to fetch）';
  }
  return message;
}

/** 读取数据文件，失败时按顺序切换数据源，并给出可操作的错误说明。 */
async function requestData(path, { binary = false } = {}) {
  if (location.protocol === 'file:') {
    throw new Error(
      '当前页面以 file:// 打开，浏览器禁止读取远端数据。请在本目录运行 python -m http.server 8000，再访问 http://localhost:8000/',
    );
  }

  const failures = [];
  for (const source of dataSourcesInOrder()) {
    const url = `${source.base}${path}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new HttpError(response.status, url);
      activeBase = source.base;
      if (binary) return new Uint8Array(await response.arrayBuffer());
      return await response.json();
    } catch (error) {
      failures.push(`${source.label}：${describeFetchFailure(error)}`);
      if (activeBase === source.base) activeBase = null;
    }
  }

  const detail = failures.join('；');
  let reason = '无法连接数据源';
  if (failures.some((item) => item.includes('HTTP 404'))) {
    reason = '数据文件不存在，可能是数据尚未推送或路径已变更';
  } else if (failures.some((item) => /HTTP (403|429)/.test(item))) {
    reason = '数据源限流或拒绝访问';
  } else if (navigator.onLine === false) {
    reason = '当前设备处于离线状态';
  }
  throw new Error(
    `${path} 读取失败（${detail}）。${reason}。请检查网络或代理后重试；部分网络环境访问 GitHub 需要代理。`,
  );
}

async function fetchJson(path) {
  return requestData(path);
}

async function decodeShard(path) {
  const buffer = await requestData(path, { binary: true });
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
    platform: Number(row.platform) || 0,
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
      manifest = await fetchJson(`${type.key}/${type.key}.manifest.json`);
      state.manifests.set(type.key, manifest);
    }

    const names = new Set(manifest.shards.map((shard) => shard.name));
    const wanted = new Set(['base', 'stats', 'relations']);
    const picked = manifest.shards.filter((shard) => wanted.has(shard.name));
    if (!names.has('base')) throw new Error(`${type.key} 清单缺少 base 分片`);

    const parsed = await Promise.all(
      picked.map(async (shard) => ({
        name: shard.name,
        rows: parseJsonLines(await decodeShard(`${type.key}/${shard.file}`)),
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
  return filterMapFromValues(
    [...elements.relationFilters.querySelectorAll('input:checked')].map((input) => input.value),
  );
}

/** 读取分类（平台）筛选：Map<条目类型 key, Set<平台编码>>。 */
function selectedPlatforms() {
  return filterMapFromValues(
    [...elements.platformFilters.querySelectorAll('input:checked')].map((input) => input.value),
  );
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
  const badges = document.createElement('div');
  badges.className = 'badges';
  const badge = document.createElement('span');
  badge.className = 'type-badge';
  badge.style.background = record.color;
  badge.textContent = record.typeName;
  const rankBadge = document.createElement('span');
  rankBadge.className = record.rank ? 'rank-badge' : 'rank-badge is-empty';
  rankBadge.textContent = rankLabel(record.typeName, record.rank);
  badges.append(badge, rankBadge);
  head.append(title, badges);
  card.append(head);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const score = record.score ? record.score.toFixed(1) : '—';
  const platform = platformName(record.type, record.platform);
  meta.textContent = `${platform} · ${record.date || '日期未知'} · 评分 ${score}`;
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
    const platformFilter = selectedPlatforms();
    const relationFilter = selectedRelations();
    const mode = document.querySelector('input[name="tag-mode"]:checked').value;
    const rankMode = elements.rankFilter.value;
    const filtered = allRecords.filter((record) =>
      matches(
        record,
        keywords,
        tagQuery,
        platformFilter,
        relationFilter,
        mode,
        elements.onlyFav.checked,
        state.favorites,
        rankMode,
      ),
    );
    renderResults(sortRecords(filtered, elements.sort.value), tagQuery);
    setStatus(`检索完成：${allRecords.length.toLocaleString('zh-CN')} 条候选`);
  } catch (error) {
    console.error('[Bangumi Multitag] 加载失败', error);
    const retryHint = /file:\/\//.test(error.message)
      ? ''
      : '\n已尝试数据源：GitHub Raw、jsDelivr；可点击「检索」重试。';
    setStatus(`加载失败：${error.message}${retryHint}`, true);
  } finally {
    elements.search.disabled = false;
  }
}

/** 按当前选中的条目类型重建分类（平台）chips，并保留仍然有效的勾选。 */
function renderPlatformFilters() {
  const previous = selectedPlatforms();
  elements.platformFilters.replaceChildren();
  const types = selectedTypes();
  if (!types.length) {
    elements.platformHint.textContent = '先选择条目类型，再按分类筛选。';
    return;
  }

  const fragment = document.createDocumentFragment();
  let total = 0;
  const showPrefix = types.length > 1;
  types.forEach((type) => {
    (PLATFORMS[type.key] || []).forEach(([code, name]) => {
      total += 1;
      const label = document.createElement('label');
      label.className = 'chip';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = `${type.key}:${code}`;
      input.checked = previous.get(type.key)?.has(Number(code)) ?? false;
      const text = document.createElement('span');
      text.textContent = showPrefix ? `${type.name}·${name}` : name;
      label.append(input, text);
      fragment.append(label);
    });
  });
  elements.platformFilters.append(fragment);
  elements.platformHint.textContent = `共 ${total} 个分类，勾选后为「任一匹配」；不选则不限制。`;
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
    input.addEventListener('change', () => {
      renderPlatformFilters();
      renderRelationFilters();
    });
    elements.typeFilters.append(label);
  });
  renderPlatformFilters();
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
      console.error('[Bangumi Multitag] 预加载失败', error);
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
  elements.rankFilter.addEventListener('change', runSearch);
  elements.limit.addEventListener('change', runSearch);
  elements.onlyFav.addEventListener('change', runSearch);
  elements.clearRelations.addEventListener('click', () => {
    elements.relationFilters.querySelectorAll('input:checked').forEach((input) => {
      input.checked = false;
    });
  });
  elements.clearPlatforms.addEventListener('click', () => {
    elements.platformFilters.querySelectorAll('input:checked').forEach((input) => {
      input.checked = false;
    });
  });
}

async function init() {
  initTypeFilters();
  initEvents();
  if (location.protocol === 'file:') {
    elements.search.disabled = true;
    elements.loadAll.disabled = true;
    setStatus(
      '加载失败：当前页面以 file:// 直接打开，浏览器禁止读取远端数据。\n请在本目录运行 python -m http.server 8000，然后访问 http://localhost:8000/',
      true,
    );
    return;
  }
  setStatus('清单就绪，点击检索或预加载');
  elements.search.disabled = false;
  try {
    await runSearch();
  } catch (error) {
    setStatus(`初始化失败：${error.message}`, true);
  }
}

init();
