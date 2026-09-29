# ai-trainer-exam gpu-box 部署（~/projects/ai-trainer-exam）

2026-09-27 自广州（106.55.173.190）复制式整体迁移至 gpu-box（广州侧原样保留，域名 exam.dezedu.cn 走新服务）。本文档记录服务器侧与本地开发的差异，更新发布前必读。

## gpu-box 运行形态

- 应用：PM2 进程 `ai-exam`（项目根 `ecosystem.config.cjs`，`pnpm start` → PORT=18702 仅本机）
- 数据栈：项目自带 `deploy/selfhosted/docker-compose.yml`（exam-db / exam-auth / exam-minio / exam-gateway 四容器）
- 公网：https://exam.dezedu.cn → Cloudflare Tunnel（gpu-box 共享隧道）→ localhost:18702

## 与本地开发的关键差异（部署/更新时注意）

| 项 | 本地开发 | gpu-box 服务器 | 说明 |
| --- | --- | --- | --- |
| 网关端口 | 127.0.0.1:18000 | **127.0.0.1:18100** | `deploy/selfhosted/.env` 的 `GATEWAY_PORT`（避让 talents 栈） |
| db 直连端口 | 127.0.0.1:25432 | **127.0.0.1:25433** | compose 里写死，服务器副本已 sed；改 compose 时勿直接推送覆盖 |
| 对外域名 | — | `https://exam.dezedu.cn` | `.env`（栈：SITE_URL/API_EXTERNAL_URL）与 `.env.local`（应用侧若有） |
| pnpm 构建白名单 | 不需要 | **需要** `pnpm-workspace.yaml` 的 `allowBuilds: {protobufjs: true}` | pnpm v11 硬性要求，缺失时 install/build 全挂 |

`.env` / `.env.local` 密钥只存服务器，不入库。

## 更新发布（代码变更后）

```bash
# 从源侧打包推送（排除 node_modules/.next/.git）
tar czf - -C /path/to/ai-trainer-exam --exclude=node_modules --exclude=.next --exclude=.git . \
  | ssh gpu-box 'tar xzf - -C ~/projects/ai-trainer-exam'
ssh gpu-box 'cd ~/projects/ai-trainer-exam && pnpm install && pnpm build && pm2 reload ai-exam'
# 注意：tar 覆盖不会动服务器上的 .env/.env.local（源侧打包前确认未包含）
```

**推送后必须核对**（tar 覆盖风险点）：`grep GATEWAY_PORT deploy/selfhosted/.env`（应 18100）、`grep 2543 deploy/selfhosted/docker-compose.yml`（应 25433）——被覆盖即按上表改回。

## 数据库运维

- 迁移 SQL 只在首次 initdb 自动执行，后续 DDL 手动：`ssh gpu-box 'docker exec -i exam-db psql -U postgres -d postgres' < xx.sql`
- 备份：`~/projects/backup/backup-db.sh` 每日 03:30（crontab）已覆盖本库
- 恢复演练：`gunzip -c exam-db.dump.gz | docker exec -i exam-db pg_restore -U postgres --clean --if-exists -d postgres`

## 已知坑（迁移时踩过）

1. **GoTrue 必须先恢复数据再启动**：空库上首次 auth 迁移撞镜像预置对象 ownership（`must be owner of function uid`）死循环重启
2. gpu-box 的 docker 拉镜像走国内加速器会限流失败，缺镜像从源机 `docker save | gunzip | docker load` 搬
3. MinIO 镜像内没有 tar，卷数据恢复用 `docker run --rm -i -v <vol>:/data alpine tar xzf - -C /data`
