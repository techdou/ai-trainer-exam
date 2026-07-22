# QUESTION_BANK_GUIDE.md — 题库建设与导入规范

## 题库分离原则

- **练习库**（practice_question_items / practice_task_templates）：学员日常练习，可即时看答案解析。
- **考试库**（exam_question_items / exam_task_templates）：正式考试专用，学员与教师均不可读答案。
- 从练习库发布到考试库：`POST /api/admin/question-bank/publish-to-exam` 创建**全新独立记录**（新 id、published_version=1、来源记录 source_item_id），不共用原记录。

## DOCX 导入格式（兼容现有复习资料）

### 单选题
```
1.题干文本……（）
（A）选项一
（B）选项二
（C）选项三
（D）选项四"C
```
- 答案可位于最后一行行尾：`"C`、`C`、或单独 `答案：C`。
- 题号后分隔符支持 `.` `．` `、` 或缺失（如 `104职业道德的核心是…`）。
- 选项标记支持 `（A）` `(A)` `A.` `A、`。

### 判断题
```
201题干……
（A）正确
（B）错误"B
```
或行尾 `√` / `×`：
```
221.熟练使用Pandas库……至关重要。√
```
- `√`=正确，`×`=错误。

### 容错规则（导入器实现）
1. 全角/半角符号统一；多余空白折叠。
2. 缺题号时按顺序自动编号并记 warning。
3. 题号重复/跳号记 warning，不阻断。
4. 答案缺失/超出 A-D → 该行进 `needs_revision`，质检报告记录。
5. 完全重复（题干规范化哈希相同）→ 标记 duplicate，不重复入库（保留首条）。
6. 近似重复（题干相似度 ≥ 0.9）→ 质检报告列出，人工处理。

## 题目状态机

```text
draft → imported_unreviewed → needs_revision → reviewed → published → retired
```
- 导入后一律 `imported_unreviewed`，禁止直接发布。
- 考试库题目发布必须经 question_reviewer 审核（reviewed）后由 admin 发布。
- `practice_only=true` 的题（如 SUM 函数题）**永远不能**进考试库与正式组卷。

## 质检项（import_jobs.report）

| 检查 | 级别 |
|---|---|
| 完全重复题 | warning（自动跳过） |
| 近似重复题 | warning |
| 答案缺失 | error |
| 答案超出选项范围 | error |
| 选项重复 | warning |
| 解析缺失 | info |
| 法律法规题（题干含"法/条例/劳动法/网络安全法/数据安全法"等） | 自动置 legal_review_required=true |
| 难度/术语标注缺失 | info |

## 字段规范

- knowledge_point：知识点标签（如 数据清洗/数据标注/法律法规/职业道德/系统运维/Excel基础/机器学习基础）。
- difficulty：1(跟做)-5(挑战)，零基础默认 1-2。
- explanation：一句话解析，避免术语堆砌。
- source/source_version：来源文件与版本（如 `五级复习资料.docx@2026-07`）。
