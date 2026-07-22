# STATUS.md — 项目状态（持续更新）

> 更新时间：Phase 0/1 完成，Phase 2 进行中。

## 已完成

### Phase 0：环境、技能和资料审计 ✅
- coze CLI 0.0.32 / Node 24.18.0 / pnpm 9.15.9 / SDK 0.7.24 验证通过
- `coze-dev-reference.pdf` 已读取（12 客户端、模型列表、限制边界）
- `人工智能训练师五级理论复习资料.docx` 已解析摸底：约 200 道单选 + 约 30 道判断；脏数据清单（缺题号 37、答案行尾混排、重复题、`√×` 混用）已记录
- `image2-api` SKILL.md 已读：无 IMAGE_API_KEY → Mock 降级（D-001）
- `mimo-lecture-audio-skill` SKILL.md 已读：无 MIMO_API_KEY → Mock 降级（D-001）
- 技术能力矩阵与风险清单见 PROJECT_PLAN.md

### Phase 1：产品规格与架构 ✅
- PROJECT_PLAN.md / ARCHITECTURE.md / DECISIONS.md 已建立
- 练习库/考试库分离设计、服务端时间权威、确定性评分、素材冻结策略确定

## 进行中

### Phase 2：项目骨架与设计系统
- Next.js 16 项目已初始化（coze init --template nextjs）
- 依赖已装：zod / exceljs / mammoth / konva / react-konva / vitest
- 待完成：设计系统、登录、布局、角色导航

## 测试结果
- 暂无（Phase 2 起接入 test_run 与 Vitest）

## 遗留问题
1. 两个媒体技能缺 API Key —— Mock Provider 兜底，配置后切真实
2. Supabase SERVICE_ROLE_KEY 是否存在待运行时验证（getSupabaseClient 有多源回退）
3. 题库 DOCX 判断题只到约 230 题（原文档截断）—— 按实际解析结果为准

## 下一阶段
Phase 2 → Phase 3：完成骨架后立即进入数据库 Schema 全量建表 + RLS + 认证。
