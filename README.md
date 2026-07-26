# 人工智能训练师五级练习与考试系统

面向职业培训学校、失业人员、高校毕业生及其他零基础社会学员的完整 Web 培训考试系统。

练习库与正式考试库物理分离，覆盖理论题与 13 种实操题型，全部使用确定性评分器自动判分——正式成绩不依赖任何 LLM、网络请求或随机数。

## 目录

- [核心能力](#核心能力)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [API 端点](#api-端点)
- [考试安全机制](#考试安全机制)
- [关键安全原则](#关键安全原则)
- [质量检查与回归验证](#质量检查与回归验证)
- [部署](#部署)
- [开源协议](#开源协议)

## 核心能力

### 学员端

- **零基础友好界面**：大字号、少步骤、温和鼓励式反馈（"做对了！" / "答错了，没关系，再来一次"）。
- **理论练习**：单选题、判断题，即时答题即时判分，支持错题本回顾。
- **实操练习**（13 种题型，练习与考试同构）：

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
  | 其他 | 综合任务 | 多步骤复合操作 |

- **考试流程**：查看可参加考试 → 开始考试（服务端创建 attempt）→ 答题 → 交卷 → 查看成绩。

### 教师端

- 仪表盘（班级概况、考试统计）
- 考试管理（创建/安排考试）
- 学员管理（查看进度、成绩）
- 错题分析、作业管理

### 管理端

- **多机构 RBAC**（8 种角色）：超级管理员、学校管理员、教师、题库编辑、题库审核、监考、学员、审计。
- **职责分离**：题库编辑不能审核自己提交的题目。
- **题库管理**：练习题库与考试题库独立管理，组卷时从练习库冻结快照到试卷。
- **考试安排**：设置考试时间窗口、关联试卷与班级。
- **成绩管理**：复核（调整分数、通过/不通过标记）→ 发布门禁（发布前学员不可见）。
- **审计日志**：全链路操作留痕，支持分页与过滤查询。
- **报表**：成绩分布、考试通过率、班级对比、薄弱题型分析。
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

- Node.js >= 20（推荐 22+）
- pnpm >= 9（项目强制使用，`preinstall` 脚本会拦截 npm/yarn）
- PostgreSQL 数据库（推荐 Supabase）

### 安装与启动

```bash
# 1. 克隆仓库
git clone https://github.com/douknowai/ai-trainer-exam.git
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
│   │   ├── admin/                  # 管理端页面（19 个模块）
│   │   ├── api/                    # API 路由（46 个端点）
│   │   ├── login/                  # 登录页
│   │   ├── change-password/        # 强制改密页
│   │   ├── student/                # 学员端页面（8 个模块）
│   │   └── teacher/                # 教师端页面（8 个模块）
│   ├── components/                 # 业务组件 + shadcn/ui 组件库
│   │   ├── ui/                     # shadcn/ui（57 个组件）
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
│   │   ├── grading/                # 确定性评分引擎（15 个评分器）
│   │   ├── media/                  # 图片/音频 Provider 适配器
│   │   ├── object-storage.ts       # S3 对象存储
│   │   ├── question-bank.ts        # 题库 CRUD
│   │   └── users.ts                # 用户管理
│   └── storage/
│       └── database/
│           ├── schema.ts           # 数据库 Schema 定义
│           └── supabase-client.ts  # Supabase 客户端（service role）
├── drizzle/                        # 数据库迁移文件
├── scripts/
│   ├── db/                         # 迁移/种子/回归验证脚本
│   ├── build.sh / dev.sh / start.sh # 构建/开发/启动脚本
│   └── quality-gate.mjs            # 质量门禁
├── public/                         # 静态资源（演示素材 SVG/AI 图/TTS 音频）
├── docs/                           # 项目文档（架构/部署/安全/评分/手册/测试）
├── data/raw/                       # 题库源文件（DOCX）
├── .github/workflows/              # CI 质量门禁
├── .env.example                    # 环境变量模板
├── .coze                           # 平台构建与运行配置
├── AGENTS.md                       # AI 开发助手规范
├── DESIGN.md                       # 设计规范
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

| 机制 | 说明 |
|------|------|
| 服务端时间权威 | 开始考试校验 `exam_start_at <= NOW()`，交卷校验 `NOW() <= exam_end_at` |
| 超时自动判级 | 超过考试结束时间自动标记为 `expired` |
| 心跳保活 | 考试进行中定期心跳，检测异常断线 |
| 自动保存 | 定时保存 + 关页 `keepalive` 兜底，防答案丢失 |
| 断线续考 | attempt 幂等，重新进入继续答题 |
| 幂等交卷 | 重复提交不会重复计分 |
| 组卷即冻结 | 题目快照、答案键、素材 checksum、评分器版本固化，改题库不影响已发试卷 |
| 成绩门禁 | 成绩在管理员发布前对学员不可见（三重门禁） |

## 关键安全原则

- 正式考试不读取练习库，不存在回退抽题。
- 客户端不能决定评分器、答案键、分值或及格线。
- 正式评分不调用 LLM、ASR 或图像识别模型——全部确定性计算。
- 试卷快照在组卷时冻结，考试进行中不下发答案与解析。
- service-role 数据库操作必须附带机构范围校验。
- RLS 对 `anon` / `authenticated` 全表拒绝，所有数据访问走 service-role + 应用层鉴权。
- 强制改密由服务端 428 状态码门控保证，不依赖前端自觉。

## 质量检查与回归验证

```bash
pnpm ts-check                # TypeScript 严格检查
pnpm lint:build              # ESLint（静默模式）
pnpm lint:style              # Stylelint
pnpm test                    # 评分器单元测试（Vitest）
pnpm validate                # 完整质量门禁（含构建）

# 端到端回归矩阵（需 dev server 运行在 5000 端口，连接真实数据库）
pnpm tsx scripts/db/verify-api.mts         # 管理/教师端 45 例
pnpm tsx scripts/db/verify-student.mts     # 学员端 19 例
pnpm tsx scripts/db/verify-tasks.mts       # 题库契约 32 例
pnpm tsx scripts/db/verify-exam-flow.mts   # 交卷全链路 21 例
```

验证脚本在共享数据库上遵循严格纪律：临时数据自动清理，真实业务数据零污染。

## 部署

### 生产构建

```bash
pnpm build                   # 执行 scripts/build.sh
pnpm start                   # 执行 scripts/start.sh
```

### CI/CD

项目配置了 GitHub Actions 质量门禁（`.github/workflows/ci.yml`），在 push/PR 时自动运行：

```text
quality-gate → ts-check → lint:build → lint:style → test → build
```

全部通过方可合并。

