# 共享结构约束

## 目录职责

- `src/lib/api/**`：浏览器侧 API client、错误映射、轮询与导入导出请求封装
- `src/lib/ui/**`：前端共享设计 token、class 常量和布局尺寸约定
- `src/lib/reader/**`、`src/lib/feeds/**`、`src/lib/userOperationCatalog.ts`：阅读器 / 订阅领域 helper 与共享契约
- `src/utils/**`：更基础的通用工具
- `src/types/**`：共享类型定义
- `src/data/**`：provider 抽象与 mock 适配
- `src/mock/**`：样例数据本体，当前主要服务 `src/data/mock/**` 与测试

## 放置规则

- 只有多个 feature、多个 store / component、或多个运行层都会复用时，才进入共享层
- 浏览器侧共享代码可以放在 `src/lib/api/**`、`src/lib/ui/**`，但不要反向依赖 `src/features/**`、`src/components/**`
- 真正跨层复用的 helper 优先放在 `src/lib/reader/**`、`src/lib/feeds/**`、`src/utils/**`、`src/types/**`，并尽量避免 `window`、`Next.js`、数据库连接和 worker 调度依赖
- provider / mock 逻辑留在 `src/data/**`、`src/mock/**`，不要混入真实后端数据访问
- 只被单个业务域使用的工具、hook、常量，优先回到业务目录就近维护

## 工具配置归一化规则

- 工具配置实体统一放在 `config/**` 下，按工具分目录管理，例如 `config/eslint/`、`config/vitest/`
- `package.json` scripts 直接指向实体配置，例如 `config/eslint/eslint.config.js`、`config/vitest/vitest.config.ts`、`config/typescript/tsconfig.typecheck.json`
- 涉及 `tsconfig` 继承链时，基础配置放在 `config/typescript/`，不要在根目录新增重复入口配置
