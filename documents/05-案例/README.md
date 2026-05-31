# 案例分析

本章通过三个真实场景的案例，展示 sdd-exoskeleton 在不同技术栈项目中的实际应用。

## 案例一：Node.js Express 电商后台

### 项目背景

- **代码规模**：约 12 万行 TypeScript
- **技术栈**：Express.js + Sequelize + PostgreSQL + Redis
- **团队规模**：8 人（后端 4 人）
- **历史**：已开发 18 个月，经历过 3 次人员变动
- **痛点**：新人 onboarding 困难；AI 编程助手对模块依赖理解不准确

### 接入过程

**第 1 周：试点阶段**

选择订单模块（`src/modules/order/`）作为试点，这是一个核心模块，包含：
- `OrderService.ts` (600 行)
- `OrderController.ts` (400 行)
- `PaymentGateway.ts` (300 行)
- `ShippingCalculator.ts` (200 行)

```bash
# 配置只索引订单模块
# .sddexoskeleton.json
{
  "source": {
    "include": ["src/modules/order/**"]
  }
}

sdd init
```

产出：
- 1 个模块规范 `specs/modules/OrderService.md`
- 6 个 API 规范
- 3 个数据模型规范
- 自动检测到 4 个依赖模块（未纳入索引范围，标记为外部依赖）

**第 2-3 周：扩展阶段**

扩展到订单、支付、用户三个核心模块：

```json
{
  "source": {
    "include": [
      "src/modules/order/**",
      "src/modules/payment/**",
      "src/modules/user/**"
    ]
  }
}
```

```bash
sdd sync
```

这时 Obsidian Graph View 展示了三个模块间的依赖关系，团队第一次直观地看到了跨模块的耦合情况。

**第 4 周：全面推广**

```json
{
  "source": {
    "include": ["src/**"],
    "exclude": ["**/*.test.*", "src/legacy/**"]
  }
}
```

### 关键发现

1. **循环依赖发现**：`OrderService` ↔ `InventoryService` 存在循环依赖，此前无人察觉
2. **死代码识别**：`src/services/EmailService.ts` 在规范中显示没有任何模块依赖它，经确认可以删除
3. **API 规范覆盖**：发现 3 个 API 端点有路由但无 auth 中间件，安全漏洞得到修复

### 效果评估

| 指标 | 接入前 | 接入后 | 变化 |
|------|--------|--------|------|
| AI 编码任务上下文建立时间 | 12-18 分钟 | 2-4 分钟 | ↓ 70% |
| 新成员独立产出代码时间 | 3 周 | 5 天 | ↓ 67% |
| 跨模块影响的 Bug 率 | 约 15% | 约 5% | ↓ 67% |
| 代码审查发现架构问题的频率 | 每月 2-3 次 | 每月 8-10 次 | ↑ 300% |

### 经验教训

- **不要一开始就全量接入**：渐进式策略让团队逐步适应，避免信息过载
- **Obsidian Graph View 是说服团队的最佳工具**：可视化依赖关系比文字更有说服力
- **ADR 的价值被低估**：团队后来发现，记录下来的架构决策在 3 个月后帮助新成员理解了当初为什么选择了某个方案

## 案例二：Python 数据管道项目

### 项目背景

- **代码规模**：约 5 万行 Python
- **技术栈**：Python 3.10 + Apache Airflow + Pandas + PostgreSQL
- **团队规模**：3 人（数据工程师）
- **历史**：由多个分析师在 2 年内逐步累积，缺乏统一设计
- **痛点**：管道之间依赖关系混乱；修改一个脚本可能意外影响下游

### 接入过程

**第 1 周：全量索引**

由于项目规模适中，采用了全量初始化策略：

```bash
sdd init
# 全量索引完成：5 万行，7 个模块，23 个 DAG，15 个数据模型
# 耗时：18.3 秒
```

**关键操作**：

1. **补充人工知识**：为每个 DAG（Airflow 任务管道）在规范中添加 `<!-- MANUAL -->` 业务描述
2. **创建 MOC**：按数据域创建 Map of Content（`数据摄入.md`、`数据清洗.md`、`报表生成.md`）
3. **接入 Dataview**：创建仪表盘页面，实时查看模块覆盖率

**Dataview 仪表盘示例**（`specs/mocs/数据管道仪表盘.md`）：

````markdown
```dataview
TABLE
  file.cday as "创建日期",
  length(filter(file.tags, (t) => t = "manual")) > 0 as "有人工注释"
FROM "specs/modules"
WHERE type = "module"
SORT file.cday DESC
```
````

### 关键发现

1. **数据血缘可视化**：Obsidian Graph View 展示了 15 个数据表之间的依赖关系，发现了 2 个"孤儿表"（有数据写入但无人读取）
2. **DAG 依赖文档化**：Airflow 的跨 DAG 依赖（`ExternalTaskSensor`）在规范中自动记录，使得调度链一目了然
3. **重复逻辑识别**：3 个不同的 DAG 中包含相似的数据清洗逻辑，通过规范对比发现后进行了抽取

### 效果评估

| 指标 | 接入前 | 接入后 |
|------|--------|--------|
| 修改管道时排查影响范围的时间 | 30-60 分钟 | 5-10 分钟 |
| 管道故障定位时间 | 1-2 小时 | 15-30 分钟 |
| 新分析师上手时间 | 1 个月 | 1 周 |

### 经验教训

- **全量初始化在小项目中可行**：5 万行以下的项目，全量初始化的等待时间可以接受
- **手动注释的价值**：自动生成的规范帮助很大，但人为添加的业务描述（`<!-- MANUAL -->`）更有价值
- **仪表盘页面是团队的"指挥中心"**：团队养成了每天打开 Dataview 仪表盘查看管道状态的习惯

## 案例三：多语言微服务项目

### 项目背景

- **整体规模**：约 30 万行代码
- **服务架构**：12 个微服务
  - 6 个 Node.js (TypeScript) 服务（Express 和 Fastify）
  - 4 个 Python 服务（FastAPI）
  - 2 个 Go 服务
- **团队规模**：15 人（3 个小组）
- **痛点**：跨服务依赖关系不可见；API 契约分散在各服务的代码中；跨团队 AI 协作效率低

### 接入策略：Monorepo 统一 Vault

由于所有服务在同一 Git 仓库下（monorepo 结构），采用了 Monorepo 统一 Vault 策略：

```json
{
  "vaultStrategy": "monorepo",
  "monorepo": {
    "root": ".",
    "packages": ["services/*"],
    "specsBase": "specs"
  },
  "languages": {
    "typescript": {
      "include": ["services/*/src/**"]
    },
    "python": {
      "include": ["services/*/app/**"]
    },
    "go": {
      "include": ["services/*/cmd/**", "services/*/internal/**"]
    }
  }
}
```

### 分阶段接入

**第一阶段：API 层优先（第 1 周）**

组织各小组先为各自服务的 API 端点生成规范，优先建立跨服务的 API 契约视图：

```bash
# 每个服务独立索引
sdd init --include "services/user-service/**"
sdd init --include "services/order-service/**"
# ... 逐个服务

# 生成跨服务 API 契约 MOC
```

**第二阶段：数据模型（第 2 周）**

为各服务的数据模型生成规范，重点关注跨服务共享的数据表：

```bash
sdd sync --focus data-models
```

**第三阶段：模块内部逻辑（第 3-4 周）**

根据各小组意愿，逐步接入模块内部逻辑的规范。

### 关键发现

1. **跨服务 API 契约不一致**：`user-service` 和 `order-service` 之间的 API 调用，一个使用 `snake_case`，另一个使用 `camelCase`。通过规范对比发现了这个不一致
2. **Go 服务的依赖图特别清晰**：Go 的显式依赖管理使得 CodeGraph 能够精确构建依赖图，而 Python 的动态特性导致部分依赖未被自动检测，需要手动补充
3. **跨语言 MOC**：团队创建了 `specs/mocs/跨服务调用图.md`，使用双向链接标注了所有跨服务 API 调用

**跨服务调用图 MOC 示例**：

```markdown
---
type: moc
tags: [sdd, moc, architecture]
created: "2026-05-31"
---

# 跨服务调用图

## 用户服务 (TypeScript)
- 被调用: order-service, notification-service
- 调用: 无（基础服务）

## 订单服务 (TypeScript)
- 被调用: payment-service, shipping-service
- 调用: user-service (TypeScript), inventory-service (Python)

## 库存服务 (Python)
- 被调用: order-service
- 调用: warehouse-service (Go)

## 仓储服务 (Go)
- 被调用: inventory-service
- 调用: 无（底层服务）
```

### 效果评估

| 指标 | 接入前 | 接入后 |
|------|--------|--------|
| 跨服务 API 契约发现时间 | 2-3 天（需沟通和代码审查） | 即时（查看规范） |
| 新人理解整体架构时间 | 2-3 周 | 3-4 天 |
| 跨团队 AI 协作效率 | 需要大量人工上下文传递 | AI 直接读取公共规范 |

### 经验教训

- **Monorepo 统一 Vault 是大型项目的正确策略**：一个 vault 统览所有服务，Obsidian Graph View 展示了完整的服务拓扑
- **不同语言的解析质量不同**：TypeScript 和 Go 的静态类型让 CodeGraph 解析更精确；Python 的动态特性需要更多人工补充
- **API 层优先策略非常成功**：先建立跨服务边界视图，再深入服务内部，符合"由外向内"的认知规律
- **跨团队需要约定规范维护流程**：制定了"谁改 API 谁更新规范"的规则，避免规范过期

## 案例总结：通用模式

通过以上三个案例，可以归纳出以下通用模式：

### 1. 渐进式接入是王道

不管是 5 万行还是 30 万行，渐进式接入都比一次性全量接入更成功。区别只在于渐进的速度。

### 2. API 层优先于模块内部

API 是系统边界，也是 AI 最需要了解的信息。优先建立 API 规范视图，再深入模块内部。

### 3. 人工知识是自动生成的倍增器

自动生成的规范提供了结构骨架，但人工添加的业务注释、ADR、MOC 才是让知识库"活"起来的关键。

### 4. 可视化驱动采纳

Obsidian Graph View 是说服团队和管理层的最佳工具。一张图比一百页文档更有说服力。

### 5. SDD 不是项目管理的替代品

SDD 让 AI 理解了代码结构，但决策、设计、架构仍然需要人来完成和记录。SDD 是一个放大工具——它让好的开发实践更好，但不会自动创造好的开发实践。
