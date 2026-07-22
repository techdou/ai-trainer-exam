# PROJECT_PLAN.md — 人工智能训练师五级零基础练习与考试系统

## 项目定位

面向职业培训学校的完整职业培训 Web 应用（非演示原型），服务失业人员、高校毕业生等零基础培训群体。核心目标：让零基础学员通过练习顺利通过"人工智能训练师五级"考试，同时满足财政支持项目的可追踪、可核验、可审计要求。

## 应采用的 Coze 层

**Coze Coding 全栈 Web App**（Next.js App Router + API Routes + Supabase + S3）。不使用普通 Coze Agent 作为业务系统载体。

## 资源调用设计

| 模块 | 资源 | 所在层 | 风险/验证 |
|---|---|---|---|
| 业务数据 CRUD | Supabase PostgreSQL（@supabase/supabase-js） | 服务端 API Routes | schema 迁移 + RLS |
| 用户认证 | Supabase Auth | 服务端 + 客户端会话 | 运行时注入凭据 |
| 文件/图片/音频/导出 | S3 对象存储（S3Storage） | 服务端 | 只存 object_key |
| AI 辅助扩题/错题解释 | LLMClient（coze-coding-dev-sdk） | 服务端 BFF | 流式 SSE |
| 图片素材生成 | image2-api 技能适配器 | 服务端（exec python） | 当前无 IMAGE_API_KEY → Mock |
| 旁白/音频素材 | mimo-lecture-audio-skill 适配器 | 服务端（exec python） | 当前无 MIMO_API_KEY → Mock |
| 正式评分 | 自研确定性评分引擎 | 服务端纯函数 | 版本化 + 单测 |

## 环境审计结论（Phase 0）

| 项目 | 状态 | 说明 |
|---|---|---|
| coze CLI | ✅ 0.0.32 | 可用 |
| Node.js / pnpm | ✅ v24.18.0 / 9.15.9 | 可用 |
| coze-coding-dev-sdk | ✅ 0.7.24 | 已安装 |
| Supabase | ✅ 平台注入 | COZE_SUPABASE_URL/ANON_KEY 运行时注入；SERVICE_ROLE_KEY 可选 |
| S3 对象存储 | ✅ | COZE_BUCKET_* 已注入 |
| image2-api | ⚠️ 未配置 | 无 IMAGE_API_KEY/BASE_URL → Provider Adapter + Mock Provider |
| mimo-lecture-audio-skill | ⚠️ 未配置 | 无 MIMO_API_KEY → Provider Adapter + Mock Provider |
| 理论题库 DOCX | ✅ 已解析 | 约 200 单选 + 约 30 判断；存在重复题、缺题号(37)、答案行尾混排等脏数据 |
| coze-dev-reference.pdf | ✅ 已读取 | SDK 0.7.24 / 12 客户端 / 限制边界已确认 |

## 阶段计划

| 阶段 | 内容 | 状态 |
|---|---|---|
| Phase 0 | 环境、技能、资料审计 | ✅ 完成 |
| Phase 1 | 产品规格与架构（本文档 + ARCHITECTURE.md） | ✅ 完成 |
| Phase 2 | 项目骨架与设计系统 | 进行中 |
| Phase 3 | 认证、组织、班级、权限（RLS） | 待做 |
| Phase 4 | 题库基础设施与 DOCX 导入 | 待做 |
| Phase 5 | 理论练习与理论考试 | 待做 |
| Phase 6 | 虚拟实操工作区基础 | 待做 |
| Phase 7 | Excel 行删除与统计表格 | 待做 |
| Phase 8 | 虚拟文件分类 | 待做 |
| Phase 9 | 错误图片清洗 | 待做 |
| Phase 10 | 图片标注（矩形/点/折线/多边形/红绿灯） | 待做 |
| Phase 11 | 文本标注与音频转写 | 待做 |
| Phase 12 | 媒体素材工坊（两技能适配 + Mock 降级） | 待做 |
| Phase 13 | 考试编排、时间锁、自动交卷 | 待做 |
| Phase 14 | 统一评分、成绩与复核 | 待做 |
| Phase 15 | 教师与管理后台 | 待做 |
| Phase 16 | 零基础教学体验优化 | 待做 |
| Phase 17 | 测试、安全、生产检查 | 待做 |
| Phase 18 | 部署与交付 | 待做 |

## MVP 与分期取舍

- **Must（本次交付）**：认证/RBAC、题库导入与审核、理论练习/考试、全部 6 类实操工作区、12 个确定性评分器、考试编排与服务端时间锁、成绩与审计、练习/考试库完全分离、管理/教师/学员三端、媒体工坊（真实适配器 + Mock 降级）。
- **Should**：错题本、熟练度统计、阈值校准页、报表导出（xlsx）。
- **Later**：Playwright E2E 全量、压测、AI 扩题深度优化。
- **不做**：泄露正式答案给前端的任何"便捷"功能；浏览器直操作本地文件系统。

## 验收清单对照

见 STATUS.md 实时更新与最终 TEST_REPORT.md。
