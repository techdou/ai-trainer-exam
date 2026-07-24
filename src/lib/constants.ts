/** 全局常量：角色、任务类型、状态枚举（与 DB CHECK 约束保持一致） */

export const ROLES = [
  'super_admin',
  'school_admin',
  'teacher',
  'question_editor',
  'question_reviewer',
  'invigilator',
  'student',
  'auditor',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: '超级管理员',
  school_admin: '学校管理员',
  teacher: '教师',
  question_editor: '题库编辑员',
  question_reviewer: '题库审核员',
  invigilator: '监考员',
  student: '学员',
  auditor: '审计员',
};

export const TASK_TYPES = [
  'theory',
  'row_deletion',
  'file_classification',
  'image_cleaning',
  'image_annotation',
  'sentiment_label',
  'audio_transcription',
  'statistics_sheet',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  theory: '理论题',
  row_deletion: '数据清洗（表格删行）',
  file_classification: '文件分类',
  image_cleaning: '图片数据清洗',
  image_annotation: '图片标注',
  sentiment_label: '文本情感标注',
  audio_transcription: '音频转写',
  statistics_sheet: '统计填表',
};

export const PRACTICE_MODULES = [
  'computer_basics',
  'theory',
  'data_cleaning',
  'image_annotation',
  'text_annotation',
  'audio_transcription',
  'ops_statistics',
] as const;
export type PracticeModule = (typeof PRACTICE_MODULES)[number];

export const PRACTICE_MODULE_LABELS: Record<PracticeModule, string> = {
  computer_basics: '电脑基础',
  theory: '理论知识',
  data_cleaning: '数据清洗',
  image_annotation: '图片标注',
  text_annotation: '文本标注',
  audio_transcription: '音频转写',
  ops_statistics: '运维统计',
};

export const QUESTION_STATUS = [
  'draft',
  'imported_unreviewed',
  'needs_revision',
  'reviewed',
  'published',
  'retired',
] as const;
export type QuestionStatus = (typeof QUESTION_STATUS)[number];

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  draft: '草稿',
  imported_unreviewed: '待清洗（导入未审）',
  needs_revision: '待修改',
  reviewed: '已审核',
  published: '已发布',
  retired: '已退役',
};

export const EXAM_STATUS = [
  'draft',
  'published',
  'waiting',
  'practice_locked',
  'exam_open',
  'exam_closed',
  'grading',
  'results_pending',
  'results_released',
  'archived',
] as const;
export type ExamStatus = (typeof EXAM_STATUS)[number];

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  draft: '草稿',
  published: '已发布',
  waiting: '待开考',
  practice_locked: '练习已锁定',
  exam_open: '考试进行中',
  exam_closed: '考试已结束',
  grading: '评分中',
  results_pending: '成绩待发布',
  results_released: '成绩已发布',
  archived: '已归档',
};

export const ASSET_KINDS = ['image', 'audio', 'spreadsheet', 'document'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: '入门',
  2: '简单',
  3: '中等',
  4: '较难',
  5: '困难',
};

/** 练习难度阶梯 */
export const PRACTICE_LEVELS = ['L0', 'L1', 'L2', 'L3'] as const;
export type PracticeLevel = (typeof PRACTICE_LEVELS)[number];
export const PRACTICE_LEVEL_LABELS: Record<PracticeLevel, string> = {
  L0: '跟着做（看演示）',
  L1: '有提示练习',
  L2: '独立练习',
  L3: '模拟考试',
};

/** 业务默认时区 */
export const BIZ_TIMEZONE = 'Asia/Shanghai';

/** 标注工具类型 */
export const ANNOTATION_TOOLS = ['bbox', 'point', 'polyline', 'polygon'] as const;
export type AnnotationTool = (typeof ANNOTATION_TOOLS)[number];

/** 情感标注标签 */
export const SENTIMENT_LABELS = ['好评', '中评', '差评'] as const;
export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

/** 评分器版本（每个评分器独立版本号，见 GRADING_SPEC.md） */
export const GRADER_VERSIONS = {
  single_choice: '1.0.0',
  true_false: '1.0.0',
  row_deletion: '1.0.0',
  file_classification: '1.0.0',
  image_cleaning: '1.0.0',
  bbox: '1.0.0',
  point: '1.0.0',
  polyline: '1.0.0',
  polygon: '1.0.0',
  sentiment: '1.0.0',
  audio_transcript: '1.0.0',
  statistics_sheet: '1.0.0',
} as const;
export type GraderKey = keyof typeof GRADER_VERSIONS;
