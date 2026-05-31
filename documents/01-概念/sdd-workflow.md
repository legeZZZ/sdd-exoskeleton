# SDD 工作流核心概念

## 概述

SDD 工作流围绕一个**四阶段循环**展开：Propose → Apply → Verify → Archive。这个循环嵌入在开发者的日常工作中，不改变已有的编码习惯，而是在 AI 层面增加了一个规范同步层。

## 四阶段循环

### 阶段一：Propose（提案）

**目标**：在动手修改代码之前，先明确要改什么、影响范围有多大。

当开发者或 AI 准备对代码库进行修改时：

1. **加载规范**：AI 读取当前模块的规范文件（`specs/modules/<name>.md`），建立上下文
2. **分析影响**：通过 CodeGraph 的依赖分析，识别本次变更可能波及的其他模块和 API
3. **生成变更提案**：创建 `specs/changes/<change-id>.md`，记录待变更的模块、文件、API 契约变更

变更提案格式示例：

```markdown
# Change: add-user-avatar-2026-01-15

## Motivation
用户资料页需要支持头像上传功能。

## Affected Modules
- modules/UserService — 新增 uploadAvatar 方法
- apis/POST_upload-avatar — 新增 API 端点

## API Changes
| Endpoint | Change | Description |
|----------|--------|-------------|
| POST /api/users/:id/avatar | ADD | 上传用户头像 |

## Data Changes
- User 表新增 avatar_url 字段
```

### 阶段二：Apply（应用）

**目标**：实施代码修改，并同步更新规范。

1. **修改代码**：按照变更提案修改源代码
2. **增量同步**：运行 `sdd sync`，CodeGraph 重新解析变更的文件
3. **更新规范**：OpenSpec 规范文件自动更新为最新状态
4. **写入日志**：在 `specs/journal/` 创建当天的日志条目，记录变更

增量同步的核心机制：

- CodeGraph 维护文件的哈希缓存，仅重新解析内容发生变化的文件
- 依赖分析引擎重新计算受影响的依赖边
- 仅更新发生变化的规范条目，保留人工添加的注释和 ADR 链接

### 阶段三：Verify（验证）

**目标**：确保规范与代码一致，知识库完整。

1. **一致性检查**：运行 `sdd doctor`，诊断以下问题：
   - 规范文件引用的文件路径是否存在
   - API 规范中的路由是否在代码中有对应的 handler
   - 数据模型规范中的表和列是否与数据库 schema 一致
2. **覆盖率分析**：检查哪些模块尚未生成规范
3. **死规范清理**：识别不再使用的规范条目（文件被删除但规范未清理）
4. **图完整性**：检查模块依赖图、API 路由图是否存在断裂

### 阶段四：Archive（归档）

**目标**：沉淀知识，为未来决策提供参考。

1. **变更归档**：完成的 `specs/changes/` 条目移入 `specs/archive/`
2. **ADR 创建**：重大架构决策写入 `specs/decisions/`
3. **MOC 更新**：更新相关的 Map of Content，确保入口可导航
4. **知识萃取**：从日志中提取可复用的模式和最佳实践

## OpenSpec 规范体系

OpenSpec 是 sdd-exoskeleton 的规范文件格式标准，定义了 vault 内的目录结构和文件格式。

### 目录结构

```
project-root/
├── specs/                    # OpenSpec 根目录
│   ├── .sdd/                 # SDD 元数据（索引缓存、哈希表）
│   ├── modules/              # 模块规范
│   │   ├── UserService.md
│   │   └── OrderService.md
│   ├── apis/                 # API 规范
│   │   ├── GET_users.md
│   │   └── POST_orders.md
│   ├── data/                 # 数据模型规范
│   │   ├── User.md
│   │   └── Order.md
│   ├── decisions/            # 架构决策记录 (ADR)
│   │   └── ADR-chose-postgres-over-mongo.md
│   ├── changes/              # 进行中的变更提案
│   │   └── add-caching-layer.md
│   ├── archive/              # 已完成的变更归档
│   ├── journal/              # 开发日志
│   │   └── 2026-01-15.md
│   └── mocs/                 # Map of Content
│       ├── 项目地图.md
│       └── API 总览.md
├── .obsidian/                # Obsidian 配置（自动生成）
│   └── templates/            # 链接到 templates/ 目录
└── templates/                # 笔记模板（此目录）
```

### Frontmatter 规范

每个 OpenSpec 文件使用 YAML frontmatter 标注元数据：

| 文件类型 | `type` 值 | 特有字段 |
|---------|----------|---------|
| 模块规范 | `module` | `module`（模块名）|
| API 规范 | `api` | `module`, `route`, `method` |
| 数据模型 | `data-model` | `name`, `table` |
| ADR | `adr` | `status` (proposed/accepted/deprecated/superseded) |
| 变更提案 | `change` | `status` (proposed/in-progress/completed/archived) |
| 日志 | `journal` | 无 |
| MOC | `moc` | 无 |

### Dataview 查询

OpenSpec 文件设计为可直接被 Obsidian Dataview 插件查询。示例：

```dataview
TABLE module, file.ctime as "Created"
FROM "specs/modules"
WHERE type = "module"
SORT file.ctime DESC
```

```dataview
TABLE route, method
FROM "specs/apis"
WHERE module = "UserService"
```

## Obsidian 知识沉淀

### 图谱可视化

Obsidian 的 Graph View 能够将规范文件之间的链接关系可视化：

- **局部图谱**：查看单个模块的所有关联（依赖、被依赖、API、数据模型）
- **全局图谱**：概览整个项目的模块拓扑
- **深度过滤**：按标签、文件夹、文件类型筛选显示

### 人工知识注入

规范文件中有两个知识来源：

1. **自动生成内容**：由 CodeGraph 从代码中提取，标记 `tags: [sdd, auto-generated]`
2. **人工补充内容**：开发者手动添加的业务背景、设计意图、注意事项，标记 `tags: [sdd, manual]`

自动生成的内容在 `sdd sync` 时会更新，但人工添加的内容会被保留（通过 diff 合并策略）。

### 模板系统

`templates/` 目录提供标准化的笔记模板：

- `module-note.md`：模块笔记模板
- `api-note.md`：API 端点笔记模板
- `data-model-note.md`：数据模型笔记模板
- `journal-note.md`：开发日志模板
- `adr-note.md`：架构决策记录模板
- `moc-note.md`：内容地图模板

## 增量同步机制

### 触发方式

1. **手动触发**：`sdd sync` 命令
2. **Git Hook**：post-commit hook 自动触发（可选配置）
3. **文件监听**：`sdd watch` 模式，检测文件变更后自动同步

### 增量计算流程

```
1. 文件变更检测
   └── 比较文件哈希值，识别变更文件列表

2. AST 增量解析
   └── 仅解析变更文件的 AST
   └── 提取：导出符号、函数签名、类定义、API 路由

3. 依赖图更新
   └── 更新变更节点在依赖图中的边
   └── 级联标记受影响但未直接变更的节点

4. 规范文件 diff
   └── 对比新旧规范内容
   └── 保留人工编辑区域（标记为 <!-- MANUAL --> 的区块）
   └── 写入更新后的规范

5. 日志记录
   └── 创建/追加当天日志条目
```

### 性能特征

- **首次初始化**：全量索引，10 万行代码约 30-60 秒
- **增量同步**：单文件变更约 1-3 秒
- **缓存策略**：AST 解析结果和依赖图缓存在 `.sdd/` 目录
