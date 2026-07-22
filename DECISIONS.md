# DECISIONS.md — 工程决策记录

> 按时间倒序记录关键决策，格式：决策 / 理由 / 影响。

## D-001 媒体技能不可调用时采用 Provider Adapter + Mock Provider
- **决策**：`image2-api`（缺 IMAGE_API_KEY）与 `mimo-lecture-audio-skill`（缺 MIMO_API_KEY）当前均无法真实调用。实现 `ImageProvider` / `AudioProvider` 接口，包含 `SkillProvider`（真实调用 python 脚本）与 `MockProvider`（生成确定性占位素材：SVG 图片 / 静音 WAV 元数据）两个实现，按环境变量自动选择。
- **理由**：用户明确要求"技能不可调用时先实现 Provider Adapter、Mock Provider 和管理后台占位流程"。
- **影响**：媒体工坊全流程（任务→审核→发布→冻结）可运行；配置密钥后切换为真实生成，无需改业务代码。

## D-002 DOCX 导入使用 mammoth 文本提取 + 自研解析器
- **决策**：用 `mammoth` 提取纯文本，自研行解析器处理"题号/题干/（A）选项/行尾答案"。
- **理由**：题库脏数据多（缺题号 37、答案行尾带引号 `"C`、判断题 `√/×` 混排、`104-106` 缺小数点），需要专门容错。
- **影响**：导入后一律 `imported_unreviewed` 状态，附质检报告（重复/缺答案/选项异常）。

## D-003 实操工作区为"虚拟工作区"，坐标归一化
- **决策**：Excel/文件管理器/图片网格均为浏览器内虚拟实现；图片标注坐标以原图宽高归一化存储。
- **理由**：浏览器不能任意操作本地文件系统；缩放后像素坐标不可评分。
- **影响**：评分器可基于稳定 row_id/asset_id 与归一化几何做确定性判定。

## D-004 数据访问层：Drizzle 仅定义 schema，CRUD 全走 Supabase SDK
- **决策**：遵循 supabase 技能规范：`schema.ts` 定义表 → `coze-coding-ai db upgrade` 同步 → 运行时用 `@supabase/supabase-js` 读写 → RLS 用 SQL 配置。
- **理由**：平台强制工作流。
- **影响**：所有 CRUD 在 `src/server/db/**`，字段全 snake_case。

## D-005 考试答案隔离：answer_key 仅存服务端专用表
- **决策**：`exam_question_items.answer_key` 等答案字段所在表 RLS 拒绝一切非 service_role 访问；考试 API 序列化时显式剔除答案字段（`stripAnswer`）。
- **理由**：验收标准 15"正式答案和评分阈值不发送到前端"。
- **影响**：即使学员拿到 anon_key 也无法读取答案。

## D-006 组卷随机种子固定 + 每学员题序打乱
- **决策**：试卷生成时保存 `seed`；每学员进入考试时以 `hash(attempt_id, seed)` 确定性打乱题序/选项序。
- **理由**：可重现、可审计，且防邻座抄袭。
- **影响**：同一学员刷新页面题序不变。

## D-007 实操任务实例化
- **决策**：实操题以 `task_template` + 每学员 `task_instance`（含独立初始数据快照）实现；提交保存工作区快照与操作摘要。
- **理由**：满足"实操题按模板生成独立任务实例"与可审计要求。

## D-008 字号与可用性基线
- **决策**：全局默认 16px，学员端实操页 18px；主按钮带图标+中文文字；支持 1366×768。
- **理由**：零基础学员 + 培训机房常见分辨率。

## D-009 Excel 函数（SUM 等）仅限 practice_only
- **决策**：函数类题目模板创建时强制 `practice_only=true`，正式组卷 SQL/服务端双重过滤 `practice_only = false`。
- **理由**：不可违反的业务规则。

## D-010 测试策略：Vitest 单测（评分器/导入器/工具）+ test_run 冒烟 + 关键 E2E 说明
- **决策**：评分器与 DOCX 导入器用 Vitest 覆盖；API 用 test_run curl 冒烟；Playwright E2E 在 Phase 17 补充核心流程。
- **理由**：沙箱内以可重复、快速验证为优先。
