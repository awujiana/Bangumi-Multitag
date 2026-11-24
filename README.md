# Bangumi 多标签检索

基于 [awujiana/Bangumi-Archive-Excel](https://github.com/awujiana/Bangumi-Archive-Excel) 的漫画 / 动画 / 音乐 / 游戏 / 三次元五类分片数据，提供无需 Bangumi API token 的多标签检索页面。

参考 [wlm3201/Bangumi-Multitag](https://github.com/wlm3201/Bangumi-Multitag) 的交互思路，数据链路换成本项目的每周 JSONL 分片：

- 读 `data/<label>/<label>.manifest.json`，按需下载 `base` 与 `stats` 分片；
- 浏览器用 `DecompressionStream` 原生解压 gzip，按行号拼接字段；
- 支持关键词、多标签 AND/OR、`+必选` / `-排除`、类型筛选、评分/排名/日期/名称排序；
- 收藏状态保存在浏览器 `localStorage`；
- 无构建步骤，纯静态文件，直接由 GitHub Pages 托管。

站点地址：<https://awujiana.github.io/Bangumi-Multitag/>
