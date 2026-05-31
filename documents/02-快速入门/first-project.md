# 第一个 SDD 项目

本教程将引导你完成为示例项目接入 sdd-exoskeleton 的完整流程。

## 准备工作

### 1. 示例项目结构

我们以一个简单的 Express + SQLite 用户管理服务为例：

```
user-service/
├── src/
│   ├── index.ts              # 入口文件，Express 启动
│   ├── modules/
│   │   ├── UserService.ts    # 用户业务逻辑
│   │   └── AuthService.ts    # 认证逻辑
│   ├── routes/
│   │   ├── users.ts          # /api/users 路由
│   │   └── auth.ts           # /api/auth 路由
│   ├── models/
│   │   └── User.ts           # Sequelize User 模型
│   └── middleware/
│       └── auth.ts           # JWT 认证中间件
├── package.json
└── tsconfig.json
```

### 2. 安装 sdd-exoskeleton

```bash
npm install -g sdd-exoskeleton
```

验证安装：

```bash
$ sdd --version
sdd-exoskeleton v0.1.0
```

## 第一步：初始化项目

```bash
cd user-service
sdd init
```

初始化完成后，项目根目录新增了 `specs/` 和 `templates/` 目录：

```
user-service/
├── .obsidian/                # Obsidian vault 配置
├── specs/                    # 规范文件目录
│   ├── modules/
│   │   ├── UserService.md
│   │   └── AuthService.md
│   ├── apis/
│   │   ├── GET_users.md
│   │   ├── POST_users.md
│   │   └── POST_auth_login.md
│   ├── data/
│   │   └── User.md
│   ├── decisions/
│   ├── changes/
│   ├── archive/
│   ├── journal/
│   │   └── 2026-05-31.md
│   └── mocs/
│       └── 项目地图.md
├── templates/                # 笔记模板
│   ├── module-note.md
│   ├── api-note.md
│   ├── data-model-note.md
│   ├── journal-note.md
│   ├── adr-note.md
│   └── moc-note.md
├── .sddexoskeleton.json      # SDD 配置文件
├── src/
├── package.json
└── tsconfig.json
```

## 第二步：查看生成的规范文件

### 模块规范示例

打开 `specs/modules/UserService.md`：

```markdown
---
module: "UserService"
type: module
tags: [sdd, auto-generated]
created: "2026-05-31T14:32:18.000Z"
---

# UserService

## Overview

User management service with CRUD operations and profile handling.

## Files

- `src/modules/UserService.ts` — Main service class

## Classes

| Class | Description |
|-------|-------------|
| UserService | User CRUD operations, profile management, avatar upload |

## API

| Function | Signature | Description |
|----------|-----------|-------------|
| createUser | `(data: CreateUserDTO) => Promise<User>` | Create a new user |
| findById | `(id: number) => Promise<User \| null>` | Find user by primary key |
| findAll | `(filters: UserFilters) => Promise<User[]>` | List users with optional filters |
| updateProfile | `(id: number, data: UpdateProfileDTO) => Promise<User>` | Update user profile fields |
| deleteUser | `(id: number) => Promise<void>` | Soft-delete a user |

## Dependencies

- [[modules/AuthService]]

## Related

- [[apis/GET_users]]
- [[apis/POST_users]]
- [[data/User]]
```

### API 规范示例

打开 `specs/apis/GET_users.md`：

```markdown
---
module: "UserService"
type: api
tags: [sdd, auto-generated]
created: "2026-05-31T14:32:18.000Z"
---

# GET /api/users

## Details

- **Route:** GET /api/users
- **Method:** GET
- **Module:** [[UserService]]

## Request

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 20, max: 100) |
| status | string | No | Filter by user status (active/inactive) |

## Response

| Field | Type | Description |
|-------|------|-------------|
| data | User[] | Array of user objects |
| total | number | Total count of matching users |
| page | number | Current page number |
| limit | number | Items per page |

## Error Codes

| Code | Description |
|------|-------------|
| 401 | Unauthorized — missing or invalid JWT |
| 500 | Internal server error |
```

### 数据模型规范示例

打开 `specs/data/User.md`：

```markdown
---
name: "User"
type: data-model
tags: [sdd, auto-generated]
created: "2026-05-31T14:32:18.000Z"
---

# User

## Table: users

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | INTEGER | NO | AUTO_INCREMENT | Primary key |
| username | VARCHAR(50) | NO | — | Unique username |
| email | VARCHAR(255) | NO | — | Unique email address |
| password_hash | VARCHAR(255) | NO | — | bcrypt hashed password |
| status | VARCHAR(20) | NO | 'active' | User status |
| created_at | DATETIME | NO | CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | DATETIME | NO | CURRENT_TIMESTAMP | Last update timestamp |

## Indexes

| Name | Columns | Type |
|------|---------|------|
| idx_users_email | email | UNIQUE |
| idx_users_username | username | UNIQUE |
| idx_users_status | status | BTREE |

## Relations

- **Order** — has_many via user_id

## Used By

- [[modules/UserService]]
- [[modules/AuthService]]
```

## 第三步：打开 Obsidian Vault

### 打开方式

**方式一：命令行**

```bash
sdd open
```

**方式二：Obsidian 界面**

1. 打开 Obsidian
2. 点击左下角 "Open another vault"
3. 选择 `user-service` 目录
4. 信任并打开

### 配置 Obsidian

在 vault 中按 `Cmd+P`（macOS）或 `Ctrl+P`（Windows/Linux），运行以下设置：

1. **启用模板插件**：
   - Settings → Core Plugins → Templates → 开启
   - 设置模板目录为 `templates/`

2. **安装 Dataview 插件**（推荐）：
   - Settings → Community plugins → Browse
   - 搜索 "Dataview"，安装并启用

### 浏览规范

打开 Graph View（左侧边栏 → Open graph view），你会看到：

- **模块节点**（蓝色）：UserService、AuthService
- **API 节点**（绿色）：GET /api/users 等
- **数据节点**（橙色）：User 模型
- **连线**：表示依赖关系、关联关系

拖拽节点可以重新排列，点击节点可以快速跳转到对应的规范文件。

## 第四步：做一次代码变更并同步

### 场景：新增头像上传功能

#### 1. 创建变更提案

在 Obsidian 中使用模板创建变更提案：

1. 在 `specs/changes/` 目录下新建文件 `add-avatar-upload.md`
2. 使用 `Cmd+T` 选择模板（如果有变更提案模板）
3. 填写内容：

```markdown
---
type: change
tags: [sdd, change]
created: "2026-05-31"
---

# add-avatar-upload

## Motivation
用户需要上传头像图片。

## Changes
- UserService 新增 uploadAvatar 方法
- 新增 POST /api/users/:id/avatar 路由

## Status
proposed → in-progress
```

#### 2. 修改代码

在 `src/modules/UserService.ts` 中新增方法：

```typescript
async uploadAvatar(userId: number, file: Express.Multer.File): Promise<string> {
  const filename = `avatars/${userId}-${Date.now()}.${file.originalname.split('.').pop()}`;
  await s3.upload(filename, file.buffer, file.mimetype);
  const url = `${this.config.cdnBase}/${filename}`;
  await User.update({ avatar_url: url }, { where: { id: userId } });
  return url;
}
```

在 `src/routes/users.ts` 中新增路由：

```typescript
router.post('/api/users/:id/avatar', auth, upload.single('avatar'), async (req, res) => {
  const url = await userService.uploadAvatar(Number(req.params.id), req.file!);
  res.json({ url });
});
```

#### 3. 同步规范

```bash
$ sdd sync

Scanning for changes...
  Modified: src/modules/UserService.ts
  Modified: src/routes/users.ts

Updating specs...
  ✓ Updated specs/modules/UserService.md (+1 function)
  ✓ Created specs/apis/POST_users-{id}-avatar.md
  ✓ Updated specs/journal/2026-05-31.md

Sync complete in 1.8s
```

#### 4. 验证结果

```bash
$ sdd status

Spec Status Report
─────────────────
Modules:     2 (2 in sync, 0 stale)
APIs:        4 (4 in sync, 0 stale)
Data models: 1 (1 in sync, 0 stale)
Journal:     2 entries
Changes:     1 active (add-avatar-upload)
─────────────────
✓ All specs in sync
```

打开 `specs/modules/UserService.md`，你会看到 `uploadAvatar` 方法和 `POST /api/users/:id/avatar` API 规范已自动添加。

#### 5. 归档变更

完成后，将变更提案移入归档：

```bash
sdd archive add-avatar-upload
```

或者在 Obsidian 中手动将文件从 `specs/changes/` 拖动到 `specs/archive/`，并更新 frontmatter 的 status 为 `completed`。

## 第五步：日常使用技巧

### 创建自定义 MOC

Map of Content（内容地图）帮助组织大型 vault。例如在 `specs/mocs/` 下创建 `用户模块地图.md`：

```markdown
---
type: moc
tags: [sdd, moc]
created: "2026-05-31"
---

# 用户模块地图

## 服务

- [[modules/UserService]] — 用户 CRUD
- [[modules/AuthService]] — 认证和 JWT

## API 端点

- [[apis/GET_users]] — 列表查询
- [[apis/POST_users]] — 创建用户
- [[apis/POST_users-{id}-avatar]] — 头像上传
- [[apis/POST_auth_login]] — 登录

## 数据

- [[data/User]] — 用户表

## 架构决策

- [[decisions/ADR-chose-jwt-for-auth]] — 选择 JWT 的决策记录
```

### 添加人工知识

在自动生成的规范文件中，你可以在任意位置添加人工笔记。使用 `<!-- MANUAL -->` 注释包裹的内容将在同步时保留：

```markdown
<!-- MANUAL -->
## Business Rules

- 每个邮箱只能注册一个账号
- 用户名长度限制 3-50 字符，不能包含特殊符号
- 密码必须包含大小写字母和数字，至少 8 位
<!-- /MANUAL -->
```

### 使用 Dataview 查询

在任意笔记中插入 Dataview 代码块：

````markdown
```dataview
TABLE route, method
FROM "specs/apis"
WHERE module = "UserService"
```
````

这样就可以在阅读笔记时动态查看相关 API。

## 常见问题

### Q: 初始化失败了怎么办？

运行 `sdd doctor` 查看具体错误。常见原因：

- **不支持的编程语言**：检查 `sdd doctor` 输出中不支持的文件列表
- **源目录不存在**：确保 `source.include` 配置的路径存在
- **权限问题**：确保对项目目录有读写权限

### Q: 同步后一些手动添加的内容丢失了？

手动添加的内容必须用 `<!-- MANUAL -->` 和 `<!-- /MANUAL -->` 包裹，否则同步时可能被覆盖。

### Q: 如何排除特定文件或目录？

在 `.sddexoskeleton.json` 的 `source.exclude` 中添加 glob 模式：

```json
{
  "source": {
    "exclude": ["**/*.test.*", "**/__tests__/**", "src/legacy/**"]
  }
}
```

## 下一步

- [日常开发工作流](../03-工作流/README.md) — 将 SDD 融入日常工作
- [棕地项目接入指南](../03-工作流/brownfield-onboarding.md) — 大型项目的接入策略
- [高级主题](../04-高级主题/README.md) — 自定义配置和扩展
