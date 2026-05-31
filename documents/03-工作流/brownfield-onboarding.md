# 棕地项目接入指南

## 概述

**棕地项目 (Brownfield Project)** 指已有的、正在运行的、有历史积累的代码库。与从零开始的绿地项目不同，棕地项目具有以下典型特征：

- 代码量大（十万行到数百万行）
- 架构演进而非设计（有机增长，缺乏统一架构文档）
- 部分代码缺乏测试
- 团队成员可能已经离开，部分模块无人理解
- 存在技术债务和遗留依赖

sdd-exoskeleton 正是为这类项目设计的。本章介绍如何将 SDD 引入大型存量项目。

## 百万行代码项目的初始化策略

### 策略一：全量一次性初始化（不推荐）

```bash
sdd init
# 等待 10-30 分钟...
```

**缺点**：
- 初始化时间长，开发者需要等待
- 生成的规范数量过多（可能 500+ 个规范文件），信息过载
- Obsidian vault 打开时可能因节点过多而卡顿

### 策略二：分模块渐进式接入（推荐）

第一步：配置初始化范围。

在 `.sddexoskeleton.json` 中，从核心模块开始：

```json
{
  "source": {
    "include": ["src/modules/user/**", "src/modules/auth/**"]
  }
}
```

第二步：运行初始化。

```bash
sdd init
```

第三步：逐步扩展范围。

当团队适应了 SDD 工作流后，逐步将更多模块纳入：

```json
{
  "source": {
    "include": [
      "src/modules/user/**",
      "src/modules/auth/**",
      "src/modules/order/**",
      "src/modules/payment/**"
    ]
  }
}
```

每次扩展后运行 `sdd sync` 增量更新规范。

### 策略三：热区优先

不按目录结构，而是按代码变更频率决定优先级：

1. 运行 `sdd analyze --hotspots` 分析代码变更热区
2. 优先为变更最频繁的模块生成规范
3. AI 在修改热区代码时能立即受益于规范

```bash
# 分析最近 90 天的 Git 变更热区
sdd analyze --hotspots --since=90d

# 输出示例：
# Hotspot Analysis (last 90 days)
# ================================
# Module              Changes  Priority
# src/modules/order    47      ★★★★★
# src/modules/payment  38      ★★★★★
# src/modules/user     22      ★★★★
# src/legacy/reports    3      ★
```

## CodeGraph 索引优化

### 排除不必要的文件

初始化配置中合理使用 exclude 规则，可以显著减少索引体积和同步时间：

```json
{
  "source": {
    "include": ["src/**"],
    "exclude": [
      "**/*.test.*",
      "**/__tests__/**",
      "**/*.spec.*",
      "**/*.d.ts",
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.generated/**",
      "src/legacy/deprecated/**",
      "src/vendor/**"
    ]
  }
}
```

### 大规模索引的性能调优

对于大型项目（50 万行以上），可以调整以下参数：

**1. 分批初始化**

```bash
# 第一批：核心业务模块
sdd init --include "src/core/**"

# 第二批：API 层
sdd init --include "src/api/**" --append

# 第三批：工具库
sdd init --include "src/utils/**" --append
```

`--append` 参数表示追加模式，不会覆盖已有的规范文件。

**2. 内存限制**

```bash
# 限制 CodeGraph 解析时的最大内存使用
sdd init --max-memory 2048

# 测试解析的内存消耗
sdd dry-run --profile
```

**3. 并行度调整**

```json
{
  "codegraph": {
    "workers": 4,
    "batchSize": 100
  }
}
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `workers` | CPU 核心数 - 1 | AST 解析的并行线程数 |
| `batchSize` | 100 | 每批处理的文件数 |

### 增量更新的性能保证

sdd-exoskeleton 的增量同步机制保证了大型项目的可用性：

- **哈希缓存**：文件内容未变化则跳过解析
- **依赖子图**：仅重新计算变更文件相关的依赖边
- **部分写回**：仅写回发生变化的规范文件

示例：在 50 万行的项目中修改一个文件后运行 `sdd sync`，耗时约 2-5 秒。

## 规范编写优先级

### 分层优先级

对于大型棕地项目，按以下优先级分层编写规范：

**第 1 层（必须）：API 契约规范**

- 所有对外暴露的 HTTP/gRPC/消息队列 API
- API 的参数、返回值、错误码
- 原因：这是模块间和系统间交互的边界，AI 最需要了解

**第 2 层（推荐）：数据模型规范**

- 数据库表结构、字段、索引
- ORM 模型定义
- 原因：数据是系统的骨架，理解数据就理解了一大半系统

**第 3 层（按需）：模块核心逻辑**

- 核心业务模块的类和方法签名
- 不追求 100% 覆盖，优先覆盖高频变更模块

**第 4 层（按需）：依赖关系**

- 模块间的依赖图
- 关键数据流路径
- 原因：帮助 AI 理解变更的影响范围

**第 5 层（补充）：架构决策**

- 重大技术选型的 ADR
- 关键设计模式的使用原因
- 原因：为未来决策提供历史上下文

### 何时不需要生成规范

以下类型的代码通常不需要 SDD 规范：

- **纯工具函数**：如 `leftPad`、`formatDate`，实现简单且不变
- **第三方库的 wrapper**：仅封装外部 API 调用，无业务逻辑
- **废弃代码**：标记为 `@deprecated` 且计划删除的模块
- **配置和常量文件**：结构简单，读源码即可理解
- **测试文件**：测试本身就是规范的一种形式

## 处理遗留代码的特殊情况

### 没有测试的模块

对于完全缺乏测试的遗留模块，SDD 规范可以起到"文档化理解"的作用：

1. 先运行 `sdd init --module <name>` 生成结构化的模块规范
2. 开发者阅读规范，补充 `<!-- MANUAL -->` 注释，记录对代码的理解
3. 后续修改时，规范帮助 AI 在缺乏测试的情况下尽量不破坏现有行为

### 循环依赖

CodeGraph 能够检测并标记循环依赖：

```
$ sdd doctor

⚠ Circular dependency detected:
  src/modules/order/OrderService.ts
  → src/modules/payment/PaymentGateway.ts
  → src/modules/order/OrderService.ts

  This is documented in specs/modules/OrderService.md
```

循环依赖不会被阻止，但会在规范中以特殊标记标注，提醒开发者和 AI 注意。

### 多语言混合项目

对于同时包含 TypeScript 和 Python（例如，Node.js 后端 + Python 数据管道）的项目：

```json
{
  "language": "auto",
  "languages": {
    "typescript": {
      "include": ["src/**", "api/**"]
    },
    "python": {
      "include": ["pipeline/**", "scripts/**"]
    }
  }
}
```

CodeGraph 会为每种语言使用对应的解析器，统一输出到 OpenSpec 格式。在 Obsidian 中，不同语言的模块可以通过标签和文件夹区分。

## 团队推广策略

### 试点阶段（第 1-2 周）

1. 选择 1-2 个核心模块接入 SDD
2. 核心开发者（通常是 tech lead）率先使用
3. 收集反馈：AI 辅助开发效率是否有提升？

### 推广阶段（第 3-4 周）

1. 向全团队展示效果（例如：用 Obsidian Graph View 展示模块关系）
2. 将 `sdd sync` 集成到 post-commit hook
3. `specs/` 目录纳入 Git，全团队共享

### 成熟阶段（第 2 个月起）

1. 逐步扩大覆盖范围
2. 在代码审查 checklist 中加入 SDD 检查项
3. 定期使用 `sdd doctor` 检查规范健康度

## 常见阻力和应对

| 阻力 | 应对方案 |
|------|---------|
| "又要多维护一套东西" | SDD 是**自动生成**的，不需要手动维护。`sdd sync` 自动同步 |
| "规范文件太多，Obsidian 很慢" | 使用渐进式策略，从核心模块开始；合理使用 exclude |
| "我的代码太乱了，解析不出什么" | CodeGraph 解析的是**结构**（函数、类、API），不是代码质量。乱代码同样有结构 |
| "团队还没有用 Obsidian 的习惯" | 规范文件是纯 Markdown，可以用任何编辑器查看。Obsidian 是增强体验，不是必需 |
| "AI 本来就能读源码，为什么还要规范？" | AI 的上下文窗口有限（通常 200K tokens）。10 万行代码远超窗口。规范文件是代码的**浓缩摘要**，让 AI 在有限的 token 预算内获得全局理解 |

## 成功案例参考

### 案例：50 万行 Node.js 电商后台

- **时间线**：2 周完成核心模块（订单、支付、用户）接入
- **覆盖率**：最终覆盖 85% 的业务模块
- **效果**：
  - 新功能开发时，AI 理解上下文的时间从 15-20 分钟缩短到 2-3 分钟
  - 新人 onboarding 时间从 2 周缩短到 3 天
  - 代码审查中发现更多跨模块影响问题

更多案例详见 [05-案例](../05-案例/README.md)。
