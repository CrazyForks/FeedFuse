# 跨平台与工具检查

保证仓库命令在本地开发、Docker 与 CI 中具备清晰且一致的前提。

## 检查项

- Python 命令统一使用 `python3`
- Node.js 与包管理器版本以 `package.json` 的 `engines`、`packageManager` 为准
- 项目命令统一使用 `pnpm`；不要绕过 `package.json` scripts 复制长命令
- 脚本使用仓库相对路径，避免依赖个人目录、交互式输入或无限等待
- 数据库相关命令明确依赖 `DATABASE_URL`，本地运行前核对 PostgreSQL 版本和迁移状态
- 环境变量契约变化时同步更新 `.env.example`、`docs/development.md` 和 `docs/deploy.md`
