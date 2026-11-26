# Bangumi 多标签检索

基于 [awujiana/Bangumi-Archive-Excel](https://github.com/awujiana/Bangumi-Archive-Excel) 的漫画 / 动画 / 音乐 / 游戏 / 三次元五类分片数据，提供无需 Bangumi API token 的多标签检索页面。

参考 [wlm3201/Bangumi-Multitag](https://github.com/wlm3201/Bangumi-Multitag) 的交互思路，数据链路换成本项目的每周 JSONL 分片：

- 读 `data/<label>/<label>.manifest.json`，按需下载 `base`、`stats` 与 `relations` 分片；
- 浏览器用 `DecompressionStream` 原生解压 gzip，按行号拼接字段；
- 支持关键词、多标签 AND/OR、`+必选` / `-排除`、条目类型筛选、评分/排名/日期/名称排序；
- 支持按**关系类型**筛选（前传 / 续集 / 联动 / 原声集 / 扩展包等）；关系编码按条目类型各自定义，页面会随所选类型自动切换可选项，多选为「任一匹配」；
- 收藏状态保存在浏览器 `localStorage`；
- 无构建步骤，纯静态文件，直接由 GitHub Pages 托管。

站点地址：<https://awujiana.github.io/Bangumi-Multitag/>

## 使用关系类型筛选

1. 先在「条目类型」勾选一个或多个类型（默认动画）；
2. 「关系类型」会按所选类型自动列出对应关系，例如动画的「前传 / 续集 / 联动」、音乐的「原声集 / 角色歌」、游戏的「扩展包 / 合集」；
3. 勾选一个或多个关系后点击「检索」。多个关系之间为**任一匹配**（OR），不勾选则不限制；
4. 关系筛选只约束所选条目类型，例如同时勾选动画与游戏时，动画按所选动画关系过滤，游戏记录不受影响。

关系类型编码按条目类型各自定义（同一个数字在不同类型下含义不同），
完整对照见 [条目类型与关系类型说明](https://github.com/awujiana/Bangumi-Archive-Excel/blob/main/docs/条目类型与关系类型说明.md)。
数据侧对应 `relations` 分片中的 `关联关系` 字段，格式为 `关系类型:关联ID`。
