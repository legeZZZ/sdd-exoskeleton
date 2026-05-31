# 快速入门指南

## 环境要求

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Git**（可选但推荐，用于自动同步 hook）
- **Obsidian**（推荐 1.5+，用于浏览规范 vault）

SDD 支持解析以下语言的项目：

| 语言 | 最低版本 | 解析器 |
|------|---------|--------|
| TypeScript / JavaScript | ES2020+ | ts-morph |
| Python | 3.8+ | ast (内置) |
| Go | 1.18+ | go/parser |
| Rust | 1.65+ | syn |
| Java | 11+ | javalang |
| C# | 8.0+ | Roslyn |

如果项目包含不支持的语言文件，sdd-exoskeleton 会跳过它们并在诊断报告中标注。

## 安装

```bash
# 全局安装
npm install -g sdd-exoskeleton

# 验证安装
sdd --version
```

或者使用 npx 无需安装（适合临时使用）：

```bash
npx sdd-exoskeleton --version
```

## 初始化项目

在目标项目的根目录运行：

```bash
cd /path/to/your-project
sdd init
```

`init` 命令会执行以下操作：

1. **检测项目结构**：扫描项目目录，识别语言和框架
2. **创建 specs 目录**：在项目根目录创建 `specs/` 目录及子目录结构
3. **生成 Obsidian 配置**：创建 `.obsidian/` 配置，链接模板文件
4. **运行首次索引**：调用 CodeGraph 解析所有源代码
5. **生成初始规范**：为每个模块、API、数据模型创建规范文件

初始化过程的输出示例：

```
$ sdd init

Detecting project structure...
  Language: TypeScript (98% of files)
  Framework: Express.js
  Package manager: npm

Creating OpenSpec structure...
  ✓ specs/modules/
  ✓ specs/apis/
  ✓ specs/data/
  ✓ specs/decisions/
  ✓ specs/changes/
  ✓ specs/archive/
  ✓ specs/journal/
  ✓ specs/mocs/
  ✓ templates/ (linked to specs)

Configuring Obsidian vault...
  ✓ .obsidian/app.json
  ✓ .obsidian/appearance.json
  ✓ .obsidian/templates.json

Indexing source code...
  Files scanned:  847
  Modules found:  23
  APIs found:     47
  Data models:    12
  Dependencies:   89 edges

  Initial spec generation complete in 12.4s

Next steps:
  1. Open Obsidian vault: obsidian://open?vault=your-project
  2. Explore specs in graph view
  3. Run `sdd doctor` to diagnose any issues
```

## 常用命令

### sdd status — 查看状态

查看当前规范的同步状态：

```bash
$ sdd status

Spec Status Report
─────────────────
Modules:     23 (23 in sync, 0 stale)
APIs:        47 (45 in sync, 2 stale)
Data models: 12 (12 in sync, 0 stale)
Journal:     5 entries (last: 2026-05-31)
Changes:     1 active (add-user-avatar)
─────────────────
Last sync:   2026-05-31 14:32:18
Coverage:    78% (18/23 modules have specs)

⚠ 2 stale API specs — run `sdd sync` to update
```

### sdd sync — 同步变更

在代码变更后，运行此命令更新规范：

```bash
sdd sync
```

同步选项：

```bash
# 只同步指定模块
sdd sync --module UserService

# 列出将要变更的文件但不实际写入（dry run）
sdd sync --dry-run

# 详细输出（显示每个文件的操作）
sdd sync --verbose
```

### sdd doctor — 诊断问题

```bash
$ sdd doctor

SDD Health Check
────────────────
✓ specs directory structure is valid
✓ Obsidian configuration is present
✓ All spec frontmatter is valid YAML
✗ 3 dead references found (files deleted but specs remain)
  → run `sdd sync --clean` to remove
✓ Dependency graph is consistent
⚠ Module Coverage is 78% (below 80% threshold)
  → 5 modules without specs:
    - src/utils/logger.ts
    - src/utils/retry.ts
    - src/utils/cache.ts
    - src/middleware/ratelimit.ts
    - src/middleware/cors.ts
  → run `sdd init --module <name>` to generate

Health Score: 72/100 (Fair)
```

### sdd watch — 文件监听模式

启动文件监听，代码变更后自动同步：

```bash
# 监听所有文件
sdd watch

# 只监听指定目录
sdd watch --include "src/modules/**"

# 排除测试文件
sdd watch --exclude "**/*.test.ts"
```

## 配置

sdd-exoskeleton 的配置文件为项目根目录下的 `.sddexoskeleton.json`（首次 `sdd init` 时自动创建）：

```json
{
  "$schema": "https://unpkg.com/sdd-exoskeleton/schema.json",
  "version": 1,
  "language": "auto",
  "source": {
    "include": ["src/**"],
    "exclude": ["**/*.test.*", "**/__tests__/**", "node_modules/**"]
  },
  "specs": {
    "path": "specs",
    "templatePath": "templates"
  },
  "syncing": {
    "gitHook": false,
    "watchExclude": ["node_modules/**", ".git/**", "dist/**"]
  },
  "obsidian": {
    "vaultName": null,
    "autoOpen": false
  }
}
```

### 关键配置项说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `language` | `"auto"` | 目标语言，`auto` 为自动检测。也可指定如 `"typescript"`、`"python"` |
| `source.include` | `["src/**"]` | 需要索引的源文件 glob 模式 |
| `source.exclude` | 测试和 node_modules | 排除的文件 glob 模式 |
| `specs.path` | `"specs"` | 规范文件输出目录 |
| `specs.templatePath` | `"templates"` | 笔记模板目录 |
| `syncing.gitHook` | `false` | 是否安装 post-commit hook 自动同步 |
| `syncing.watchExclude` | 常见排除目录 | watch 模式的排除路径 |

## 下一步

- [第一个 SDD 项目](./first-project.md) — 手把手从零开始
- [工作流详解](../03-工作流/README.md) — 深入的日常开发流程
- [棕地项目接入指南](../03-工作流/brownfield-onboarding.md) — 大型存量项目接入策略
