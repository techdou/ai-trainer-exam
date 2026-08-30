# 人工智能训练师五级练习与考试系统

面向职业培训学校、失业人员、高校毕业生及其他零基础社会学员的 Web 培训考试系统。

> 在线演示：[exam.techdou.cn](https://exam.techdou.cn)（部署实例，演示账号请联系维护者）

练习库与正式考试库使用独立数据表，考试题由练习库审核内容复制并冻结为试卷快照。系统覆盖理论题与 15 种实操任务映射，注册 18 个确定性评分器；正式成绩不依赖大语言模型（LLM）、外部网络请求或随机数。

## 目录

- [核心能力](#核心能力)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [API 端点](#api-端点)
- [考试安全机制](#考试安全机制)
- [关键安全原则](#关键安全原则)
- [仓库与密钥安全](#仓库与密钥安全)
- [质量检查与回归验证](#质量检查与回归验证)
- [部署](#部署)
- [贡献](#贡献)
- [开源协议](#开源协议)

## 核心能力

### 学员端

- **零基础友好界面**：大字号、少步骤、温和鼓励式反馈（"做对了！" / "答错了，没关系，再来一次"）。
- **理论练习**：单选题、判断题，即时答题即时判分，支持错题本回顾。
- **实操练习**（15 种任务映射，练习与考试同构）：

  | 分类 | 题型 | 说明 |
  |------|------|------|
  | 数据清洗 | Excel 删行 | 删除不符合条件的数据行 |
  | 数据清洗 | 图片数据清洗 | 识别并标记有问题的图片 |
  | 数据清洗 | 数据集质量体检 | 综合判断数据集质量 |
  | 图片标注 | 矩形框标注（含属性） | 目标检测框 + 类别标签 |
  | 图片标注 | 点标注 | 关键点定位 |
  | 图片标注 | 折线标注 | 轮廓线标注 |
  | 图片标注 | 多边形标注 | 精确区域标注 |
  | 文本标注 | 情感标注 | 正面/负面/中性分类 |
  | 文本标注 | 通用图文数据分类 | 多类别文件分类 |
  | 其他 | 文件分类 | 按类型整理文件 |
  | 其他 | 音频转写 | 语音转文字（校验语气助词） |
  | 其他 | 统计填表 | 数据统计与表格填写 |
  | 其他 | 提示词描述 | 根据图片素材撰写提示词 |
  | 其他 | Excel 综合操作 | 公式、排序、分类汇总与格式操作 |
  | 其他 | 综合任务 | 多步骤复合操作 |

- **考试流程**：查看可参加考试 → 开始考试（服务端创建 attempt）→ 答题 → 交卷 → 查看成绩。
- **标注作答交互**：矩形框拖拽实时预览、折线/轮廓双击收尾、Ctrl+Z 多步撤销、Pointer 事件触屏支持——零基础学员在平板上也能顺畅完成标注题。
- **Excel 实操内置电子表格内核**（Univer）：Excel 类实操题在真实电子表格中作答——单元格直接编辑、公式栏输入（=AVERAGE/=SUM 真实计算）、右键删行、工具栏排序/填充色/边框/数字格式；按题型裁剪可用功能（删行题仅开放删除、综合题全功能），可编辑格浅黄高亮；提交按语义导出（保留行/单元格值/行序/表头色/小数位/汇总），练习与考试共用同一组件，判分走既有确定性评分器。
- **AI 实训课堂**：三门递进式动手实训（商品评论情感分类 → 客服消息三分类分派 → 评论区广告识别），内置纯前端朴素贝叶斯模型；学员走完「标注 → 训练 → 观察结果 → 改标注 → 再训练」完整闭环，逐课解锁，进度本地持久化。
- **激励体系**：答题积分（幂等防刷）、8 枚勋章收集（含收集进度点）、班级积分排行榜。

### 教师端

- 仪表盘（班级概况、考试统计）
- 考试管理（创建/安排考试）
- 学员管理（查看进度、成绩）
- 错题分析、作业管理

### 管理端

- **多机构 RBAC**（8 种角色）：超级管理员、学校管理员、教师、题库编辑、题库审核、监考、学员、审计。
- **账号安全闭环**：管理员代设一次性初始密码（仅创建时显示一次），首次登录服务端强制改密（428 门控），改密前拦截一切业务 API；停用/启用、角色回收均事务化。
- **用户管理**：建号、重置密码、停用/启用、改角色；支持姓名/账号/机构搜索，列表按机构分组折叠展示；学校管理员只能管理本校用户、只能分配学员/教师/监考/题库类角色，无法操作超级管理员账号。
- **学员名册导入**：上传 `.xlsx` 名册批量建号，初始密码为"身份证后六位 + 机构级随机后缀"（后缀按机构存于系统设置，避免名册即密码本）；使用 ExcelJS 解析并限制最大行列数。
- **职责分离**：题库编辑不能审核自己提交的题目。
- **题库管理**：练习题库与考试题库独立管理，组卷时从练习库冻结快照到试卷；支持题目详情预览（选项、答案高亮、解析）；DOCX 批量导入带内容指纹去重（同一文件不允许重复导入）与非法答案拦截（无有效答案的题不入库）。
- **题库开放制**：题库内容三态可见性——机构私有 / 开放给指定机构（多对多共享）/ 全局开放；题库页一键切换与开放管理、批量全局化；实操练习按班级布置，支持批量勾选布置（已布置的自动跳过）。
- **智能组卷**：按题型/实操类型随机抽题，自动均分分值；抽题与加载在单次查询完成，无窗口期。
- **考试安排**：设置考试时间窗口、关联试卷与班级。
- **成绩管理**：复核（调整分数、通过/不通过标记）→ 发布门禁（发布前学员不可见）。
- **数据报表与导出**：成绩分布、考试通过率、班级对比、薄弱题型分析；支持成绩明细与学员练习进度两类报表，CSV 与 Excel 双格式，导出内容含 UTF-8 BOM 防中文乱码。
- **审计日志**：全链路操作留痕，支持分页与过滤查询。
- **媒体工坊**：AI 图片生成（标注素材）、TTS 音频生成（转写素材）。
- **系统设置**：配置项在线管理。

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16 (App Router, Turbopack) |
| 前端 | React 19 · TypeScript 5 (strict) · Tailwind CSS 4 · shadcn/ui (Radix UI) |
| 后端 | Next.js API Routes (Node.js Runtime) |
| 数据库 | Supabase PostgreSQL + RLS（全表 deny by default） |
| ORM | node-pg（直连），drizzle-orm（迁移） |
| 认证 | Supabase Auth (email/password) + 自建 Session 中间件 |
| 存储 | S3 兼容对象存储（AWS SDK） |
| 测试 | Vitest |
| 其他 | ExcelJS（Excel 操作）、Konva（画布标注）、Recharts（图表）、Sonner（Toast） |

## 快速开始

### 环境要求

- Node.js >= 22.13
- pnpm >= 9.0（项目强制使用，`preinstall` 脚本会拦截 npm/yarn）
- PostgreSQL 数据库（推荐 Supabase）

### 安装与启动

```bash
# 1. 克隆仓库
git clone https://github.com/techdou/ai-trainer-exam.git
cd ai-trainer-exam

# 2. 安装依赖
pnpm install --frozen-lockfile

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入 Supabase URL / Key、数据库连接串、对象存储配置等

# 4. 数据库迁移
pnpm db:migrate

# 5. 初始化种子数据
pnpm db:seed-core            # 组织/班级/用户（生产环境必须先设 SEED_ADMIN_PASSWORD）
pnpm db:seed-questions       # 可选：从 DOCX 导入理论题
pnpm db:seed-tasks           # 实操题种子（练习库 + 考试库）

# 6. 启动开发服务器
pnpm dev                     # → http://localhost:5000
```

> **密码安全**：新建账号的初始密码由加密安全随机数生成，只在创建时输出一次，首次登录强制修改。仓库不包含固定默认密码。

### 环境变量说明

所有配置项见 `.env.example`，关键变量包括：

| 变量 | 说明 |
|------|------|
| `COZE_SUPABASE_URL` | Supabase 项目 URL |
| `COZE_SUPABASE_ANON_KEY` | Supabase 匿名 Key（前端用） |
| `COZE_SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key（**仅服务端**，权限最高） |
| `PGDATABASE_URL` | PostgreSQL 直连字符串 |
| `COZE_BUCKET_*` | S3 兼容对象存储配置 |
| `COZE_WORKLOAD_API_TOKEN` | Coze SDK 工作负载 Token |
| `IMAGE2_API_*` | OpenAI Images 兼容图片生成 API |
| `SEED_ADMIN_PASSWORD` | 生产环境种子管理员密码（可选，不设则随机生成） |

> 严禁将 `.env.local` 或任何真实密钥提交到仓库。`.gitignore` 已默认排除所有 `.env*`（仅保留 `.env.example`）。

## 项目结构

```text
├── src/
│   ├── app/                        # 页面路由与 API
│   │   ├── admin/                  # 管理端页面
│   │   ├── api/                    # API 路由
│   │   ├── login/                  # 登录页
│   │   ├── change-password/        # 强制改密页
│   │   ├── student/                # 学员端页面
│   │   └── teacher/                # 教师端页面
│   ├── components/                 # 业务组件 + shadcn/ui 组件库
│   │   ├── ui/                     # shadcn/ui 组件
│   │   ├── app-shell.tsx           # 角色识别 Shell
│   │   ├── role-layout.tsx         # 通用角色布局
│   │   └── student-topbar.tsx      # 学员顶栏
│   ├── hooks/                      # 自定义 Hooks
│   ├── lib/                        # 工具库（apiFetch / constants / session-client）
│   ├── server/                     # 服务端逻辑
│   │   ├── auth.ts                 # 认证中间件
│   │   ├── audit.ts                # 审计日志
│   │   ├── db.ts                   # 数据库查询层
│   │   ├── exam-security.ts        # 考试安全（时间锁/防刷分）
│   │   ├── grading/                # 确定性评分引擎
│   │   ├── media/                  # 图片/音频 Provider 适配器
│   │   ├── object-storage.ts       # S3 对象存储
│   │   ├── question-bank.ts        # 题库 CRUD
│   │   └── users.ts                # 用户管理
│   └── storage/
│       └── database/
│           ├── schema.ts           # 数据库 Schema 定义
│           └── supabase-client.ts  # Supabase 客户端（service role）
├── drizzle/                        # 数据库迁移文件
├── deploy/selfhosted/              # 自部署包(Supabase 裁剪版 + MinIO + Caddy)
├── scripts/
│   ├── db/                         # 迁移/种子/回归验证脚本
│   ├── build.sh / dev.sh / start.sh # 构建/开发/启动脚本
│   └── quality-gate.mjs            # 质量门禁
├── public/                         # 静态资源（AI 生图 WebP / TTS 音频 / 演示素材）
├── .github/workflows/              # CI 质量门禁
├── .env.example                    # 环境变量模板
└── package.json
```

## API 端点

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/session` | 登录（返回 accessToken + user） |
| GET | `/api/auth/session` | 获取当前用户 |
| POST | `/api/auth/change-password` | 强制改密 |

### 学员端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/student/home` | 首页统计 |
| GET | `/api/student/practice/questions` | 练习题目列表 |
| POST | `/api/student/practice/check` | 提交答案判分（即时） |
| GET | `/api/student/practice/wrong` | 错题本 |
| GET | `/api/student/practice/task` | 实操任务列表 |
| POST | `/api/student/practice/submit` | 提交实操任务 |
| GET | `/api/student/exams` | 可参加的考试列表 |
| POST | `/api/student/exams/start` | 开始考试（创建 attempt） |
| GET | `/api/student/exams/questions` | 获取试卷题目 |
| POST | `/api/student/exams/heartbeat` | 考试心跳 |
| POST | `/api/student/exams/save` | 自动保存（keepalive 兜底） |
| POST | `/api/student/exams/submit` | 交卷（含服务端时间锁） |
| GET | `/api/student/results` | 成绩查询 |
| GET | `/api/student/gamification` | 我的积分 / 勋章 / 班级排行 |

### 教师端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/teacher/dashboard` | 教师仪表盘 |
| GET | `/api/teacher/exams` | 考试列表 |
| GET | `/api/teacher/students` | 学员列表 |
| GET | `/api/teacher/progress` | 学员进度 |
| GET | `/api/teacher/results` | 成绩查看 |
| GET | `/api/teacher/error-analysis` | 错题分析 |

### 管理端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/stats` | 系统统计 |
| GET/POST | `/api/admin/users` | 用户管理 |
| GET | `/api/admin/organizations` | 组织列表 |
| GET | `/api/admin/cohorts` | 班级列表 |
| GET/POST | `/api/admin/exam-schedules` | 考试安排 |
| GET/POST | `/api/admin/papers` | 试卷管理 |
| GET | `/api/admin/questions` | 题库管理 |
| GET | `/api/admin/results` | 成绩列表 |
| GET/PATCH | `/api/admin/scores/review` | 成绩复核 |
| POST | `/api/admin/scores/publish` | 发布成绩 |
| GET | `/api/admin/reports/overview` | 报表概览 |
| GET | `/api/admin/reports/export` | 报表导出 |
| GET | `/api/admin/audit-logs` | 审计日志 |
| GET/PATCH | `/api/admin/settings` | 系统设置 |
| POST | `/api/admin/media/generate-image` | AI 图片生成 |
| POST | `/api/admin/media/generate-audio` | TTS 音频生成 |

## 考试安全机制

- **服务端时间权威**：考试计时完全以服务器时间为准（`dbNow()` / 事务内 `SELECT now()`），学员修改电脑时间无法作弊。
- **断线续考**：每答一题 1.2 秒后自动保存，外加每 15 秒兜底保存；关页前最后一次保存带 `keepalive`；刷新/断网后重新进入考试列表会显示"继续考试"按钮，恢复到之前进度。
- **幂等交卷**：交卷请求按 `submission_hash` 幂等，重复提交只认第一次成功；超过截止时间（含宽限期）服务端拒绝。
- **超时缺考处理**：断线/掉电超宽限未交卷的 attempt，由成绩发布与考试恢复入口自动判为 `expired` 终态并按 0 分（缺考）生成成绩，单点掉线不会阻塞整场成绩发布。
- **试卷快照冻结**：组卷时题目、答案、素材 checksum、评分器版本全部冻结到 `exam_paper_items`，事后修改题库不影响已发试卷。
- **成绩发布门禁**：成绩在管理员发布前对学员三重过滤（`status='published' AND results_released=true AND release_at<=NOW()`）。
- **训练素材优化**：实操题图片素材统一使用 WebP 格式（quality 82），相比 PNG 节省约 78% 体积，标注题首屏加载更快。

## 关键安全原则

- 正式考试不读取练习库，不存在回退抽题。
- 客户端不能决定评分器、答案键、分值或及格线。
- 正式评分不调用 LLM、ASR 或图像识别模型——全部确定性计算。
- 试卷快照在组卷时冻结，考试进行中不下发答案与解析。
- service-role 数据库操作必须附带机构范围校验。
- RLS 对 `anon` / `authenticated` 全表拒绝，所有数据访问走 service-role + 应用层鉴权。
- 强制改密由服务端 428 状态码门控保证，不依赖前端自觉。

## 仓库与密钥安全

- 仓库只提交 `.env.example`，其中敏感变量必须保持空值；真实配置写入 `.env.local`。
- Supabase service role、数据库连接串、对象存储密钥和第三方 API Key 只能注入服务端运行环境，禁止写入源码、README、Issue、日志或截图。
- `.coze`、`.codex`、`.claude`、`.cursor`、`.vscode`、`.idea` 等个人开发工具配置不进入版本库。
- 私钥、证书、凭据 JSON、本地数据库、用户上传目录、构建产物、覆盖率和测试运行产物均由 `.gitignore` 排除。
- 提交前至少执行 `git diff --check`、敏感信息扫描和 `pnpm validate`。若密钥曾进入 Git 历史，单纯删除文件不够，必须立即轮换密钥并清理历史。

## 质量检查与回归验证

```bash
pnpm ts-check                # TypeScript 严格检查
pnpm lint:build              # ESLint（静默模式）
pnpm lint:style              # Stylelint
pnpm test                    # 评分器及关键业务状态机测试（Vitest）
pnpm validate                # 完整质量门禁（含构建）

# 端到端回归矩阵（需 dev server 运行在 5000 端口，连接真实数据库）
pnpm tsx scripts/db/verify-api.mts         # 管理/教师端 45 例: 权限/越权/用户生命周期/改密门控/导出
pnpm tsx scripts/db/verify-student.mts     # 学员端 19 例: 练习闭环/考试入口/防刷分/信息泄露探针
pnpm tsx scripts/db/verify-tasks.mts       # 题库契约 74 例: 满分提交必须满分/空卷不得分（全题型覆盖）
pnpm tsx scripts/db/verify-exam-flow.mts   # 交卷全链路 21 例: 组卷→开考→交卷→DB 层核验（自动清理）
```

验证脚本在共享数据库上遵循严格纪律：临时数据自动清理，真实业务数据零污染。

> 验证脚本通过 `scripts/db/_accounts.mjs` 从 `.env.local` 中的 `VERIFY_*_PASSWORD` 环境变量读取测试账号密码，不在源码中硬编码。运行前请先执行 `seed-core` 获取密码，并填入 `.env.local`。

## 部署

### 生产构建

```bash
pnpm install --frozen-lockfile
pnpm db:migrate              # 先备份数据库，并确认目标环境
pnpm build                   # 构建 Next.js 并打包 Node.js 22 服务端
pnpm start                   # Ubuntu 生产模式启动，默认端口 5000
```

生产环境要求 Ubuntu、Node.js 22.13+ 与 pnpm 9+。通过 `PORT` 或 `DEPLOY_RUN_PORT` 指定监听端口，密钥由部署平台环境变量或专用密钥管理服务注入。自部署方案（Supabase 裁剪版 + MinIO + Caddy，Docker Compose 一键起）见 [`deploy/selfhosted/README.md`](deploy/selfhosted/README.md)。

### CI/CD

项目配置了 GitHub Actions 质量门禁（`.github/workflows/ci.yml`），在 push/PR 时自动运行：

```text
quality-gate → ts-check → lint:build → lint:style → test → build
```

全部通过方可合并。

## 贡献

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feat/your-feature`)
3. 提交变更前运行 `pnpm validate` 确保全部通过
4. 提交 Pull Request，CI 会自动执行质量门禁

## 开源协议

[Apache License 2.0](LICENSE)
