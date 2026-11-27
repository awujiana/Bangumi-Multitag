<div align="center">

[![协议](https://img.shields.io/badge/协议-AGPL--3.0-blue)](LICENSE)
[![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/awujiana/Bangumi-Multitag/pulls)
[![AI 辅助生成](https://img.shields.io/badge/AI辅助生成-是-orange)](https://github.com/awujiana/Bangumi-Multitag)

<h1>贡献指南</h1>

<strong>欢迎参与「Bangumi 多标签检索」的共建</strong>

</div>

---

> [!WARNING]
> 本项目的相当一部分代码由 AI 辅助生成，并经过持续的人工作业、联调和重构，但它仍然可能存在遗漏、边界情况处理不足或行为与预期不完全一致的问题。如果你在使用过程中发现 Bug、兼容性问题、异常行为或文档缺失，欢迎积极提交 Issue。最好附上复现步骤、日志、截图和系统版本信息，这会非常有帮助。

感谢你关注 **Bangumi 多标签检索** 并愿意贡献。本指南用于确保协作顺畅、输出风格统一、许可证一致。

> 维护者：awujiana ｜ 开源协议：代码 [AGPL-3.0](LICENSE)

## 📚 目录

- [我能如何参与](#-我能如何参与)
- [提交 Issue 前](#-提交-issue-前)
- [提交 Pull Request 前](#-提交-pull-request-前)
- [命名规范不缩写](#-命名规范不缩写)
- [代码与文档约定](#-代码与文档约定)
- [行为准则](#-行为准则)
- [许可证](#-许可证)

## 🤝 我能如何参与

- **提交 Issue**：反馈筛选逻辑错误、界面问题、数据字段异常或文档缺失。
- **改进筛选能力**：新增筛选维度、优化标签匹配、完善排名展示。
- **补充测试**：为 `filters.js` 的纯函数增加边界用例。
- **完善文档**：修正 README、API 说明或使用示例。

## 🐞 提交 Issue 前

1. 先搜索确认问题未被重复提出。
2. 说明复现步骤：所选条目类型、作品形态、关系类型、关键词或标签表达式。
3. 附上状态栏错误文案与控制台日志（若有）。
4. 数据问题请注明对应分片文件与条目 `sid`，便于到数据仓库核对。

## 🔀 提交 Pull Request 前

1. 从 `main` 分支切出特性分支，命名如 `fix/rank-filter` 或 `feat/platform-chips`。
2. 遵守本仓库结构：
   - 纯筛选逻辑放 `filters.js`，浏览器与 Node 测试共用；
   - DOM 与渲染放 `app.js`，不要在 `filters.js` 里访问 `document`；
   - 样式放 `styles.css`，不引入构建工具与第三方运行时依赖。
3. 运行检查：

```bash
node --check app.js
node --check filters.js
node --test
```

4. 若改变用户可见行为，同步更新 `README.md`、`API.md` 与 `CHANGELOG.md`。
5. 提交信息说明「做了什么 / 为什么」，例如 `feat: 新增作品形态筛选并展示所属形态`。

## 📝 命名规范（不缩写）

> 本节为**硬性命名规范**，所有改动都必须遵守。

### 总则

- **一律全拼，禁止缩写**：`usr`→`user`、`cfg`→`config`、`btn`→`button`、`img`→`image`、`msg`→`message`、`err`→`error`、`idx`→`index`。
- **名称不重复**：同目录文件名唯一（大小写不敏感）；同模块导出名唯一。
- **名称即语义**：看到名字能判断用途；禁止 `utils`、`common`、`misc`、`temp`、`data1` 等泛化名。
- **同一项目内形态统一**：函数用 `camelCase`，常量用 `UPPER_SNAKE_CASE`。

### 文件命名

| 类型 | 规则 | 示例 |
| --- | --- | --- |
| 文档 | `kebab-case.md` | `API.md`、`CONTRIBUTING.md` |
| 脚本 | 全小写、语义化 | `app.js`、`filters.js` |
| 样式 | 全小写 | `styles.css` |
| 测试 | `<被测文件>.test.js` | `filters.test.js` |
| 静态资源 | 小写英文 + 连字符 | `main-interface.png` |

- 同一目录内不得出现同名文件，包括仅大小写不同。
- 不使用 `index.js` 作为唯一出口，避免同名歧义。

### 函数命名

- `camelCase`，**动词开头 + 名词**，全拼，如 `fetchJson`、`parseRelations`、`renderResults`。
- 纯函数与副作用函数分开：解析 / 匹配 / 排序放 `filters.js`，网络与 DOM 放 `app.js`。
- 同一模块内不得出现同名函数；不同模块同名须加限定词。

### 冲突处理

加**语义限定词**，而不是数字后缀。`renderCard` 与 `renderCard2` ❌；应为 `renderResultCard` 与 `renderTemplateCard` ✅。

## 📋 代码与文档约定

- 正文以简体中文为主，专有名词保留英文原文。
- 代码注释解释「为什么」，不复述代码。
- 筛选逻辑新增分支必须同时补 `tests/filters.test.js` 用例。
- 不引入框架、打包器或运行时依赖；保持纯静态部署。
- 表格类信息优先使用 Markdown 表格。

## 🤗 行为准则

请保持友善、专业、就事论事。尊重不同经验水平的贡献者，对方案分歧以讨论达成共识，不人身攻击、不贬低他人工作。

## 📄 许可证

向本仓库提交贡献，即表示你同意以 [AGPL-3.0](LICENSE) 发布你的贡献，并确认你拥有相应的授权。详见仓库内 [LICENSE](LICENSE)。

[![AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
