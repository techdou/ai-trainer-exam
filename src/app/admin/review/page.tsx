'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Question {
  id: string;
  question_type: string;
  stem: string;
  difficulty: number;
  knowledge_point: string;
  review_status: string;
  bank_type: string;
}

const TYPE_LABELS: Record<string, string> = {
  single_choice: '单选题', true_false: '判断题',
  stats_table_fill: '统计填表', excel_delete_rows: 'Excel删行',
  file_classification: '文件分类', image_cleaning: '图片清洗',
  image_annotation: '图片标注', text_sentiment: '情感标注',
  audio_transcription: '音频转写', data_comparison: '数据比对',
  label_consistency: '标注一致性', model_evaluation: '模型评估',
};

export default function ReviewPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = async () => {
    // 导入的题目状态是 imported_unreviewed(服务端从不写 pending_review, 历史上按它过滤队列永远为空);
    // 练习/考试两库分开查再合并, 否则考试题永远不会进入审核队列。
    const [practice, exam] = await Promise.all([
      apiFetch<{ items: Question[] }>(`/api/admin/questions?bank_type=practice&review_status=imported_unreviewed&limit=50`),
      apiFetch<{ items: Question[] }>(`/api/admin/questions?bank_type=exam&review_status=imported_unreviewed&limit=50`),
    ]);
    const items = [
      ...(practice.ok && practice.data ? practice.data.items : []),
      ...(exam.ok && exam.data ? exam.data.items : []),
    ];
    setQuestions(items);
    if (!practice.ok && !exam.ok) toast.error('加载待审核题目失败');
    setLoading(false);
  };

  useEffect(() => { fetchPending(); }, []);

  const handleReview = async (id: string, action: 'approve' | 'reject') => {
    const r = await apiFetch(`/api/admin/questions/${id}`, {
      method: 'PATCH',
      // 后端按题目 id 自动路由实际题库表,无需传 bankType。
      body: { action },
    });
    if (r.ok) {
      toast.success(action === 'approve' ? '已通过审核' : '已驳回');
      fetchPending();
    } else {
      toast.error('操作失败', { description: r.error });
    }
  };

  if (loading) return <div className="text-center py-12 text-lg text-gray-500">加载中...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">题目审核</h1>
      <p className="text-base text-gray-500 mb-6">待审核题目 {questions.length} 道</p>

      {questions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <div className="text-lg text-gray-500">暂无待审核题目</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {questions.map(q => (
            <Card key={q.id}>
              <CardContent className="py-3 flex items-start gap-3">
                <div className="w-10 h-10 rounded bg-yellow-50 flex items-center justify-center shrink-0 mt-0.5">
                  <ClipboardCheck className="w-5 h-5 text-yellow-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base line-clamp-2">{q.stem}</div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <Badge variant="outline">{TYPE_LABELS[q.question_type] || q.question_type}</Badge>
                    <Badge variant="outline">难度 {q.difficulty}</Badge>
                    <Badge variant="outline">{q.knowledge_point}</Badge>
                    <Badge variant="outline">{q.bank_type === 'practice' ? '练习题库' : '考试题库'}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" onClick={() => handleReview(q.id, 'approve')} className="bg-green-600 hover:bg-green-700">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> 通过
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleReview(q.id, 'reject')} className="text-red-600 hover:text-red-700">
                    <XCircle className="w-4 h-4 mr-1" /> 驳回
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
