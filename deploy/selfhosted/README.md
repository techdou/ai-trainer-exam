# 自部署 Supabase + MinIO 部署手册

本目录是考试系统的自托管后端:**Postgres(supabase 官方镜像) + GoTrue(Auth) + Caddy(路由) + MinIO(对象存储)**,
已在开发机全链路实测(登录/刷题/考试/勋章/图片上传 62 项 API 验证全绿)。

架构要点:浏览器只访问 Next.js 应用,从不上连本栈 —— 因此四个服务端口全部只绑 127.0.0.1,
公网只需暴露应用本身(反向代理 + HTTPS 由你的服务器网关负责,如 nginx/caddy)。

## 前置要求

- Linux 服务器,4GB 内存起步(单机同时跑应用 + 本栈)
- 已安装 Docker 与 docker compose 插件
- 端口(仅本机回环):25432(pg) / 18000(auth 网关) / 19000(minio) / 19001(minio console)。被占则改 `docker-compose.yml` 与应用 env 同步换端口

## 首次部署

```bash
# 1. 拷贝本目录到服务器,进入目录
cd deploy/selfhosted

# 2. 生成全套密钥(输出一段 .env 内容,含 pg/jwt/apikey/minio 凭证)
node utils/generate-keys.mjs > keys.txt
# 把 keys.txt 里的键值合并进 .env(模板见 .env.example),然后删除 keys.txt
cp .env.example .env

# 3. 起服务(db 首次初始化约 30-60s)
docker compose up -d
docker compose ps          # 等四个服务全部 (healthy)

# 4. 验证 Auth 链路(用 .env 里的 SERVICE_ROLE_KEY)
curl -s http://127.0.0.1:18000/auth/v1/health
```

## 应用侧配置

应用 `.env.local`(或服务器上的生产 env)改成指向本栈:

```ini
# 数据库(直连, 跑迁移/业务查询)
DATABASE_URL=postgresql://postgres:<POSTGRES_PASSWORD>@127.0.0.1:25432/postgres
PGDATABASE_URL=postgresql://postgres:<POSTGRES_PASSWORD>@127.0.0.1:25432/postgres
# Supabase Auth(走 Caddy 网关; 变量名沿用历史命名, 指向自部署即可)
COZE_SUPABASE_URL=http://127.0.0.1:18000
COZE_SUPABASE_ANON_KEY=<ANON_KEY>
COZE_SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
# 对象存储(MinIO; 变量名沿用历史命名)
COZE_BUCKET_ENDPOINT_URL=http://127.0.0.1:19000
COZE_BUCKET_NAME=<MINIO_BUCKET>
AWS_ACCESS_KEY_ID=<MINIO_ROOT_USER>
AWS_SECRET_ACCESS_KEY=<MINIO_ROOT_PASSWORD>
AWS_REGION=cn-beijing
```

## 建 schema 与初始数据(在项目根目录)

```bash
# 1. 业务迁移(40+ 张表 + question_items 视图)
node_modules/.bin/tsx scripts/db/migrate.mts

# 2. 种子账号(输出一次性密码, 立即保存)
SEED_ADMIN_PASSWORD='<你定的管理员密码>' node_modules/.bin/tsx scripts/db/seed-core.mts

# 3. 题库/实操模板(可选, 或走管理端导入)
node_modules/.bin/tsx scripts/db/seed-questions-batch.mts
node_modules/.bin/tsx scripts/db/seed-tasks.mts
```

## 从旧库(扣子平台)迁移内容资产

```bash
# 题库/任务模板/组织结构/素材元数据(不含用户与考试记录, 幂等可重跑)
node_modules/.bin/tsx scripts/db/migrate-from-coze.mts '<旧库PG连接串>'

# 素材图片对象搬运(可选): 需在能访问旧桶(持有平台 COZE_BUCKET_* 凭证)的环境执行
node_modules/.bin/tsx scripts/db/migrate-from-coze.mts '<旧库PG连接串>' --with-assets
```

> 旧桶凭证只在扣子平台部署环境里可拿。拿不到时, 30 张素材图可在管理端"素材工坊"重新生成,
> 然后编辑对应题目重新关联(asset:UUID 引用会断链, 题目本身不受影响)。

## 日常运维速查

```bash
docker compose ps                     # 健康状态
docker compose logs -f auth           # 看 GoTrue 日志
docker exec exam-db pg_dump -U postgres postgres > backup-$(date +%F).sql   # 备份
docker exec -i exam-db psql -U postgres postgres < backup-xxx.sql           # 恢复
# MinIO 数据卷: docker volume ls | grep minio-data, 可用 mc mirror 周期镜像到备份盘
```

## 变量名说明(历史命名, 不必改)

`COZE_SUPABASE_*` / `COZE_BUCKET_*` 是早期使用扣子平台托管服务时的变量名,
代码只认变量名不认平台 —— 指向自部署实例即可, 业务代码零改动。

## 密钥轮换

JWT_SECRET 变更会让所有已发 access token 失效(用户重新登录即可):
1. `node utils/generate-keys.mjs` 生成新 JWT_SECRET + 两个 API key
2. 同步改 `.env` 的 JWT_SECRET/ANON_KEY/SERVICE_ROLE_KEY → `docker compose up -d`
3. 应用 env 同步新 ANON_KEY/SERVICE_ROLE_KEY → 重启应用
