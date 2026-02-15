# ManagementSys

简介
---
ManagementSys 是一个使用 Node.js（Express）与 Prisma 的后端服务，提供用户管理与认证功能（基于短期 JWT 的 Access Token 与可撤销的 Refresh Token 会话管理）。

主要功能
---
- 用户增删改查（含权限校验）
- 认证：登录、刷新、登出（Access Token + Refresh Token）
- 密码使用 `bcrypt` 哈希存储
- 邮件验证与密码重置（支持 Resend 发送邮件）
- Redis 支持：缓存、限流、异步日志队列、会话存储（有 DB 回退逻辑）

快速开始（开发）
---
1. 在项目根目录填写 `.env`（特别是 `DATABASE_URL`、`JWT_SECRET`、`REDIS_URL`）。
2. 安装依赖：

```bash
npm install
```

3. 生成 Prisma client 并运行迁移（开发）：

```bash
npx prisma generate
npx prisma migrate dev
```

4. 启动开发服务器：

```bash
npm run dev
```

环境变量（常用）
---
- `DATABASE_URL` — Postgres 连接字符串
- `PORT` — HTTP 端口（默认 3000）
- `JWT_SECRET` — 签发 Access Token 的密钥（必填）
- `ACCESS_TTL_MIN` — Access Token 生存时间（分钟，默认 15）
- `REFRESH_TTL_HOURS` — Refresh Token 生存时间（小时，默认 24）
- `REDIS_URL` — Redis 连接字符串（启用 Redis 功能时设置）
- `RESEND_API_KEY` — 可选，配置后启用真实邮件发送

认证机制说明
---
- Access Token：短期 JWT，Payload 包含 `userId` 与 `sessionId`，由 `JWT_SECRET` 签名，用于保护路由（通过 `Authorization: Bearer <token>` 发送）。
- Refresh Token：明文格式为 `{sessionId}.{secret}`，服务器只保存 `secret` 的 bcrypt 哈希，支持轮换（每次刷新会生成新 secret 并更新存储）与撤销（设置 `revoked_at`）。
- 会话存储：优先使用 Redis（`session:<id>`、`user_sessions:<userId>`、`sessions:nextId`），Redis 不可用时回退到数据库 `sessions` 表。

常用 API 概览
---
- POST `/auth/login` — 登录，返回 `accessToken`，并设置 HttpOnly `refreshToken` cookie
- POST `/auth/refresh` — 使用 refresh token 获取新 access token（并轮换 refresh token）
- POST `/auth/logout` — 注销（撤销会话）
- POST `/auth/forgot-password` — 发送重置密码邮件（总是返回 200 以避免泄露账户是否存在）
- POST `/auth/reset-password` — 使用 token 重置密码
- GET `/users` — 列表（受保护，需要 `Authorization`）

密码重置与邮件
---
- 重置 Token：以明文发送到用户邮箱，但在 DB 中只保留哈希（SHA-256），并设置过期时间。
- 若未配置 `RESEND_API_KEY`，开发环境会在控制台输出邮件内容与链接，便于本地测试。

Redis 与本地监控（开发）
---
仓库提供 `docker/redis` 下的 docker-compose，用于运行 Redis + Prometheus + Grafana（开发监控）：

```powershell
cd docker/redis
docker compose up -d
```

注意（本仓库的默认配置）:
- 容器内 Redis 的 `6379` 映射到主机 `6380`（避免与本机已有 Redis 冲突）。
- Grafana 映射到主机端口 `3001`，API 服务默认使用 `3000`，避免端口冲突。

若更改 compose 端口，请同时更新 `.env` 中的 `REDIS_URL`（例如 `redis://127.0.0.1:6380`）。

日志与异步写入
---
- API 请求日志会先入 Redis 队列 `log_queue`，独立 worker 负责把日志写入数据库表 `api_logs`（如果没有 Redis，会直接写 DB）。

安全建议
---
- 在生产环境请务必设置强随机的 `JWT_SECRET`，并使用 HTTPS。
- 将 `refreshToken` 存为 HttpOnly cookie，避免前端 JS 读取。
- 定期检查和轮换外部服务密钥（如 `RESEND_API_KEY`）。

常见问题
---
- 如果发现页面返回 HTML（例如 Grafana 的界面），通常是端口被占用，请检查是否有其他服务占用 `3000` 或检查 `docker/redis/docker-compose.yml` 的端口映射。

项目维护与贡献
---
欢迎提交 PR 或 issue；如需我协助：起动开发环境、运行 E2E 测试或调整 Redis/Grafana 配置，可直接告知需要的操作。

版权与许可
---
该仓库遵循项目根目录的许可说明（如有）。

（自动生成：中文 README，可根据需要补充部署/生产化说明）
