# 前端目录结构

## 页面与业务功能

- `src/app/(reader)/ReaderApp.tsx` 是主阅读器入口，`src/app/login/page.tsx` 是登录入口
- `src/features/<domain>/components` 放业务组件，`hooks` 放业务私有 Hook，`utils` 放业务纯函数
- `src/components/ui/**` 放无业务语义的 UI 基件；跨业务但非基件的组件放 `src/components/**`
- `src/hooks/**` 仅放跨业务复用的客户端 Hook，并通过 `index.ts` 聚合导出
- `src/store/**` 放跨组件共享的客户端状态

## 放置规则

- 页面入口保持轻量，业务交互下沉到对应 feature
- 只被单个 feature 使用的实现留在该 feature，不提前提升为全局共享
- 需要前后端共同消费的纯类型或函数放入 `src/types/**`、`src/lib/**` 或 `src/utils/**`
- 测试统一放在 `src/test/**`，目录尽量镜像被测代码位置

完整历史规则见 [前端结构约束](./structure.md)。
