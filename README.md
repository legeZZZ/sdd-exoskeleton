# sdd-exoskeleton

> 给历史项目穿上 AI 可感知的结构化外骨骼

**SDD (Specification-Driven Development) 棕地落地方案** — CLI 工具自动分析老项目代码，生成 OpenSpec 规范体系 + Obsidian 知识图谱，建立增量同步机制。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

---

## 为什么需要 sdd-exoskeleton？

百万行历史代码库缺少让 AI 理解的"消化系统"——代码结构、数据流、方法链路不可见，导致需求落地偏差。sdd-exoskeleton 让老项目零成本接入 SDD 工作流。

## 核心工具链

| 工具 | 角色 |
|------|------|
| **[CodeGraph](https://github.com/colbymchenry/codegraph)** | 代码知识图谱引擎 — 19+ 语言，SQLite 索引 |
| **[OpenSpec](https://github.com/Fission-AI/OpenSpec)** | SDD 流程控制 — 规范定义、变更管理、归档 |
| **Obsidian** | 知识图谱 — 模块笔记、API 文档、ADR 决策记录 |
| **Claude Code / OpenCode** | AI 编码执行层 — 读规范→写代码 |

## 快速开始

### 安装

```bash
npm install -g sdd-exoskeleton
```

### 初始化项目

```bash
cd your-legacy-project
sdd init
```

`sdd init` 四阶段流程：
1. **检测** — 自动识别语言、项目名、源码目录
2. **索引** — 调用 CodeGraph 构建代码知识图谱
3. **分析** — 模块拓扑 + 架构健康评分
4. **生成** — OpenSpec 规范 + Obsidian Vault + CLAUDE.md

### 日常使用

```bash
sdd status          # 查看 SDD 状态
sdd sync            # 同步代码变更到规范
sdd sync --watch    # 持续监听文件变化
sdd doctor          # 诊断集成健康
```

## 命令参考

| 命令 | 说明 |
|------|------|
| `sdd init [path]` | 初始化 SDD 外骨骼 |
| `sdd sync` | 增量同步代码→规范 |
| `sdd status` | 查看项目 SDD 状态 |
| `sdd doctor` | 诊断集成健康状况 |

### sdd init 参数

```
--lang <lang>           指定主语言（默认自动检测）
--vault <path>          Obsidian Vault 位置（默认 ./sdd-vault）
--vault-strategy <mode> embedded | standalone | hybrid
--depth <level>         quick | standard | deep
--skip <steps>          跳过步骤：codegraph,openspec,obsidian,constitution
--dry-run               仅打印不写入
--force                 覆盖已有配置
```

### sdd sync 参数

```
--since <ref>           从指定 git ref 开始同步
--files <glob>          只同步特定文件
--dry-run               仅检测+分析，不写入
--watch                 持续监听模式
--resolve <strategy>    冲突解决：code-first | spec-first | manual
```

## 项目结构

```
sdd-exoskeleton/
├── cli/                  # CLI 工具（TypeScript/Node）
│   └── src/
│       ├── analyzers/    # 语言检测、结构分析
│       ├── commands/     # init, sync, status, doctor
│       ├── generators/   # OpenSpec, Obsidian, CLAUDE.md 生成器
│       ├── integrations/ # CodeGraph, OpenSpec, Obsidian 集成
│       ├── sync/         # 变更检测、影响分析、Delta 生成
│       └── utils/        # fs, git, logger
├── skills/               # 15 个可复用 AI Skills（4 类）
│   ├── init/             # 核心初始化
│   ├── evolution/        # 持续进化
│   ├── standards/        # 代码规范
│   └── workflow/         # 工作流
├── documents/            # 教程文档
│   ├── 01-概念/
│   ├── 02-快速入门/
│   ├── 03-工作流/
│   ├── 04-高级主题/
│   └── 05-案例/
├── prompts/              # 提示词库
├── workflow/             # 工作流模板
├── templates/            # Obsidian 模板
└── examples/             # 示例项目
```

## 技术栈

- **Runtime**: Node.js >= 18
- **Language**: TypeScript (ESM, strict mode)
- **CLI**: Commander.js
- **Git**: simple-git
- **File Watch**: chokidar
- **Testing**: Vitest

## 许可证

MIT

---

**sdd-exoskeleton** — Make legacy code AI-ready.
