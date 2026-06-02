# 部署指南

这份文档面向想直接运行 FeedFuse 的用户，默认使用预构建镜像和 `docker compose` 完成部署。

如果你是要本地改代码或调试实现，请改看 [开发指南](./development.md)。

## 推荐方式

推荐使用仓库 `deploy/` 目录对应的发布文件：

- `deploy/compose.yaml`
- `deploy/.env.example`

这样可以直接使用已经构建好的镜像，不需要先拉取完整源码仓库。

## 环境要求

- 已安装 Docker
- 已安装 Docker Compose

## 1. 准备安装目录并下载发布文件

```bash
mkdir -p feedfuse
cd feedfuse
curl -fsSL -o compose.yaml https://raw.githubusercontent.com/BryanHoo/FeedFuse/main/deploy/compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/BryanHoo/FeedFuse/main/deploy/.env.example
```

## 2. 编辑 `.env`

至少需要修改这三个值：

- `IMAGE_PROXY_SECRET`：改成你自己的随机密钥
- `AUTH_INITIAL_PASSWORD`：改成默认管理员首次登录密码
- `POSTGRES_PASSWORD`：改成你自己的数据库密码

默认情况下，`.env` 已包含本地自托管所需的基础配置：

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_PORT`
- `WEB_PORT`
- `IMAGE_PROXY_SECRET`
- `AUTH_INITIAL_PASSWORD`
- `RSS_NETWORK_MODE`
- `RSS_ALLOWED_CIDRS`

RSS 网络访问默认使用 `RSS_NETWORK_MODE=public`，仅允许公网地址。常见模式：

- `public`：默认，仅允许公网地址
- `fake-ip`：额外允许 `198.18.0.0/15`
- `lan`：额外允许常见 RFC1918 局域网地址
- `custom`：只额外允许 `RSS_ALLOWED_CIDRS` 里的网段

只有在你明确需要兼容 fake-ip 或内网 RSS 时才调整这些值。例如：

- `RSS_NETWORK_MODE=fake-ip`
- `RSS_NETWORK_MODE=custom`
- `RSS_ALLOWED_CIDRS=192.168.0.0/16,10.0.0.0/8`

## 3. 拉取镜像并启动服务

```bash
docker compose pull
docker compose up -d
```

启动后访问：

```text
http://127.0.0.1:9559
```

`docker compose` 会同时启动：

- `db`：PostgreSQL
- `web`：FeedFuse Web 应用，启动前会自动执行数据库迁移
- `worker`：后台任务进程，用于抓取全文、生成摘要、翻译和 `AI解读`

## 4. 首次使用

1. 使用用户名 `admin` 和 `.env` 里的 `AUTH_INITIAL_PASSWORD` 登录
2. 添加自己的 RSS 源
3. 按需整理分类
4. 如果需要 AI 能力，再到设置中心补充 AI 配置
5. 开始阅读，并按需要生成摘要、翻译或 `AI解读`

默认管理员首次登录成功后，密码会写入数据库，后续继续使用你修改后的账号密码登录。

## 5. 配置 AI

如果你只想先体验 RSS 阅读，这一步可以稍后再做。

启用 AI 后，FeedFuse 可以提供：

- `AI 摘要`
- 标题翻译
- 正文翻译
- 沉浸式双语阅读
- `AI解读`

配置路径：

1. 打开设置中心，切到 `AI`
2. 如果使用 OpenAI，填写：
   - `AI 模型`：例如 `gpt-4o-mini`
   - `API 地址`：`https://api.openai.com/v1`
   - `API 密钥`：你的 OpenAI API key
3. 如果使用兼容 OpenAI 的服务，填写服务商给你的：
   - `AI 模型`
   - `API 地址`（通常带 `/v1`）
   - `API 密钥`
4. 翻译默认选 `复用主配置`
5. 只有翻译要单独走另一套服务时，才切到 `单独配置`，并填写：
   - `翻译模型`
   - `翻译 API 地址`（通常带 `/v1`）
   - `翻译 API 密钥`
6. 等待右上角状态显示 `已保存`

## 6. 升级

直接重新拉取并启动即可：

```bash
docker compose pull
docker compose up -d
```

如果你想固定到某个版本方便回滚，可以把 `compose.yaml` 里的：

- `ghcr.io/bryanhoo/feedfuse-web:latest`
- `ghcr.io/bryanhoo/feedfuse-worker:latest`

改成具体版本号，例如 `0.2.0`。

## 补充说明

- 仓库根目录的 `docker-compose.yml` 主要用于从源码构建和调试，不是推荐的生产部署入口
- 如果你只是想“先跑起来”，优先使用这份文档里的发布文件方式
