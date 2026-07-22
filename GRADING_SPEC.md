# GRADING_SPEC.md — 确定性评分引擎规范 v1

## 统一接口

```typescript
interface Grader<TSubmission, TAnswerKey, TResult extends GradingResult> {
  readonly name: string;
  readonly engineVersion: string; // 例 "1.0.0"
  grade(submission: TSubmission, answerKey: TAnswerKey, config: GradingConfig): TResult;
}

interface GradingResult {
  score: number;            // clamp 到 [0, maxScore]
  maxScore: number;
  details: Record<string, unknown>; // 原始指标，入库可审计
}
```

规则：
- 评分器为纯函数，不读 DB/网络/时间/随机数。
- 同一 submission + answerKey + config + engineVersion ⇒ 结果恒定。
- 答案键仅服务端读取；客户端提交的 JSON 不得包含 answerKey。
- 每个评分器单测覆盖：全对/全错/部分对/空提交/非法数据/重复对象/边界阈值。

## 1. SingleChoiceGrader (single_choice@1.0.0)
- 提交：`{ selected: "A" | "B" | "C" | "D" | null }`
- 判定：selected === answerKey.correct → maxScore，否则 0。空提交 0 分。

## 2. TrueFalseGrader (true_false@1.0.0)
- 提交：`{ selected: true | false | null }`（正确/错误）
- 判定：selected === answerKey.correct → maxScore，否则 0。

## 3. SpreadsheetRowDeletionGrader (spreadsheet_row_deletion@1.0.0)
- 提交：`{ remainingRowIds: string[], cellEdits?: Record<string, unknown> }`
- 答案：`{ deleteRowIds: string[], protectedCells?: string[] }`
- 计分：正确删除数 × perCorrect − 漏删数 × perMiss − 误删数 × perFalseDelete − 非法单元格修改数 × perIllegalEdit；clamp [0, max]。
- config 可配置各项分值与是否给部分分（partialCredit，默认 true；false 时全对才给分）。
- details：hit/missed/falseDeleted/illegalEdits 的 row_id 列表。

## 4. VirtualFileClassificationGrader (file_classification@1.0.0)
- 提交：`{ placements: Record<assetId, folderId> }`
- 答案：`{ expected: Record<assetId, folderId> }`
- 计分：每文件放对得 perFile；未放置=错；clamp [0, max]。
- details：correct/misplaced/unplaced 的 asset_id 列表。

## 5. ImageDatasetCleaningGrader (image_dataset_cleaning@1.0.0)
- 提交：`{ deletedAssetIds: string[] }`
- 答案：`{ badAssetIds: string[] }`（如足球混入篮球集）
- 计分：正确删除 × perCorrect − 漏删 × perMiss − 误删 × perFalseDelete；clamp [0, max]。
- 不使用图像识别现场评分，仅比对 asset_id 集合。

## 6. BoundingBoxGrader (bounding_box@1.0.0)
- 提交：`{ boxes: [{ label, x, y, w, h, attributes? }] }`（归一化 0-1）
- 答案：`{ boxes: [{ id, label, x, y, w, h, attributes? }] }`
- 匹配：同类别下按 IoU 贪心最优匹配（按 IoU 降序，一对一，禁止一个预测框匹配多个标准框）。
- 命中：IoU ≥ config.iouThreshold（默认 0.5）。
- 属性题（红绿灯）：几何命中后，属性 red/green 匹配才得属性分；geometryWeight/attributeWeight 可配。
- 计分：命中数 × perHit + 属性正确数 × perAttr − 误标数 × perFalse；漏标按 perMiss 扣（可配）；clamp [0, max]。
- details：匹配对（predIdx, gtId, iou）、类别错误、漏标、误标。

## 7. PointAnnotationGrader (point@1.0.0)
- 命中条件：同类别且归一化欧氏距离 ≤ config.toleranceRatio × 图片对角线(=√2)。
- 贪心一对一匹配（按距离升序）。计分同 BoundingBox。

## 8. PolylineAnnotationGrader (polyline@1.0.0)
- 折线均匀重采样 N=32 点 → 对称 Chamfer Distance（归一化）。
- 命中：chamfer ≤ config.chamferThreshold（默认 0.05）。贪心一对一匹配。

## 9. PolygonAnnotationGrader (polygon@1.0.0)
- 多边形 → 栅格化掩膜（服务端确定网格 R=128）→ IoU。
- 命中：IoU ≥ config.iouThreshold。贪心一对一匹配。

## 10. SentimentLabelGrader (sentiment_label@1.0.0)
- 提交：`{ labels: Record<textItemId, "good" | "neutral" | "bad"> }`
- 逐条精确匹配；每条 perItem；clamp [0, max]。details 含逐条对错。

## 11. AudioTranscriptGrader (audio_transcription@1.0.0)
- 归一化：全角→半角、去标点（可配 keepPunctuation=false）、压缩空白、繁简不处理（题库中文简体）。
- 指标：CER = 编辑距离(字符级) / len(标准答案字符)；必需语气词召回率 fillerRecall（answerKey.requiredFillers 如 ["嗯","啊","哦"]）。
- 计分：cer ≤ fullCreditCER(默认 0.05) → 满分；cer ≥ zeroCreditCER(默认 0.5) → 0；中间线性插值；fillerRecall < 1 时按 config.fillerPenaltyRatio(默认 0.2×缺失比例) 扣减；partialCredit=false 时 cer≤fullCreditCER 且 fillerRecall=1 才给分。
- details：cer, editDistance, missedFillers, 以及练习反馈用 diff 摘要（漏字/多字/错字按对齐结果给出，不含答案原文给考试端）。

## 12. StatisticsSheetGrader (statistics_sheet@1.0.0)
- 提交：`{ cells: Record<cellKey, number | null> }`
- 答案：`{ cells: Record<cellKey, number> }`（目标单元格精确数值）
- 逐格精确匹配（数值相等，容差 config.numericTolerance 默认 0）；每格 perCell；clamp [0, max]。

## 模块分映射（exam_scores）

| 模块字段 | 来源评分器 |
|---|---|
| theory_score | single_choice + true_false |
| cleaning_score | spreadsheet_row_deletion + file_classification + image_dataset_cleaning |
| image_annotation_score | bounding_box + point + polyline + polygon |
| text_annotation_score | sentiment_label |
| audio_score | audio_transcription |
| statistics_score | statistics_sheet |

## 版本管理

- `grading_engine_versions` 表登记每个评分器当前版本。
- 成绩行保存 `engine_version`（聚合快照）与各题 `details.engine_version`。
- 重新评分时可指定版本，结果对比入库，差异须人工确认后才覆盖。
