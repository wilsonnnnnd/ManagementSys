# Postman 接口测试指南

此文档说明如何使用 Postman 测试本项目提供的 API（包含登录、刷新 token、受保护的用户 CRUD 等）。假设服务运行在 `http://localhost:3000`，并且你已经按 `.env.example` 配置了环境变量并完成了迁移。

## 建议创建的 Postman 环境变量
- `baseUrl` = `http://localhost:3000`
- `accessToken` = (登录后由测试脚本写入)
- `refreshToken` = (登录后由测试脚本写入)
- `userId` = (可由创建用户或登录写入)

在请求中使用 `{{baseUrl}}` 与 `{{accessToken}}`。

## 通用设置
- 在请求的 `Authorization` header 中添加：
  - Key: `Authorization`
  - Value: `Bearer {{accessToken}}`

或在需要单独请求时手动填写 `Bearer <token>`。

## 请求与示例

1) 健康检查
- GET `{{baseUrl}}/health`
- 无需认证，返回 `{ ok: true, time: '...' }`。

2) 注册 / 创建用户
- POST `{{baseUrl}}/users`
- Body (JSON):

```json
{
  "first_name": "Alice",
  "last_name": "W",
  "email": "alice@example.com",
  "password": "secret123"
}
```
- Notes: 密码会在服务端用 `bcrypt` 哈希后保存。
- Postman Tests (可选)：在 `Tests` 标签粘贴以下脚本以保存 `userId`：

```javascript
const j = pm.response.json();
if (j && j.id) pm.environment.set("userId", j.id);
```

3) 登录（获取 accessToken + refreshToken）
- POST `{{baseUrl}}/auth/login`
- Body (JSON):

```json
{ "email": "alice@example.com", "password": "secret123" }
```
- Tests（把返回的 token 写入环境变量）：

```javascript
const j = pm.response.json();
if (j.accessToken) pm.environment.set("accessToken", j.accessToken);
if (j.refreshToken) pm.environment.set("refreshToken", j.refreshToken);
if (j.user && j.user.id) pm.environment.set("userId", j.user.id);
```

4) 使用受保护的接口（例如列出用户）
- GET `{{baseUrl}}/users`
- 在 Headers 中确保 `Authorization: Bearer {{accessToken}}`。

5) 刷新 access token
- POST `{{baseUrl}}/auth/refresh`
- Body (JSON):

```json
{ "refreshToken": "{{refreshToken}}" }
```
- Tests（将新的 accessToken 覆盖环境变量）：

```javascript
const j = pm.response.json();
if (j.accessToken) pm.environment.set("accessToken", j.accessToken);
```

6) 更新用户
- PUT `{{baseUrl}}/users/{{userId}}`
- Body (JSON) 示例：

```json
{ "first_name":"Alicia" }
```
- 需要 `Authorization` 头。普通用户只能更新自己的信息，admin 可更新任意用户。

7) 删除用户
- DELETE `{{baseUrl}}/users/{{userId}}`
- 受保护：只有 `admin` 或者该用户本人（owner）可以删除。请确保 `req.user.role` 对应或用数据库将某用户设为 `admin`（可直接在 DB 中更新 `users.role`）。

8) 登出
- POST `{{baseUrl}}/auth/logout`
- Body (JSON):

```json
{ "refreshToken": "{{refreshToken}}" }
```

## 在 Postman 中自动化（Collection & Runner）
1. 新建一个 Collection（例如 `ManagementSys`），把上面的请求依次加入。
2. 在 `auth/login` 的 Tests 中保存 `accessToken` 与 `refreshToken`（如上所示）。
3. 在需要认证的请求中，在 `Authorization` header 填 `Bearer {{accessToken}}`。
4. 使用 Collection Runner 执行整个流程：先运行 `users` 创建（或直接用已有用户），然后 `auth/login`，接着受保护接口，必要时运行 `auth/refresh` 来续期 token。

## 常见问题与排查
- 401 Invalid token：确认 `Authorization` header 为 `Bearer {{accessToken}}`，且 `accessToken` 未过期或已用 `auth/refresh` 更新。检查 `.env` 中 `JWT_SECRET` 是否设置一致。
- 403 Forbidden：确认当前用户 `role` 是否为 `admin`，或请求的 `userId` 与 `req.user.id` 是否一致（owner）。
- 创建用户失败（email 已存在）：先用不同 email，或在 DB 中删除冲突数据。

## 示例 Postman Tests 代码片段
- login Tests（保存 tokens）：

```javascript
const j = pm.response.json();
if (j.accessToken) pm.environment.set("accessToken", j.accessToken);
if (j.refreshToken) pm.environment.set("refreshToken", j.refreshToken);
if (j.user && j.user.id) pm.environment.set("userId", j.user.id);
```

- refresh Tests（覆盖 accessToken）：

```javascript
const j = pm.response.json();
if (j.accessToken) pm.environment.set("accessToken", j.accessToken);
```

## 运行顺序建议（第一次使用）
1. 确保服务运行：`npm run dev`。
2. 在 Postman 环境中设置 `baseUrl`。可先运行 `GET /health` 确认服务在线。
3. 创建测试用户（或在 DB 手动创建 admin）。
4. 登录并保存 token。
5. 用 `GET /users`、`PUT /users/:id` 等测试受保护接口。

---
如果你想，我可以：
- 生成并导出一个 Postman Collection JSON（我可以把 collection 文件写入仓库）；
- 或者我现在在本机用 `curl` 快速跑一遍示例请求并把结果贴给你。你想要哪一个？
