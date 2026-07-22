# ARCHITECTURE.md — 系统架构

## 总体架构

```text
学员端 / 教师端 / 管理端 (Next.js App Router, React 19, Tailwind 4, shadcn/ui)
  -> API Routes (服务端, Zod 校验, RBAC 鉴权)
    -> Supabase Auth + PostgreSQL (RLS 行级安全)
    -> S3 对象存储 (object_key 持久化, 签名 URL 动态生成)
    -> 确定性评分引擎 (src/server/graders, 纯函数, 版本化)
    -> 媒体生成适配器 (src/server/media)
       -> image2-api 技能 (python scripts) — 未配置时 Mock
       -> mimo-lecture-audio-skill (python scripts) — 未配置时 Mock
    -> LLMClient (仅 AI 辅助扩题/练习错题解释, 不参与正式评分)
```

## 目录结构

```
src/
├── app/                          # 页面路由
│   ├── (auth)/login/             # 登录
│   ├── student/                  # 学员端
│   ├── teacher/                  # 教师端
│   ├── admin/                    # 管理端
│   └── api/                      # API Routes
│       ├── practice/             # 练习库 API (独立)
│       ├── exam/                 # 考试库 API (独立, 不下发答案)
│       ├── admin/                # 管理 API
│       ├── media/                # 媒体工坊 API
│       └── grading/              # 评分 API
├── components/                   # UI 组件 (shadcn/ui + 业务组件)
│   ├── workbench/                # 实操工作区组件
│   └── ui/                       # shadcn 基础组件
├── lib/                          # 共享工具
└── server/                       # 服务端专属 (禁止前端导入)
    ├── auth/                     # 会话与角色解析
    ├── db/                       # Supabase 客户端 + 数据访问层
    ├── graders/                  # 确定性评分引擎 (12 个评分器)
    ├── media/                    # 媒体技能适配器
    ├── storage/                  # S3 封装
    ├── audit/                    # 审计日志
    └── import/                   # DOCX 导入器
```

## 关键架构决策

### 1. 练习库与考试库完全分离
- 独立数据表：`practice_question_items` / `exam_question_items`（及 task/asset/paper 系列）
- 独立 API 前缀：`/api/practice/*` / `/api/exam/*`
- 独立 S3 前缀：`practice/` / `exam/`
- 练习→考试复制走"发布为考试题"流程，生成全新 ID 与版本
- 考试库 API 响应中**绝不包含** answer_key / grading 阈值 / 标准标注

### 2. 服务端时间权威
- 所有时间判断（练习锁定、考试开关、交卷）以 `exam_schedules` + 数据库当前时间为准
- 前端倒计时仅显示，每次心跳由服务端校准
- `GET /api/exam/schedule/[id]/status` 返回服务端时间与状态机状态

### 3. 确定性评分
- 12 个评分器均为纯函数 `(submission, answerKey, config) => GradingResult`
- 每个评分器有 `engine_version`；评分结果连同版本入库
- 同一提交 + 同一版本 ⇒ 分数恒定（有回归单测保证）
- LLM 不参与正式评分

### 4. 虚拟文件工作区
- 文件分类/删除在浏览器内虚拟工作区完成（React 状态模拟 Windows 资源管理器最小子集）
- 不使用 File System Access API 作为核心方案

### 5. 媒体素材冻结
- 素材生命周期：generated → reviewing → approved → published(冻结, checksum)
- 发布后不可原位覆盖，只能产生新 asset_version
- 正式考试运行期零实时生成调用

## 安全模型

- 前端无密钥；`coze-coding-dev-sdk`、service_role、S3 客户端仅在 `src/server/**`
- RLS：学员只见自己的数据；教师限授权班级；答案相关表仅 service_role 可读
- 所有写操作 API 先做 Zod 校验 + 角色校验 + 审计日志
- 成绩人工调整必须带 reason，记录 original/adjusted/final

## 性能与限制（来自环境审计）

- 沙箱 4C/8G/10G 无 GPU → 不跑本地推理
- Supabase 免费版 500MB → 大对象全部走 S3，DB 只存 key 与元数据
- 不承诺未压测的高并发；交付时附实测结果与已知限制
