# 共享结构约束

## 目录职责

- `src/lib/**`：跨多个调用点复用的轻量逻辑与客户端封装
- `src/utils/**`：更基础的通用工具
- `src/types/**`：共享类型定义
- `src/data/**`：数据提供抽象与 mock 相关适配

## 放置规则

- 只有前后端或多个 feature 都会复用时，才进入共享层
- 一旦模块依赖 `Next.js` 页面上下文、数据库连接或 worker 调度，就不再属于共享层
- 共享层优先保持无副作用、低依赖、易测试

## 工具配置归一化规则

- 工具配置实体统一放在 `config/**` 下，按工具分目录管理，例如 `config/eslint/`、`config/vitest/`
- `package.json` scripts 直接指向实体配置，例如 `config/eslint/eslint.config.js`、`config/vitest/vitest.config.ts`、`config/typescript/tsconfig.typecheck.json`
- 涉及 `tsconfig` 继承链时，基础配置放在 `config/typescript/`，不要在根目录新增重复入口配置
