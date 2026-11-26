# Bangumi 多标签检索 · 数据 API 文档

> 站点：<https://awujiana.github.io/Bangumi-Multitag/>
> 数据源：[awujiana/Bangumi-Archive-Excel](https://github.com/awujiana/Bangumi-Archive-Excel)
> 文档版本：2026-11-26

## 1. 说明

本页面是纯静态站点，**没有自建后端，也没有专属 REST API**。页面里所谓「API」是它直接读取的一组 GitHub Raw 数据接口：

- 数据以**按类型分目录、按字段分片**的 gzip JSON Lines 文件发布；
- 每个类型有一个 `manifest.json` 清单作为唯一入口；
- 浏览器可通过 `fetch` 直接访问（响应头含 `Access-Control-Allow-Origin: *`），**无需 Bangumi token，也不经过 Bangumi 官方 API**。

因此，任何语言只要能发 HTTPS 请求、解 gzip、逐行解析 JSON，就能复用同一套「查询评分 / 评分人数 / 排名 / 收藏 / 标签」的能力。

数据每周三随 Bangumi 官方 dump 更新，最近更新日期以各清单的 `updatedAt` 为准。

## 2. 接口总览

### 2.1 Base URL

```text
https://raw.githubusercontent.com/awujiana/Bangumi-Archive-Excel/main/data/
```

### 2.2 条目类型

| 类型 | `typeLabel` | `subjectType` | 记录数（2026-11-24 期） | 清单地址 |
| --- | --- | --- | ---: | --- |
| 漫画 | `manga` | 1 | 426,672 | `data/manga/manga.manifest.json` |
| 动画 | `anime` | 2 | 31,431 | `data/anime/anime.manifest.json` |
| 音乐 | `music` | 3 | 101,822 | `data/music/music.manifest.json` |
| 游戏 | `game` | 4 | 130,518 | `data/game/game.manifest.json` |
| 三次元 | `real` | 6 | 27,083 | `data/real/real.manifest.json` |

Bangumi 没有 `type=5`。目录名（`manga` / `anime` / `music` / `game` / `real`）即类型标识，数据内不再重复输出 `type` 字段。

### 2.3 端点一览

对任一 `{type}`（取上表 `typeLabel`）：

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `{BASE}{type}/{type}.manifest.json` | GET | 清单：分片列表、字段、字节数、SHA-256、记录数、更新日期 |
| `{BASE}{type}/{type}.base.jsonlines.gz` | GET | 基础字段（`sid`、名称、日期、标签、NSFW） |
| `{BASE}{type}/{type}.meta.jsonlines.gz` | GET | infobox 解析出的 19 个中文扩展字段 |
| `{BASE}{type}/{type}.relations.jsonlines.gz` | GET | 关联条目 ID 与关系类型（`关联关系`） |
| `{BASE}{type}/{type}.stats.jsonlines.gz` | GET | **评分、排名、评分分布、收藏数、用户标签** |
| `{BASE}{type}/{type}.summary.jsonlines.gz` | GET | 简介 |
| `{BASE}{type}/{type}.infobox.jsonlines.gz` | GET | infobox 原文 |

分片的实际文件名以清单里的 `shards[].file` 为准，不要硬编码。

### 2.4 示例

```bash
curl -s https://raw.githubusercontent.com/awujiana/Bangumi-Archive-Excel/main/data/anime/anime.manifest.json

curl -s https://raw.githubusercontent.com/awujiana/Bangumi-Archive-Excel/main/data/anime/anime.stats.jsonlines.gz \
  | gunzip | head -n 3
```

## 3. 清单接口

`GET {BASE}{type}/{type}.manifest.json`，返回 UTF-8 JSON，约 2 KB。

### 3.1 响应示例

```json
{
  "formatVersion": 1,
  "subjectType": 2,
  "typeLabel": "anime",
  "updatedAt": "2026-11-17",
  "recordCount": 31312,
  "shards": [
    {
      "name": "stats",
      "file": "anime.stats.jsonlines.gz",
      "fields": [
        "sid", "platform", "series", "score", "rank",
        "score_details", "favorite", "tags"
      ],
      "bytes": 1666132,
      "sha256": "0bc8203ff0fa23c8c796d9502f5218d9f5eba84d554cd1911bfdd3f61c7ec0f2"
    }
  ]
}
```

示例只保留了一个分片，实际固定为 6 个：`base` / `meta` / `relations` / `stats` / `summary` / `infobox`。

### 3.2 字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `formatVersion` | number | 分片布局版本，当前为 `1`；不兼容变更时递增 |
| `subjectType` | number | Bangumi 条目类型（1/2/3/4/6） |
| `typeLabel` | string | 类型短名，也是目录名 |
| `updatedAt` | string | 数据日期，`YYYY-MM-DD` |
| `recordCount` | number | 总记录数；**每个分片的行数都与它相同** |
| `shards[].name` | string | 分片短名 |
| `shards[].file` | string | 文件名，拼接在 `{BASE}{type}/` 之后 |
| `shards[].fields` | string[] | 字段名，顺序与分片表头一致 |
| `shards[].bytes` | number | **压缩后**字节数 |
| `shards[].sha256` | string | **压缩后**字节的 SHA-256 |

### 3.3 按需选片

需要哪些列就只下哪些片，`base` 恒为必选，其余按字段名与 `fields` 求交集：

```python
import json
import urllib.request

BASE = "https://raw.githubusercontent.com/awujiana/Bangumi-Archive-Excel/main/data/"
manifest = json.load(urllib.request.urlopen(BASE + "anime/anime.manifest.json"))
wanted = {"name", "date", "score", "rank"}          # 目标列
picked = [
    shard for shard in manifest["shards"]
    if shard["name"] == "base" or (shard["name"] != "base" and wanted & set(shard["fields"]))
]
```

注意：`sid` 出现在**每个**分片的 `fields` 里。如果用它判断「是否需要该片」，6 个分片会全部命中，选片失效；应把 `sid` 排除在判据之外。

## 4. 分片格式

### 4.1 编码与压缩

- 标准 gzip（魔数 `1f 8b`），解压后为 UTF-8、无 BOM、LF 换行的 JSON Lines。
- Raw CDN 返回 `Content-Type: application/octet-stream`，**没有** `Content-Encoding: gzip`，不会自动解压；直接 `fetch().text()` 会得到乱码，必须自行解 gzip。
- 响应带 `Access-Control-Allow-Origin: *`，可跨域读取。

### 4.2 行结构

每个分片独立：第 1 行是**字段名数组**（表头），其后每行是与表头等长的**值数组**。

```jsonl
["sid","platform","series","score","rank","score_details","favorite","tags"]
["8",1,false,8.3,85,[57,21,46,93,217,765,2647,6273,5809,3132],[2484,30260,535,508,187],"叛逆的鲁鲁修:3100|SUNRISE:2378|原创:1667|TV:1624"]
```

### 4.3 拼接规则

- 每个分片都带 `sid`，且**行序一致、行数相同**，因此可直接按行号合并；
- 也可以按 `sid` 建索引后合并（更稳妥）；
- 除 `sid` 外，各分片字段两两不重叠，任意组合都不会互相覆盖。

## 5. 字段字典

### 5.1 基础字段（`base`）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `sid` | string | 条目 ID，主键；站点链接为 `https://bgm.tv/subject/{sid}` |
| `name` | string | 条目名称 |
| `name_original` | string | 原始名称 |
| `updatedAt` | string | 该条目在 Bangumi 的更新日期，`YYYY-MM-DD` |
| `date` | string | 开播 / 发售日期，`YYYY-MM-DD`，可能为空 |
| `meta_tags` | string[] | 标签 / 分级 |
| `nsfw` | boolean | 是否为 NSFW |

### 5.2 infobox 解析字段（`meta`）

共 19 个中文字段，随类型不同大量为空字符串：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `播放结束` | string | 完播日；infobox 优先，缺失时由章节最大 airdate 推导 |
| `动画制作公司` | string | 制作公司 |
| `话数` | string | 集数 / 话数 |
| `片长` | string | 时长 |
| `制片国家` | string | 制片国家或地区 |
| `语言` | string | 作品语言 |
| `类型` | string | 作品类型 |
| `导演` | string | 导演 |
| `音乐` | string | 音乐制作 |
| `人物设定` | string | 人物设定 |
| `机械设定` | string | 机械设定 |
| `原作` | string | 原作 |
| `脚本` | string | 脚本 |
| `分镜` | string | 分镜 |
| `演出` | string | 演出 |
| `原案` | string | 原案 |
| `系列构成` | string | 系列构成 |
| `在线播放平台` | string | 在线播放平台 |
| `别名` | string | 别名，多个以 ` \| ` 分隔 |

### 5.3 关联字段（`relations`）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `关联条目ID` | string | 全部关联条目 ID，多个以 ` \| ` 分隔 |
| `关联的动漫ID` | string | 仅关联的动画（type=2）ID，恒为上一字段的子集 |
| `关联关系` | string | 关系类型与关联 ID，格式 `关系类型:关联ID`，多个以 ` \| ` 分隔 |

`关联关系` 示例：

```text
2:344 | 3:793 | 14:1081
```

表示该条目与 `344` 是「前传」、与 `793` 是「续集」、与 `1081` 是「联动」。
关系类型编码**按条目类型各自定义**（同一数字在不同类型下含义不同），
完整对照表见
[条目类型与关系类型说明](https://github.com/awujiana/Bangumi-Archive-Excel/blob/main/docs/条目类型与关系类型说明.md)；
页面已内置 1/2/3/4/6 五类的关系中文映射，可按关系类型筛选。

### 5.4 统计字段（`stats`）——评分 / 人数 / 排名

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `platform` | number | 平台代码，原样保留，取值含义由 Bangumi 定义 |
| `series` | boolean | 是否为系列作品 |
| `score` | number | 平均分，一位小数；`0` 表示暂无评分 |
| `rank` | number | 类别内排名；`0` 表示未上榜 / 无排名 |
| `score_details` | number[10] | 评分分布，固定顺序 `[1分, 2分, …, 10分]` 的人数 |
| `favorite` | number[5] | 收藏分布，固定顺序 `[想看, 看过, 在看, 搁置, 抛弃]` |
| `tags` | string | 用户标签，压缩为 `"名称:计数\|名称:计数"` |

派生值计算：

```text
评分人数 = sum(score_details)
收藏人数 = sum(favorite)
看过人数 = favorite[1]
```

### 5.5 文本字段

| 分片 | 字段 | 类型 | 说明 |
| --- | --- | --- | --- |
| `summary` | `summary` | string | 条目简介 |
| `infobox` | `infobox` | string | infobox 原文 |

### 5.6 缺省值

缺失字段统一补默认值：

| 类型 | 默认值 |
| --- | --- |
| 字符串 | `""` |
| 数组（`meta_tags`、`score_details`、`favorite`） | `[]` |
| 布尔（`nsfw`、`series`） | `false` |
| 数字（`platform`、`score`、`rank`） | `0` |

## 6. 查询示例

### 6.1 Python：取某条目的评分、人数、排名

```python
import gzip
import io
import json
import urllib.request

BASE = "https://raw.githubusercontent.com/awujiana/Bangumi-Archive-Excel/main/data/"
TYPE = "anime"


def fetch(url):
    with urllib.request.urlopen(url) as resp:
        return resp.read()


def read_shard(type_label, shard):
    blob = fetch(f"{BASE}{type_label}/{shard['file']}")
    text = gzip.decompress(blob).decode("utf-8")
    lines = text.splitlines()
    header = json.loads(lines[0])
    return [dict(zip(header, json.loads(line))) for line in lines[1:] if line.strip()]


manifest = json.loads(fetch(f"{BASE}{TYPE}/{TYPE}.manifest.json"))
stats_shard = next(s for s in manifest["shards"] if s["name"] == "stats")
stats = read_shard(TYPE, stats_shard)

by_sid = {row["sid"]: row for row in stats}
row = by_sid["8"]
print({
    "sid": row["sid"],
    "score": row["score"],
    "rank": row["rank"],
    "votes": sum(row["score_details"]),   # 评分人数
    "favorites": sum(row["favorite"]),     # 收藏人数
})
```

### 6.2 JavaScript：浏览器内解压并合并

```js
const BASE = "https://raw.githubusercontent.com/awujiana/Bangumi-Archive-Excel/main/data/";
const TYPE = "anime";

async function loadShard(type, shard) {
  const buf = await (await fetch(`${BASE}${type}/${shard.file}`)).arrayBuffer();
  const bytes = new Uint8Array(buf);
  const text = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? await new Response(
        new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip")),
      ).text()
    : new TextDecoder().decode(buf);

  const [headerLine, ...valueLines] = text.split(/\r?\n/).filter((line) => line.trim());
  const header = JSON.parse(headerLine);
  return valueLines.map((line) => {
    const values = JSON.parse(line);
    return Object.fromEntries(header.map((field, i) => [field, values[i]]));
  });
}

const manifest = await (await fetch(`${BASE}${TYPE}/${TYPE}.manifest.json`)).json();
const base = await loadShard(TYPE, manifest.shards.find((s) => s.name === "base"));
const stats = await loadShard(TYPE, manifest.shards.find((s) => s.name === "stats"));

const rows = base.map((row, i) => ({ ...row, ...stats[i] }));
const target = rows.find((row) => row.sid === "8");
console.log(target.score, target.rank, target.score_details.reduce((a, b) => a + b, 0));
```

站点自身的实现见 [app.js](./app.js) 中的 `decodeShard()`、`parseJsonLines()` 与 `loadType()`。

### 6.3 jq：命令行直接查看

```bash
curl -s https://raw.githubusercontent.com/awujiana/Bangumi-Archive-Excel/main/data/anime/anime.stats.jsonlines.gz \
  | gunzip | tail -n +2 | jq -c \
  'select(.[0] == "8") | {sid: .[0], score: .[3], rank: .[4], votes: (.[5] | add)}'
```

### 6.4 按标签查询（前端语义）

`tags` 字段解析：

```js
const tags = row.tags
  ? row.tags.split("|").map((part) => {
      const i = part.lastIndexOf(":");
      return { name: part.slice(0, i), count: Number(part.slice(i + 1)) };
    })
  : [];
```

页面支持的标签表达式（仅前端筛选，不是 HTTP 参数）：

- 空格或逗号分隔多个标签；
- `+标签` 必选，`-标签` 排除，普通标签按 AND / OR 逻辑匹配；
- 标签匹配为包含式（双向 `includes`），并统一转小写。

## 7. 性能与缓存

- 五类数据压缩后合计约 260 MB（漫画约 131 MB、游戏约 62 MB、音乐约 28 MB、动画约 23 MB、三次元约 16 MB），全量下载不现实，务必按需选片；
- 只查评分 / 人数 / 排名：`base` + `stats`，动画约 2.8 MB、漫画约 16.9 MB；
- 分片之间可并行下载；
- GitHub Raw 存在 CDN 缓存，更新后短时间内可能读到上一版本，请以清单 `updatedAt` 判断期次；
- 可先校验 `bytes` 与 `sha256` 再解析，失败时重试对应分片。

## 8. 错误与限制

| 情况 | 表现 | 处理 |
| --- | --- | --- |
| 清单或分片不存在 | HTTP 404 | 检查 `type` 与 `shards[].file` 是否拼错 |
| 频率限制 / 临时故障 | HTTP 403 / 429 / 5xx | 退避重试，避免高频轮询 |
| 浏览器直接读文本 | 乱码 | 必须按 gzip 解压，或先判断 `1f 8b` 魔数 |
| `DecompressionStream` 不可用 | 解压报错 | 使用现代浏览器，或改用服务端解压 |
| 分片行数不一致 | 拼接错位 | 核对清单 `recordCount` 与实际行数 |

## 9. 许可与署名

- 数据来自 [awujiana/Bangumi-Archive-Excel](https://github.com/awujiana/Bangumi-Archive-Excel)，按 **CC BY-SA 4.0** 授权，允许商业使用，需署名并以相同协议共享衍生数据；
- 上游为 [bangumi/Archive](https://github.com/bangumi/Archive) 与 [Bangumi 番组计划](https://bgm.tv) 及其维基贡献者；
- 引用数据时请注明数据来源与期次（清单 `updatedAt`）。
