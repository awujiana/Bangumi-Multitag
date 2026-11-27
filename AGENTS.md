# AGENTS.md

> 本文件供 **AI 编码 / 写作 agent**（如 WorkBuddy、Copilot、Claude）阅读，用于了解本仓库的结构、约定与禁忌，从而在自动改动时保持风格一致。
> 人类贡献者请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)（含完整命名规范）。

## 项目概述

- **名称**：Bangumi 多标签检索
- **GitHub 仓库名（英文名）**：Bangumi-Multitag
- **类型**：代码仓库（AGPL-3.0），纯静态站点，GitHub Pages 托管
- **维护者**：awujiana
- **一句话**：读取 Bangumi-Archive-Excel 的每周 gzip 分片，在浏览器内完成标签、作品形态、关联关系与排名的组合筛选。

## 仓库结构

| 路径 | 用途 | 是否发布 |
| --- | --- | --- |
| `index.html` | 页面结构与筛选表单 | ✅ |
| `app.js` | 网络请求、分片解码、DOM 渲染与事件 | ✅ |
| `filters.js` | 纯筛选逻辑（类型 / 形态 / 关系 / 标签 / 排名 / 排序），浏览器与 Node 共用 | ✅ |
| `styles.css` | 全站样式 | ✅ |
| `tests/filters.test.js` | `filters.js` 的单元测试 | ✅ |
| `API.md` | 分片字段与数据格式说明 | ✅ |
| `assets/main-interface.png` | README 主界面截图 | ✅ |
| `README.md` / `CONTRIBUTING.md` / `AGENTS.md` / `CHANGELOG.md` / `LICENSE` | 项目文档与协议 | ✅ |
| `.nojekyll` | 关闭 GitHub Pages 的 Jekyll 处理 | ✅ |
| `package.json` | 仅承载 `npm test` 脚本，无依赖 | ✅ |

## 必须遵守的约定

1. **命名规范（不缩写）**：文件全拼、语义化；函数 `camelCase` 且动词开头；名称不重复、不用数字后缀。详见 `CONTRIBUTING.md`。
2. **项目核心不变量**：
   - `filters.js` 必须保持**无 DOM、无网络**，只导出纯函数；浏览器与 `tests/` 共用同一份实现。
   - `app.js` 负责 `fetch`、`DecompressionStream`、渲染与事件；不要把筛选判定写回 `app.js`。
   - 数据读取只走 `requestData` 单一入口：先 GitHub Raw，再 jsDelivr 回退；不要在别处直接 `fetch`。
   - 分片字段与 `API.md` 必须一致；`platform`、`关联关系` 的编码含义按条目类型隔离，不能跨类型复用同一个数字。
   - `parseRelations` 解析 `关系类型:关联ID`；关系编码由被关联条目的类型决定（如动画上的 `3001` 表示原声集）。
3. **技术禁令**：
   - 不引入框架、打包器、npm 运行时依赖；保持“打开即用”的静态部署。
   - 不把网络请求或 `document` 访问放进 `filters.js`。
   - 不硬编码数据到页面；一切条目数据来自分片清单。
   - 不直接双击 `index.html` 验证功能，`file://` 无法读取远端数据。
4. **README 风格**：shields.io 徽章 → `> [!WARNING]` AI 声明 → 目录 → 正文 → 底部三节（关联仓库 / 作者联系方式 / 开源协议）。
5. **双名标题**：README 顶部中文名 `<h1>` 在上、GitHub 仓库名 `<h2>` 在下。
6. **协议**：AGPL-3.0；`LICENSE` 不许改动。
7. **文档索引**：「文档」节只列操作文档（`API.md` 与外部说明），测试只用一句话带过。
8. **提交信息**：说明「做了什么 / 为什么」，沿用 `feat:` / `fix:` / `test:` / `docs:` / `perf:` 前缀。
9. **提交身份**：`git config user.name` 必须是 `awujiana`，`user.email` 必须是 `bingshanlengtie@qq.com`。旧邮箱一旦进入提交元数据，`force push` 也清不掉。
10. **维护**：用户可见行为变化要同步 `README.md`、`API.md` 与 `CHANGELOG.md`。

## 改动前检查

- **改筛选逻辑**：`node --check filters.js && node --test`，新增分支必须补 `tests/filters.test.js` 用例。
- **改页面逻辑**：`node --check app.js`，本地起 `python -m http.server 8123` 后用真实分片验证：加载、作品形态、关系类型、排名筛选、控制台无报错。
- **改数据字段**：先核对 `API.md` 与数据仓库实际分片，再改 `buildRecord`；不得只改前端造成静默错位。
- **改文档**：对照本文件与技能 `awujiana-readme-style`，核对徽章、锚点、双名标题、底部三节；同步 `CHANGELOG.md`。
- **提交**：`git status` 确认不含临时截图、`node_modules` 或本地数据。

## 不要做的事

- 不要手写 `⚠️ Warning` 代替 GitHub 警示块 `> [!WARNING]`。
- 不要把筛选逻辑复制到 `app.js` 或测试文件里各写一份。
- 不要在 `filters.js` 中读取 `window`、`document`、`localStorage` 或发起网络请求。
- 不要缩写命名、不要同名文件（含仅大小写不同）、不要用数字后缀解决冲突。
- 不要新增构建步骤或第三方依赖来“顺便优化”。
- 不要在标题使用 VS16 变体 emoji（`⚠️` / `🖼️`），会破坏自动锚点。
- 不要删除 `AGENTS.md` / `CONTRIBUTING.md` / `CHANGELOG.md`。
