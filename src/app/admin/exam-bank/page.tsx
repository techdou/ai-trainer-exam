'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ShieldCheck, ToggleRight } from 'lucide-react';

interface Question {
  id: string;
  question_type: string;
  stem: string;
  difficulty: number;
  knowledge_point: string;
  review_status: string;
  eligible_for_formal_exam: boolean;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  single_choice: '单选题',
  true_false: '判断题',
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
  pending_review: { label: '待审核', color: 'bg-yellow-50 text-yellow-700' },
  published: { label: '已发布', color: 'bg-green-50 text-green-700' },
  retired: { label: '已下架', color: 'bg-red-50 text-red-700' },
};

export default function ExamBankPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchQuestions = async () => {
    const r = await apiFetch<{ items: Question[]; total: number }>(`/api/admin/questions?bank_type=exam&page=${page}&limit=${pageSize}`);
    if (r.ok && r.data) {
      setQuestions(r.data.items);
      setTotal(r.data.total);
    }
    setLoading(false);
  };

  useEffect(() => { fetchQuestions(); }, [page]);

  if (loading) return <div className="text-center py-12 text-lg text-gray-500">加载中...</div>;

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">考试题库</h1>
          <p className="text-base text-gray-500 mt-1">共 {total} 道考试题</p>
        </div>
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <div className="text-lg text-gray-500">暂无考试题</div>
            <p className="text-base text-gray-400 mt-1">请先在练习题库中审核通过题目，再复制到考试题库</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {questions.map(q => {
            const st = STATUS_LABELS[q.review_status] || { label: q.review_status, color: 'bg-gray-100 text-gray-600' };
            return (
              <Card key={q.id}>
                <CardContent className="py-3 flex items-start gap-3">
                  <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-base line-clamp-2">{q.stem}</div>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <Badge variant="outline">{TYPE_LABELS[q.question_type] || q.question_type}</Badge>
                      <Badge variant="outline">难度 {q.difficulty}</Badge>
                      <Badge variant="outline">{q.knowledge_point}</Badge>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.color}`}>{st.label}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
          <span className="text-base text-gray-600">第 {page} / {totalPages} 页</span>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</Button>
        </div>
      )}
    </div>
  );
}
