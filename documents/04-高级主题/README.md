# 高级主题

本章涵盖 sdd-exoskeleton 的高级配置和扩展功能，适合已经熟悉基本工作流的开发者。

## 自定义 LanguageConfig

### 什么是 LanguageConfig

LanguageConfig 定义了 CodeGraph 如何解析特定编程语言的源代码。它继承自 `claude-code-gen` 的 LanguageConfig 体系，支持精细化的解析行为配置。

### 默认配置

sdd-exoskeleton 内置了常见语言的默认配置：

- TypeScript / JavaScript — `@sdd-exoskeleton/lang-ts`
- Python — `@sdd-exoskeleton/lang-python`
- Go — `@sdd-exoskeleton/lang-go`

### 自定义解析行为

在 `.sddexoskeleton.json` 中添加 `languageConfig` 配置块：

```json
{
  "languageConfig": {
    "typescript": {
      "parser": "ts-morph",
      "extractPatterns": {
        "classes": true,
        "functions": true,
        "interfaces": true,
        "typeAliases": true,
        "enums": true,
        "decorators": ["@Controller", "@Injectable", "@Module"]
      },
      "apiDetection": {
        "framework": "express",
        "routePatterns": [
          "router\\.(get|post|put|delete|patch)\\(",
          "app\\.(get|post|put|delete|patch)\\("
        ],
        "handlerConvention": "camelCase"
      },
      "moduleDetection": {
        "pattern": "src/modules/**/*.{ts,js}",
        "exportThreshold": 3
      },
      "ignorePatterns": [
        "**/*.spec.*",
        "**/*.test.*",
        "**/__mocks__/**"
      ]
    }
  }
}
```

### 添加新语言支持

如果你的项目使用了 sdd-exoskeleton 暂不原生支持的语言，可以编写自定义 LanguageConfig：

**1. 安装或编写 LanguageConfig 包**

以 Kotlin 为例：

```bash
npm install @sdd-exoskeleton/lang-kotlin
```

或创建自定义配置文件 `.sdd/languages/kotlin.json`：

```json
{
  "name": "kotlin",
  "extensions": [".kt", ".kts"],
  "parser": {
    "type": "tree-sitter",
    "grammar": "tree-sitter-kotlin"
  },
  "extractors": {
    "classes": {
      "query": "(class_declaration) @class",
      "nameField": "name",
      "modifiersField": "modifiers"
    },
    "functions": {
      "query": "(function_declaration) @function",
      "nameField": "name",
      "parametersField": "parameters",
      "returnTypeField": "return_type"
    }
  },
  "apiDetection": {
    "framework": "ktor",
    "patterns": [
      "route\\([\"'](/[^\"']*)[\"']",
      "get\\([\"'](/[^\"']*)[\"']",
      "post\\([\"'](/[^\"']*)[\"']"
    ]
  }
}
```

**2. 注册自定义配置**

在 `.sddexoskeleton.json` 中引用：

```json
{
  "languages": {
    "kotlin": {
      "config": "./custom-lang-configs/kotlin.json",
      "include": ["src/main/kotlin/**"]
    }
  }
}
```

### 调试 LanguageConfig

```bash
# 测试解析单个文件
sdd parse src/modules/UserService.ts --verbose

# 查看代码的 AST 树
sdd parse src/modules/UserService.ts --ast

# 测试 API 检测规则
sdd parse src/routes/users.ts --detect-apis
```

## 编写自定义 Skill

SDD 支持通过 Skill 扩展其功能。Skill 是一组可复用的规范分析和操作规则。

详见[自定义 Skill 开发](./custom-skills.md)。

## Vault 策略选择

### 三种 Vault 策略

sdd-exoskeleton 支持三种 Obsidian vault 组织策略，通过 `.sddexoskeleton.json` 中的 `vaultStrategy` 配置：

#### 策略一：独立 Vault（默认）

```json
{
  "vaultStrategy": "standalone"
}
```

**特征**：
- `specs/` 目录位于项目根目录，项目本身就是 Obsidian vault
- 适合单一项目

**优点**：
- 简单直接，无需额外配置
- 所有规范和项目代码在同一目录

**缺点**：
- 无法在一个 Obsidian 窗口中查看多个项目
- 项目私有信息（如 `.env`）在 vault 中可见

#### 策略二：外部 Vault

```json
{
  "vaultStrategy": "external",
  "externalVault": {
    "path": "~/Documents/sdd-vaults/my-project"
  }
}
```

**特征**：
- `specs/` 生成在项目外部的独立目录
- 适合对项目根目录有严格结构要求的情况

**优点**：
- 规范文件与源代码完全分离
- 可以在 Obsidian 中创建"超级 vault"，通过软链接聚合多个项目

**缺点**：
- 需要管理两个目录
- 相对路径引用可能失效

#### 策略三：Monorepo 统一 Vault

```json
{
  "vaultStrategy": "monorepo",
  "monorepo": {
    "root": ".",
    "packages": ["packages/*", "services/*"],
    "specsBase": "specs"
  }
}
```

**特征**：
- 专为 monorepo 设计，在根目录的 `specs/` 下按包名分目录
- 适合一个仓库包含多个子项目的情况

**优点**：
- 一个 vault 统览所有子项目
- 跨子项目的依赖关系可被 Obsidian graph view 展示

**缺点**：
- 配置较复杂
- 初始索引时间较长

**目录结构示例**：

```
monorepo/
├── specs/
│   ├── modules/
│   │   ├── api-gateway/
│   │   ├── user-service/
│   │   └── order-service/
│   ├── apis/
│   │   ├── api-gateway/
│   │   └── user-service/
│   ├── data/
│   │   ├── user-service/
│   │   └── order-service/
│   └── mocs/
│       └── 服务总览.md
├── packages/
│   ├── api-gateway/
│   ├── user-service/
│   └── order-service/
└── package.json
```

### Vault 策略选择指南

| 场景 | 推荐策略 |
|------|---------|
| 单一项目，标准目录结构 | 独立 Vault |
| 需要严格隔离规范和源码 | 外部 Vault |
| Monorepo 或多服务仓库 | Monorepo 统一 Vault |
| 需要跨项目比较和分析 | 外部 Vault + 软链接 |

## CI/CD 集成

### GitHub Actions

```yaml
# .github/workflows/sdd.yml
name: SDD Specification Check

on:
  pull_request:
    paths:
      - 'src/**'
      - 'specs/**'

jobs:
  spec-health:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install sdd-exoskeleton
        run: npm install -g sdd-exoskeleton

      - name: Run spec sync
        run: sdd sync --ci

      - name: Run health check
        run: sdd doctor --ci --threshold 80

      - name: Generate spec diff
        run: |
          sdd diff --since-sync --format markdown > spec-diff.md

      - name: Comment PR with spec diff
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const diff = fs.readFileSync('spec-diff.md', 'utf8');
            github.rest.issues.createComment({
              ...context.repo,
              issue_number: context.issue.number,
              body: `## SDD Spec Changes\n\n${diff}`
            });
```

### GitLab CI

```yaml
# .gitlab-ci.yml
sdd-check:
  stage: test
  image: node:20
  script:
    - npm install -g sdd-exoskeleton
    - sdd sync --ci
    - sdd doctor --ci --threshold 80
    - sdd diff --since-sync --format json > spec-diff.json
  artifacts:
    paths:
      - spec-diff.json
    expire_in: 7 days
  only:
    - merge_requests
```

### Jenkins Pipeline

```groovy
pipeline {
  agent any

  stages {
    stage('SDD Check') {
      steps {
        sh 'npm install -g sdd-exoskeleton'
        sh 'sdd sync --ci'
        sh 'sdd doctor --ci --threshold 80'
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'spec-diff.md', allowEmptyArchive: true
    }
  }
}
```

### CI 模式的特殊行为

当使用 `--ci` 标志时：

- **禁止交互提示**：所有需要用户确认的操作自动使用默认值
- **严格模式**：警告（warning）视为错误（error）
- **机器可读输出**：所有输出为 JSON 或 JUnit XML
- **退出码规范**：0 = 成功，1 = 同步失败，2 = 健康检查未通过

### 覆盖率门槛

可以设置 CI 中的最低覆盖率要求：

```bash
sdd doctor --ci --threshold 80 --critical-modules "src/modules/user/**,src/modules/auth/**"
```

`--critical-modules` 参数指定核心模块路径，这些模块的覆盖率必须达到 100%。

## 性能监控

### 内置性能指标

```bash
# 查看同步性能统计
sdd stats

# 输出示例：
# SDD Statistics
# ==============
# Last init:     32.4s (847 files, 23 modules)
# Avg sync time: || 2.1s (last 50 syncs)
# Cache hit rate: 94.7%
# Index size:     2.3MB on disk
```

### 性能优化建议

1. **合理使用 exclude 规则**：排除测试文件、构建产物可以减少 30-50% 的文件扫描量
2. **限制模块检测范围**：不要将 `source.include` 设置为 `**/*`，精确指定源代码目录
3. **定期清理缓存**：`sdd clean --cache` 清理过期的哈希缓存
4. **使用文件监听模式**：`sdd watch` 比手动反复运行 `sdd sync` 更高效
