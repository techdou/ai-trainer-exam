'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { BookOpen, Eye, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';

interface Question {
  id: string;
  question_type: string;
  stem: string;
  difficulty: number;
  knowledge_point: string;
  review_status: string;
  practice_only: boolean;
  created_at: string;
}

interface QuestionDetail extends Question {
  options: Record<string, string> | string[] | null;
  answer_key: unknown;
  explanation: string | null;
  organization_id: string | null;
  published_version: number | null;
}

const TYPE_LABELS: Record<string, string> = {
  single_choice: '单选题',
  true_false: '判断题',
  fill_in_blank: '填空题',
  prompt_description: '提示词描述题',
  dialogue_sentiment: '对话情绪判读',
  stats_table_fill: '统计填表',
  excel_delete_rows: 'Excel删行',
  file_classification: '文件分类',
  image_cleaning: '图片清洗',
  image_annotation: '图片标注',
  text_sentiment: '情感标注',
  audio_transcription: '音频转写',
  data_comparison: '数据比对',
  label_consistency: '标注一致性',
  model_evaluation: '模型评估',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-600' },
  imported_unreviewed: { label: '待审核', color: 'bg-yellow-50 text-yellow-700' },
  pending_review: { label: '待审核', color: 'bg-yellow-50 text-yellow-700' },
  reviewed: { label: '审核通过', color: 'bg-blue-50 text-blue-700' },
  needs_revision: { label: '需修改', color: 'bg-orange-50 text-orange-700' },
  published: { label: '已发布', color: 'bg-green-50 text-green-700' },
  retired: { label: '已下架', color: 'bg-red-50 text-red-700' },
};

export default function PracticeBankPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchQuestions = async () => {
    const r = await apiFetch<{ items: Question[]; total: number }>(`/api/admin/questions?bank_type=practice&page=${page}&limit=${pageSize}`);
    if (r.ok && r.data) {
      setQuestions(r.data.items);
      setTotal(r.data.total);
    }
    setLoading(false);
  };

  useEffect(() => { fetchQuestions(); }, [page]);

  const [preview, setPreview] = useState<QuestionDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handlePreview = async (id: string) => {
    setPreviewLoading(true);
    setPreview(null);
    const r = await apiFetch<QuestionDetail>(`/api/admin/questions/${id}`);
    if (r.ok && r.data) setPreview(r.data);
    else toast.error('加载题目详情失败', { description: r.error });
    setPreviewLoading(false);
  };

  const renderAnswer = (d: QuestionDetail | null): string => {
    if (!d) return '-';
    const a = d.answer_key;
    if (typeof a === 'string') return a;
    if (a && typeof a === 'object') return JSON.stringify(a);
    return a == null ? '-' : String(a);
  };

  const renderOptions = (d: QuestionDetail | null) => {
    if (!d) return null;
    const ans = renderAnswer(d);
    if (Array.isArray(d.options)) {
      return d.options.map((t, i) => (
        <div key={i} className={`rounded-md border px-3 py-2 text-sm ${String.fromCharCode(65 + i) === ans ? 'border-green-500 bg-green-50 font-medium' : ''}`}>
          {String.fromCharCode(65 + i)}. {t}
        </div>
      ));
    }
    if (d.options && typeof d.options === 'object') {
      return Object.entries(d.options).map(([k, v]) => (
        <div key={k} className={`rounded-md border px-3 py-2 text-sm ${k === ans ? 'border-green-500 bg-green-50 font-medium' : ''}`}>
          {k}. {v}
        </div>
      ));
    }
    return <div className="text-sm text-gray-500">该题型无选项（判断/描述类）</div>;
  };

  const handleRetire = async (id: string) => {
    const r = await apiFetch(`/api/admin/questions/${id}`, {
      method: 'PATCH',
      // 后端按题目 id 自动路由实际题库表,无需传 bankType。
      body: { action: 'retire' },
    });
    if (r.ok) {
      toast.success('已下架');
      fetchQuestions();
    } else {
      toast.error('操作失败', { description: r.error });
    }
  };

  if (loading) return <div className="text-center py-12 text-lg text-gray-500">加载中...</div>;

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">练习题库</h1>
          <p className="text-base text-gray-500 mt-1">共 {total} 道练习题</p>
        </div>
        <Button onClick={() => { window.location.href = '/admin/import'; }} size="lg" className="text-base">
          导入题目
        </Button>
      </div>

      <div className="space-y-2">
        {questions.map(q => {
          const st = STATUS_LABELS[q.review_status] || { label: q.review_status, color: 'bg-gray-100 text-gray-600' };
          return (
            <Card key={q.id}>
              <CardContent className="py-3 flex items-start gap-3">
                <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base line-clamp-2">{q.stem}</div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <Badge variant="outline">{TYPE_LABELS[q.question_type] || q.question_type}</Badge>
                    <Badge variant="outline">难度 {q.difficulty}</Badge>
                    <Badge variant="outline">{q.knowledge_point}</Badge>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>{st.label}</span>
                    {q.practice_only && <Badge variant="outline" className="text-blue-600">仅练习</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => handlePreview(q.id)} title="预览完整题目">
                    <Eye className="w-4 h-4 mr-1" /> 预览
                  </Button>
                  {q.review_status === 'published' && (
                    <Button variant="ghost" size="sm" onClick={() => handleRetire(q.id)} className="text-orange-600 hover:text-orange-700">
                      <ToggleRight className="w-4 h-4 mr-1" /> 下架
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
          <span className="text-base text-gray-600">第 {page} / {totalPages} 页</span>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</Button>
        </div>
      )}

      <Dialog open={!!preview || previewLoading} onOpenChange={(o) => { if (!o) { setPreview(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>题目详情</DialogTitle>
            <DialogDescription>{preview ? `${TYPE_LABELS[preview.question_type] || preview.question_type} · 难度 ${preview.difficulty} · ${preview.knowledge_point || '无知识点'}` : '加载中...'}</DialogDescription>
          </DialogHeader>
          {previewLoading && <div className="py-8 text-center text-gray-500">加载中...</div>}
          {preview && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-base whitespace-pre-wrap">{preview.stem}</div>
              <div>
                <h3 className="text-sm font-medium mb-2 text-gray-500">选项（正确答案已高亮）</h3>
                <div className="space-y-1.5">{renderOptions(preview)}</div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">答案：</span><span className="font-medium">{renderAnswer(preview)}</span></div>
                <div><span className="text-gray-500">版本：</span>{preview.published_version ?? '-'}</div>
              </div>
              {preview.explanation && (
                <div>
                  <h3 className="text-sm font-medium mb-1 text-gray-500">解析</h3>
                  <div className="rounded-lg border p-3 text-sm whitespace-pre-wrap">{preview.explanation}</div>
                </div>
              )}
              <div className="text-xs text-gray-400 border-t pt-2">
                ID：{preview.id} · 创建于 {new Date(preview.created_at).toLocaleString('zh-CN')}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
