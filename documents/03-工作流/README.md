# 工作流详解

本章详细阐述了在日常开发中如何将 SDD 工作流融入已有的开发实践，覆盖从日常编码到发布的全流程。

## 日常开发循环

### 典型的一天

以下是一个使用 SDD 的典型开发日：

```
09:00  打开项目，运行 sdd status 查看规范状态
09:05  阅读今天要修改的模块的规范文件（Obsidian 中快速浏览）
09:15  收到需求：为用户服务新增批量导入功能
09:20  创建变更提案 specs/changes/batch-import-users.md
09:30  使用 Claude Code / OpenCode 进行开发
       → AI 读取 UserService 模块规范建立上下文
       → AI 读取相关 API 和数据模型规范
       → AI 实施代码变更
10:30  运行 sdd sync 同步规范
10:35  运行 sdd doctor 检查一致性
10:40  测试通过
11:00  Git commit（可选：post-commit hook 自动同步）
11:05  sdd archive batch-import-users 归档变更
11:10  在 Obsidian 中补充 ADR 或业务笔记
12:00  上午结束
```

### 核心循环图

```
              ┌─────────────┐
              │   阅读规范   │ ← Obsidian / Dataview
              └──────┬──────┘
                     │
         ┌───────────▼───────────┐
         │  Propose 变更提案     │ ← specs/changes/
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │  Apply 编码 + 同步    │ ← sdd sync
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │  Verify 诊断 + 测试   │ ← sdd doctor + tests
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │  Archive 归档 + 沉淀  │ ← sdd archive
         └───────────────────────┘
```

## 变更提案流程

### 何时创建变更提案

**必须创建变更提案的场景：**

- 新增或删除 API 端点
- 修改数据模型（新增/删除表、修改字段类型）
- 新增或删除模块
- 修改模块间的依赖关系
- 不兼容的 API 契约变更（breaking change）

**可选创建变更提案的场景：**

- 模块内部逻辑重构（不改变对外接口）
- Bug 修复（不改变 API 契约）
- 性能优化（不改变行为）
- 文档和注释更新

### 变更提案生命周期

```
proposed → in-progress → completed → archived
                     ↘ abandoned
```

状态说明：

| 状态 | 含义 | 操作 |
|------|------|------|
| `proposed` | 已提案，尚未开始 | 讨论、评审 |
| `in-progress` | 正在实施 | 编码、同步 |
| `completed` | 已完成编码和同步 | 准备归档 |
| `archived` | 已归档 | 不再变更 |
| `abandoned` | 已放弃 | 保留记录以备参考 |

### 变更提案模板

在 Obsidian 中使用模板创建变更提案时，系统会自动填充以下结构：

```markdown
---
type: change
tags: [sdd, change]
created: "{{date}}"
status: proposed
---

# 变更标题（简洁描述变更内容）

## Motivation（动机）

为什么需要这个变更？要解决什么问题？

## Scope（范围）

### 受影响的模块
- [[modules/ModuleA]] — 变更类型（新增方法 / 修改接口 / 重构）
- [[modules/ModuleB]] — 变更类型

### 受影响的 API
- [[apis/GET_example]] — 变更类型（新增 / 修改 / 删除）

### 受影响的数据模型
- [[data/ModelX]] — 变更类型（新增字段 / 新增表 / 修改关系）

## Breaking Changes（不兼容变更）

- [ ] 有 API 契约不兼容变更
- [ ] 有数据模型不兼容变更
- [ ] 无 breaking changes

## Dependencies（前置依赖）

完成此变更需要哪些其他变更先完成？

## Risk Assessment（风险评估）

### 风险等级
- [ ] 低 — 模块内部变更，不影响外部
- [ ] 中 — 影响多个模块，但有测试覆盖
- [ ] 高 — 影响核心模块或数据模型

### 缓解措施

## Reviewers（评审人）

- 

## Status（状态）

proposed → in-progress → completed → archived
```

### 变更提案与 Git 工作流的关系

推荐做法：**一个变更提案对应一个 Git 分支**。

```
Feature: batch-import-users
  ├── specs/changes/batch-import-users.md  ← 变更提案
  ├── git branch: feat/batch-import-users
  └── 代码变更 + sdd sync
```

这使得 Git 历史与 SDD 规范历史保持一致，便于回顾。

## 代码审查流程

### AI 参与的代码审查

SDD 工作流中的代码审查有两个层面：

1. **AI 辅助审查**（编码过程中）：
   - AI 读取相关模块规范，检查代码是否与规范一致
   - AI 检查是否遗漏了需要同步到规范的变更
   - AI 发现潜在的架构问题（如循环依赖）

2. **人工审查**（PR 阶段）：
   - 审查者阅读变更提案，理解变更动机和范围
   - 审查者查看规范 diff（`sdd diff <change-id>`）
   - 审查者使用 `sdd doctor` 检查规范健康度
   - 审查者确保代码变更与规范更新对应

### 审查清单

审查代码时，请确认以下 SDD 相关的检查项：

- [ ] 是否有对应的变更提案？
- [ ] 新增/修改/删除的 API 是否在规范中同步？
- [ ] 新增/修改/删除的数据模型字段是否在规范中同步？
- [ ] 新增的模块依赖是否在规范中记录？
- [ ] 变更提案中的 breaking changes 标注是否准确？
- [ ] `sdd doctor` 检查是否通过？
- [ ] 新的架构决策是否需要创建 ADR？

### 规范 diff 查看

```bash
# 查看指定变更的规范差异
sdd diff batch-import-users

# 查看自从上次同步以来的所有变更
sdd diff --since-sync

# 查看特定模块的变更
sdd diff --module UserService
```

输出示例：

```
=== Spec Diff: UserService ===

+ Function: batchImportUsers(users: ImportUserDTO[]) => Promise<ImportResult>
+ Function: validateImportRow(row: Record<string, string>) => ValidationResult

  Modified: POST_users.md
  + Parameter: import_format (string, No, "JSON format of import data")

~ Module: UserService (export count: 5 → 7)

  New dependency: → [[modules/ValidationService]]
```

## 发布流程

### 发布前的 SDD 检查

在发布之前，运行完整的 SDD 检查：

```bash
# 1. 同步所有变更
sdd sync

# 2. 运行健康检查
sdd doctor

# 3. 检查未归档的变更
sdd status --changes

# 4. 生成发布规范报告
sdd report --release v2.1.0
```

### 发布规范报告

`sdd report --release <version>` 命令生成版本级别的规范报告，内容包括：

- 本次发布涉及的模块和 API 变更摘要
- Breaking changes 清单
- 新增/删除的 API 端点
- 数据模型变更（migration 相关）
- 架构决策记录（ADR）的状态更新

### 版本标签

在 `specs/` 中可以使用 Git 标签关联规范快照：

```bash
# 发布时打标签
git tag -a v2.1.0 -m "Release v2.1.0 - User batch import"
sdd report --release v2.1.0 > RELEASE_NOTES_spec.md

# 回顾历史版本的规范
git checkout v2.1.0 -- specs/
```

### CI/CD 集成

可以在 CI 流水线中集成 SDD 检查（详见[高级主题 - CI/CD 集成](../04-高级主题/README.md#cicd-集成)）：

```yaml
# .github/workflows/sdd-check.yml
name: SDD Check
on: [pull_request]
jobs:
  spec-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g sdd-exoskeleton
      - run: sdd doctor --ci
      - run: sdd diff --since-sync --format json > spec-diff.json
```

## 团队协作

### 多人并行开发

当多个开发者同时修改代码时：

1. **各自同步**：每个开发者在自己的分支上运行 `sdd sync`
2. **规范无冲突**：规范文件按模块/API 独立存储，大部分情况不会冲突
3. **合并时处理**：如果同一个规范文件在合并时有冲突，优先保留更完整的版本，再运行 `sdd sync` 自动修复

### 共享 Obsidian Vault

推荐做法是将 `specs/` 目录也纳入 Git 版本控制：

```gitignore
# .gitignore — 不要忽略 specs 目录
# specs/  ← 不要忽略

# 但可以忽略自动生成的缓存
.sdd/cache/
```

这样团队成员的 Obsidian vault 内容始终同步。每个开发者 `git pull` 后运行 `sdd sync` 即可获得最新规范。

### 知识分享

- **周会展示**：用 Obsidian Graph View 展示本周的模块变更
- **ADR 讨论**：在 `specs/decisions/` 中新增的 ADR 作为架构讨论的基础
- **新人 onboarding**：新成员直接打开 Obsidian vault，从 MOC 篇开始浏览项目全貌
