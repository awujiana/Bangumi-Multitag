/*
 * 纯函数筛选逻辑（无 DOM 依赖）。
 * 浏览器里挂到 window.BgmFilters；Node 下通过 module.exports 供单元测试使用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BgmFilters = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // 关系类型编码按条目类型各自定义，数字会跨类型撞车，必须按 type.key 取表。
  const RELATION_TYPES = {
    manga: {
      1: '改编',
      1002: '系列',
      1003: '单行本',
      1004: '画集',
      1005: '前传',
      1006: '续集',
      1007: '番外篇',
      1008: '主线故事',
      1010: '不同版本',
      1011: '角色出演',
      1012: '相同世界观',
      1013: '不同世界观',
      1014: '联动',
      1015: '不同演绎',
      1099: '其他',
    },
    anime: {
      1: '改编',
      2: '前传',
      3: '续集',
      4: '总集篇',
      5: '全集',
      6: '番外篇',
      7: '角色出演',
      8: '相同世界观',
      9: '不同世界观',
      10: '不同演绎',
      11: '衍生',
      12: '主线故事',
      14: '联动',
      99: '其他',
    },
    music: {
      3001: '原声集',
      3002: '角色歌',
      3003: '片头曲',
      3004: '片尾曲',
      3005: '插入歌',
      3006: '印象曲',
      3007: '广播剧',
      3099: '其他',
    },
    game: {
      1: '改编',
      4002: '前传',
      4003: '续集',
      4006: '外传',
      4007: '角色出演',
      4008: '相同世界观',
      4009: '不同世界观',
      4010: '不同演绎',
      4012: '主线故事',
      4014: '联动',
      4015: '扩展包',
      4016: '不同版本',
      4017: '主版本',
      4018: '合集',
      4019: '收录作品',
      4099: '其他',
    },
    real: {
      1: '改编',
      2: '前传',
      3: '续集',
      4: '总集篇',
      5: '全集',
      6: '番外篇',
      7: '角色出演',
      8: '相同世界观',
      9: '不同世界观',
      10: '不同演绎',
      11: '衍生',
      12: '主线故事',
      14: '联动',
      99: '其他',
    },
  };

  // 平台 / 分类编码（作品形态），与 Archive 文档「平台编码表」一致。
  const PLATFORMS = {
    manga: [
      [1001, '漫画'],
      [1002, '小说'],
      [1003, '画集'],
      [1004, '绘本'],
      [1005, '写真'],
      [1006, '公式书'],
      [0, '其他'],
    ],
    anime: [
      [1, 'TV'],
      [5, 'WEB'],
      [2, 'OVA'],
      [3, '剧场版'],
      [2006, '动态漫画'],
      [4, '短片'],
      [0, '其他'],
    ],
    music: [
      [3001, '专辑'],
      [3002, '广播剧'],
      [3003, '音频'],
      [3004, '电台'],
      [0, '其他'],
    ],
    game: [
      [4001, '游戏'],
      [4002, '软件'],
      [4003, '扩展包'],
      [4004, '试玩版'],
      [4005, '桌游'],
      [0, '其他'],
    ],
    real: [
      [1, '日剧'],
      [2, '欧美剧'],
      [3, '华语剧'],
      [6001, '电视剧'],
      [6002, '电影'],
      [6003, '演出'],
      [6004, '综艺'],
      [0, '其他'],
    ],
  };

  function platformName(typeKey, value) {
    const hit = (PLATFORMS[typeKey] || []).find(([code]) => code === Number(value));
    return hit ? hit[1] : '其他';
  }

  /**
   * 关系类型中文名。关系编码由「被关联条目」的类型决定，因此同一部动画可能带有
   * 书籍/音乐/游戏编码（如 3001 原声集）；先查自身类型，再按编码区间回退。
   */
  function relationName(recordType, relationType) {
    const own = RELATION_TYPES[recordType] || {};
    if (own[relationType]) return own[relationType];
    if (relationType >= 1002 && relationType <= 1099) {
      return RELATION_TYPES.manga[relationType] || '其他';
    }
    if (relationType >= 3001 && relationType <= 3099) {
      return RELATION_TYPES.music[relationType] || '其他';
    }
    if (relationType >= 4002 && relationType <= 4099) {
      return RELATION_TYPES.game[relationType] || '其他';
    }
    return null;
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

  function toStringArray(value) {
    if (Array.isArray(value)) return value.map((item) => String(item));
    if (typeof value !== 'string' || !value) return [];
    if (value.includes('|') || value.includes(':')) {
      return value
        .split('|')
        .map((part) => part.split(':')[0].trim())
        .filter(Boolean);
    }
    return [value];
  }

  function normalizeTag(tag) {
    return String(tag).trim().toLowerCase();
  }

  /** 把 checkbox 的 value 列表（`typeKey:code`）转换为 Map<typeKey, Set<number>>。 */
  function filterMapFromValues(values) {
    const result = new Map();
    for (const value of values) {
      const index = String(value).indexOf(':');
      if (index <= 0) continue;
      const typeKey = value.slice(0, index);
      const code = value.slice(index + 1);
      if (!code) continue;
      if (!result.has(typeKey)) result.set(typeKey, new Set());
      result.get(typeKey).add(Number(code));
    }
    return result;
  }

  function parseTagQuery(input) {
    const tokens = String(input || '')
      .split(/[,，\s]+/)
      .map(normalizeTag)
      .filter(Boolean);
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

  function matches(
    record,
    keywords,
    tagQuery,
    platformFilter,
    relationFilter,
    mode,
    onlyFav,
    favorites = new Set(),
  ) {
    if (onlyFav && !favorites.has(record.key)) return false;

    const wantedPlatforms = platformFilter.get(record.type);
    if (wantedPlatforms && wantedPlatforms.size && !wantedPlatforms.has(record.platform)) {
      return false;
    }

    const wantedRelations = relationFilter.get(record.type);
    if (
      wantedRelations &&
      wantedRelations.size &&
      !record.relations.some((relation) => wantedRelations.has(relation.type))
    ) {
      return false;
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

  /**
   * 排名展示：排名是条目类型内的排名，必须带上类型名，避免跨类型混排时误读。
   * 无排名（0 / 空值 / 非数字）显示「—」。
   */
  function rankLabel(typeName, rankValue) {
    const rank = Number(rankValue) || 0;
    return `${typeName}排名 ${rank ? `#${rank}` : '—'}`;
  }

  function sortRecords(records, sortBy) {
    const sorted = [...records];
    if (sortBy === 'score') sorted.sort((a, b) => b.score - a.score);
    else if (sortBy === 'rank') sorted.sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity));
    else if (sortBy === 'date') sorted.sort((a, b) => b.date.localeCompare(a.date));
    else sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    return sorted;
  }

  return {
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
  };
});
