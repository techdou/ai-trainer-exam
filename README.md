# 人工智能训练师五级练习与考试系统

面向职业培训学校、失业人员、高校毕业生及其他零基础社会学员的完整 Web 培训考试系统。练习库与正式考试库物理分离，覆盖理论题与 13 种实操题型，全部使用确定性评分器自动判分（正式成绩不依赖任何 LLM/网络/随机数）。

## 当前版本

`1.0.0-rc.2`。已经过多轮全角色层深度审核与自动化回归（API 安全、评分正确性、越权、事务、信息泄露、强制改密）。正式上线前仍需在目标环境执行完整安装、迁移、构建与并发验收，详见 `docs/TEST_REPORT.md`。

## 核心能力

- 零基础学员友好界面：大字号、少步骤、温和鼓励式反馈。
- 理论题：单选、判断，即时练习与正式考试。
- 实操题（练习与考试同构，13 种）：
  - 数据清洗：Excel 删行、图片数据清洗、数据集质量体检
  - 图片标注：矩形框（含属性）、点、折线、多边形
  - 文本标注：情感标注、通用图文数据分类
  - 其他：文件分类、音频转写（校验语气助词）、统计填表、综合任务
- 考试安全：服务端时间权威、心跳、自动保存（含关页 keepalive 兜底）、断线续考、幂等交卷。
- 组卷即冻结：题目快照、答案键、素材 checksum、评分器版本全部固化，改题库不影响已发试卷。
- 多机构 RBAC（8 种角色）、职责分离（编辑不能审自己的题）、审计日志、成绩复核与发布门禁。
- 账号安全：初始密码一次性展示、首次登录强制改密（服务端 428 门控 + 改密页闭环）、停用/启用、角色回收事务化。

## 技术栈

Next.js 16 (App Router) · React 19 · TypeScript 5 (strict) · Tailwind CSS 4 · shadcn/ui · Supabase (Postgres + Auth, RLS 全表 deny) · node-pg · Vitest · ExcelJS

## 本地启动

```bash
cp .env.example .env.local   # 填入 Supabase / PGDATABASE_URL 等配置
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed-core            # 生产环境必须先设 SEED_ADMIN_PASSWORD
pnpm db:seed-questions       # 可选: 从 DOCX 导入理论题
pnpm db:seed-tasks           # 实操题种子(练习库+考试库)
pnpm dev                     # http://localhost:5000
```

新建账号的初始密码由加密安全随机数生成，只在创建时输出一次，首次登录强制修改。仓库不包含固定默认密码。

