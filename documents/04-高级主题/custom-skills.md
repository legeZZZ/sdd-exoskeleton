# 自定义 Skill 开发

## 什么是 SDD Skill

SDD Skill 是一组可复用的操作规则，用于扩展 sdd-exoskeleton 的规范分析和操作能力。Skill 以插件形式存在，可以在不同项目间共享和复用。

### Skill 的典型用途

- **自定义规范分析**：例如，检查某个模块的测试覆盖率是否达标
- **自动修复**：例如，自动为缺失规范的模块生成初始规范
- **集成外部工具**：例如，将 API 规范同步到 Postman Collection
- **团队定制规则**：例如，强制要求核心模块必须有关联的 ADR

## Skill 结构说明

### 目录结构

一个 Skill 是一个 npm 包或本地目录，包含以下文件：

```
my-sdd-skill/
├── skill.json           # Skill 元数据和配置
├── index.ts             # Skill 入口（或 index.js）
├── rules/               # 规则定义
│   ├── check-coverage.ts
│   └── enforce-adr.ts
├── templates/           # 自定义模板（可选）
│   └── custom-api-note.md
├── tests/               # 测试（推荐）
│   └── rules.test.ts
└── README.md            # 文档
```

### skill.json 配置

```json
{
  "name": "@sdd-skill/coverage-checker",
  "version": "1.0.0",
  "description": "检查模块测试覆盖率是否达标",
  "author": "your-team",
  "main": "index.js",
  "sdd": {
    "minVersion": "0.1.0",
    "type": "analyzer",
    "hooks": ["doctor"],
    "rules": [
      {
        "id": "coverage-threshold",
        "severity": "warning",
        "description": "模块覆盖率低于阈值",
        "config": {
          "threshold": 80,
          "criticalModules": ["src/modules/auth/**", "src/modules/payment/**"]
        }
      }
    ]
  }
}
```

### Skill 类型

| 类型 | 触发时机 | 说明 |
|------|---------|------|
| `analyzer` | `sdd doctor` 运行时 | 分析规范，生成诊断报告 |
| `generator` | `sdd sync` 运行时 | 生成额外的规范文件或内容 |
| `transformer` | `sdd sync` 写入规范前 | 转换规范内容（如格式转换） |
| `reporter` | 手动调用 `sdd report` 时 | 生成特定格式的报告 |

### Hooks 说明

Skill 通过 Hook 机制挂载到 sdd-exoskeleton 的生命周期：

| Hook | 触发时机 | Skill 类型 |
|------|---------|-----------|
| `doctor` | `sdd doctor` 运行时 | analyzer |
| `sync:before` | `sdd sync` 开始前 | generator, transformer |
| `sync:after` | `sdd sync` 完成后 | generator, reporter |
| `init:after` | `sdd init` 完成后 | generator |
| `report` | `sdd report` 运行时 | reporter |

## 编写示例

### 示例一：模块测试覆盖率检查器

**`rules/check-coverage.ts`**：

```typescript
import { SkillRule, SpecContext, DiagnosticResult } from 'sdd-exoskeleton/skill-api';

interface CoverageConfig {
  threshold: number;
  criticalModules: string[];
}

export const checkCoverage: SkillRule<CoverageConfig> = {
  id: 'coverage-threshold',
  severity: 'warning',

  async run(context: SpecContext, config: CoverageConfig): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    for (const moduleSpec of context.specs.modules) {
      const isCritical = config.criticalModules.some(
        pattern => moduleSpec.filePath.match(new RegExp(pattern.replace('**', '.*')))
      );

      // 查找对应的测试文件
      const testFile = context.findTestFile(moduleSpec.filePath);
      if (!testFile) {
        results.push({
          ruleId: this.id,
          severity: isCritical ? 'error' : 'warning',
          file: moduleSpec.filePath,
          message: `模块 ${moduleSpec.name} 缺少测试文件`,
          suggestion: `建议创建 ${moduleSpec.filePath.replace('src/', 'src/__tests__/').replace('.ts', '.test.ts')}`
        });
        continue;
      }

      // 分析测试覆盖率（实际实现中会调用覆盖率工具）
      const coverage = await context.analyzeCoverage(testFile, moduleSpec.filePath);

      if (coverage < config.threshold) {
        results.push({
          ruleId: this.id,
          severity: isCritical ? 'error' : 'warning',
          file: moduleSpec.filePath,
          message: `模块 ${moduleSpec.name} 测试覆盖率 ${coverage}% 低于阈值 ${config.threshold}%`,
          suggestion: `请为标准中列出的以下函数补充测试：\n${moduleSpec.functions.map(f => `  - ${f.name}`).join('\n')}`
        });
      }
    }

    return results;
  }
};
```

**`index.ts`**（Skill 入口）：

```typescript
import { SddSkill } from 'sdd-exoskeleton/skill-api';
import { checkCoverage } from './rules/check-coverage';

const skill: SddSkill = {
  name: '@sdd-skill/coverage-checker',
  hooks: {
    doctor: [checkCoverage]
  }
};

export default skill;
```

### 示例二：API 规范导出为 Postman Collection

**`index.ts`**：

```typescript
import { SddSkill, SpecContext } from 'sdd-exoskeleton/skill-api';
import { writeFileSync } from 'fs';

interface PostmanCollection {
  info: { name: string; schema: string };
  item: PostmanItem[];
}

interface PostmanItem {
  name: string;
  request: {
    method: string;
    url: { raw: string; host: string[]; path: string[] };
    header: { key: string; value: string }[];
    body?: { mode: string; raw: string };
  };
}

const exportToPostman: SddSkill = {
  name: '@sdd-skill/postman-exporter',
  hooks: {
    report: [
      {
        id: 'export-postman',
        async run(context: SpecContext): Promise<void> {
          const collection: PostmanCollection = {
            info: {
              name: context.projectName,
              schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
            },
            item: []
          };

          for (const apiSpec of context.specs.apis) {
            const item: PostmanItem = {
              name: `${apiSpec.method} ${apiSpec.route}`,
              request: {
                method: apiSpec.method,
                url: {
                  raw: `{{baseUrl}}${apiSpec.route}`,
                  host: ['{{baseUrl}}'],
                  path: apiSpec.route.split('/').filter(Boolean)
                },
                header: [
                  { key: 'Content-Type', value: 'application/json' }
                ]
              }
            };

            // 如果有请求体参数，添加 body 示例
            if (['POST', 'PUT', 'PATCH'].includes(apiSpec.method) && apiSpec.requestParams?.length) {
              item.request.body = {
                mode: 'raw',
                raw: JSON.stringify(
                  generateExampleBody(apiSpec.requestParams),
                  null,
                  2
                )
              };
            }

            collection.item.push(item);
          }

          // 写入 Postman collection 文件
          const outputPath = `${context.specsDir}/../postman-collection.json`;
          writeFileSync(outputPath, JSON.stringify(collection, null, 2));
          console.log(`✓ Postman collection exported to ${outputPath}`);
          console.log(`  ${collection.item.length} endpoints exported`);
        }
      }
    ]
  }
};

function generateExampleBody(params: any[]): Record<string, any> {
  const body: Record<string, any> = {};
  for (const param of params) {
    if (param.required) {
      body[param.name] = generateExampleValue(param.type);
    }
  }
  return body;
}

function generateExampleValue(type: string): any {
  const examples: Record<string, any> = {
    'string': 'example',
    'number': 0,
    'boolean': false,
    'array': [],
    'object': {}
  };
  return examples[type] ?? 'example';
}

export default exportToPostman;
```

### 示例三：自定义规范模板

**`templates/custom-api-note.md`**：

```markdown
---
module: "{{module}}"
type: api
tags: [sdd, auto-generated, my-team]
created: "{{date}}"
reviewed_by: ""
---

# {{title}}

## 端点信息

- **路由:** {{route}}
- **方法:** {{method}}
- **所属模块:** [[{{module}}]]
- **认证要求:** <!-- MANUAL -->
- **限流策略:** <!-- MANUAL -->

## 请求

| 参数 | 类型 | 必填 | 说明 |
|-----------|------|----------|-------------|

## 响应

| 字段 | 类型 | 说明 |
|-------|------|-------------|

## 错误码

| 状态码 | 说明 | 处理建议 |
|------|-------------|----------|

## 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| {{date}} | 初始创建 | auto-generated |
```

## 安装和使用 Skill

### 安装

**从 npm 安装**：

```bash
npm install --save-dev @sdd-skill/coverage-checker
```

**从本地目录安装**：

```bash
sdd skill add ./path/to/my-sdd-skill
```

**从 GitHub 安装**：

```bash
sdd skill add github:my-org/my-sdd-skill
```

### 配置

在 `.sddexoskeleton.json` 中注册 Skill：

```json
{
  "skills": [
    {
      "name": "@sdd-skill/coverage-checker",
      "config": {
        "threshold": 80,
        "criticalModules": ["src/modules/auth/**"]
      }
    },
    {
      "name": "@sdd-skill/postman-exporter",
      "config": {
        "outputPath": "./docs/postman-collection.json",
        "baseUrl": "https://api.example.com"
      }
    }
  ]
}
```

### 启用和禁用

```bash
# 查看已安装的 Skill
sdd skill list

# 输出：
# Installed Skills
# ================
# ✓ @sdd-skill/coverage-checker (analyzer) — active
# ✓ @sdd-skill/postman-exporter (reporter) — active
# ✗ @sdd-skill/size-monitor (analyzer) — disabled

# 启用 Skill
sdd skill enable coverage-checker

# 禁用 Skill
sdd skill disable size-monitor
```

## 调试技巧

### 1. 使用 verbose 模式查看 Skill 执行日志

```bash
sdd doctor --verbose

# 输出包含 Skill 的详细执行信息：
# [sdd-skill:coverage-checker] Scanning 23 modules...
# [sdd-skill:coverage-checker] Found test file for UserService: src/__tests__/modules/UserService.test.ts
# [sdd-skill:coverage-checker] Coverage analysis: 85.2% (pass)
# [sdd-skill:coverage-checker] No test file for LegacyModule: src/modules/LegacyModule.ts
```

### 2. 单独运行特定 Skill

```bash
sdd skill run coverage-checker
sdd skill run coverage-checker --module UserService
```

### 3. 使用 REPL 模式

```bash
sdd skill repl
# 进入 Skill REPL，可以交互式地测试 Skill API：
# > context.specs.modules.length
# 23
# > context.specs.modules[0].name
# 'UserService'
# > context.findTestFile('src/modules/UserService.ts')
# 'src/__tests__/modules/UserService.test.ts'
```

### 4. Skill API 类型定义

Skill 开发中使用的主要 API 类型：

```typescript
// SpecContext — 提供对规范数据的访问
interface SpecContext {
  projectName: string;
  specsDir: string;
  config: SddConfig;
  specs: {
    modules: ModuleSpec[];
    apis: ApiSpec[];
    dataModels: DataModelSpec[];
    decisions: AdrSpec[];
  };
  findTestFile(sourcePath: string): string | null;
  analyzeCoverage(testFile: string, sourceFile: string): Promise<number>;
  getModuleDependencies(moduleName: string): string[];
  getApiConsumers(apiRoute: string): string[];
}

// DiagnosticResult — 诊断结果
interface DiagnosticResult {
  ruleId: string;
  severity: 'info' | 'warning' | 'error';
  file: string;
  message: string;
  suggestion?: string;
}
```

## 社区贡献指南

### 发布 Skill 到 npm

1. 确保包名以 `@sdd-skill/` 开头（社区规范）
2. 在 `package.json` 中添加 `sdd` 字段配置
3. 包含 `README.md`，说明 Skill 的用途、配置项和使用方法
4. 推荐包含测试用例

### 命名规范

| 类型 | 命名模式 | 示例 |
|------|---------|------|
| 分析器 | `*-checker` | `coverage-checker`, `dead-code-checker` |
| 生成器 | `*-generator` | `changelog-generator`, `diagram-generator` |
| 转换器 | `*-exporter` | `postman-exporter`, `openapi-exporter` |
| 报告器 | `*-reporter` | `health-reporter`, `security-reporter` |

### Skill 质量检查清单

发布前请确认：

- [ ] `skill.json` 中声明的 hooks 与代码实现一致
- [ ] 所有配置项都有默认值
- [ ] Skill 在缺少可选配置时不崩溃
- [ ] 错误信息清晰，包含修复建议
- [ ] 提供至少一个测试用例
- [ ] README 中包含安装、配置、使用示例
