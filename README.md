# 人工智能训练师五级练习与考试系统

面向职业培训学校、失业人员、高校毕业生及其他零基础社会学员的完整 Web 培训考试系统。系统严格分离练习库和正式考试库，覆盖理论题、数据清洗、文件分类、错误图片清理、图片框/点/线/多边形标注、文本情感标注、音频转写和运维统计填表，并使用确定性评分器自动判分。

## 当前版本

`1.0.0-rc.2`。本版本针对生产审计中发现的认证、评分绕过、题库隔离、越权、交卷事务、成绩发布、评分算法和种子数据问题进行了系统重构。正式上线前仍必须在目标 Coze/Supabase/S3 环境执行完整安装、迁移、构建、E2E 和并发验收，详见 `docs/TEST_REPORT.md`。

## 核心能力

- 零基础学员友好界面，大字号、少步骤、清晰反馈。
- 理论单选题、判断题即时练习和正式考试。
- Excel 删除错误行、中文/英文文件分类、篮球图片集中删除足球图片。
- 矩形框、点、折线、多边形及红绿灯状态标注。
- 好评/中评/差评文本标注。
- 音频转写，强制校验“嗯、啊、哦”等指定语气助词。
- 运维统计表自动判分。
- 服务端练习锁定、考试开放、截止时间、心跳、自动保存、断线恢复和幂等交卷。
- 试卷、答案、素材和评分器版本冻结。
- 多机构 RBAC、审计日志、成绩复核和发布。
- image2-api 与 mimo-lecture-audio-skill 优先适配，Coze SDK 作为可配置降级 Provider。

## 技术栈

Next.js 16、React 19、TypeScript、Supabase/PostgreSQL、S3 兼容对象存储、Coze Coding SDK、Vitest。

## 本地启动

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed-core
pnpm db:seed-tasks
pnpm dev
```

生产环境运行 `seed-core` 时必须设置 `SEED_ADMIN_PASSWORD`。其他新建账号密码由加密安全随机数生成，只在首次创建时输出，并强制首次登录修改。仓库不包含固定默认密码。

## 质量检查

```bash
pnpm quality:offline
pnpm ts-check
pnpm lint:build
pnpm lint:style
pnpm test
pnpm build
```

完整质量门禁：

```bash
pnpm validate
```

## 目录

```text
src/app/                    学员端、教师端、管理端及 API
src/server/grading/         确定性评分引擎
src/server/media/           图片和音频 Provider 适配器
src/components/             实操与通用界面组件
drizzle/                    数据库迁移
scripts/db/                 迁移和安全种子脚本
public/training/            可离线使用的演示素材
docs/                       架构、部署、安全、评分、操作手册和测试报告
.github/workflows/           CI 质量门禁
```

## 关键安全原则

- 正式考试不读取练习库，不存在回退抽题。
- 客户端不能决定评分器、答案键、分值或及格线。
- 正式评分不调用 LLM、ASR 或图像识别模型。
- 所有考试题、答案、素材 checksum 和评分器版本在组卷时冻结。
- 成绩在管理员发布前不返回给学员。
- service-role 数据库操作必须附带机构范围校验。
- 媒体文件数据库只保存 object key，访问时由受保护接口读取。

## 文档

- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/SECURITY.md`
- `docs/GRADING_SPEC.md`
- `docs/QUESTION_BANK_GUIDE.md`
- `docs/USER_MANUAL_STUDENT.md`
- `docs/USER_MANUAL_ADMIN.md`
- `docs/TEST_REPORT.md`
- `docs/FIX_REPORT.md`
