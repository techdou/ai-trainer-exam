'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

interface ExamQuestion {
  id: string;
  question_type: string;
  stem: string;
  options: Record<string, string>;
}

export default function ExamTakePage() {
  const params = useParams();
  const router = useRouter();
  const scheduleId = params.scheduleId as string;

  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<{ total: number; correct: number; score: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Fetch exam questions (using practice questions for now as placeholder)
  const fetchQuestions = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/student/practice/questions?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        const qs = data.data.map((q: ExamQuestion & { id: string }) => ({
          id: q.id,
          question_type: q.question_type,
          stem: q.stem,
          options: q.options || {},
        }));
        setQuestions(qs);
        setTimeLeft(qs.length * 2 * 60); // 2 minutes per question
      }
    } catch {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  // Timer countdown
  useEffect(() => {
    if (timeLeft === null || submitted) return;
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(t => (t ?? 0) - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, submitted]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAnswer = (questionId: string, answer: string) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/student/exams/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scheduleId,
          answers: Object.entries(answers).map(([questionId, answer]) => ({
            questionId,
            answer,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResults(data.data);
        setSubmitted(true);
        toast.success('交卷成功', { description: `得分: ${data.data.score}分` });
      } else {
        toast.error('交卷失败', { description: data.error });
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-lg text-gray-500">加载试卷中...</div>;
  }

  // Results view
  if (submitted && results) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center space-y-6">
        <div className="text-6xl font-bold text-primary">{results.score}</div>
        <div className="text-xl text-gray-600">分</div>
        <div className="flex justify-center gap-8 text-base">
          <div>总题数: {results.total}</div>
          <div>答对: {results.correct}</div>
          <div>正确率: {results.total > 0 ? Math.round(results.correct / results.total * 100) : 0}%</div>
        </div>
        <Button size="lg" onClick={() => router.push('/student/exams')} className="text-lg px-8 py-3">
          返回考试列表
        </Button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  if (!currentQ) return <div className="text-center py-12">无题目</div>;

  const answeredCount = Object.keys(answers).length;
  const isTrueFalse = currentQ.question_type === 'true_false';
  const tfOptions = { A: '正确', B: '错误' };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between bg-white border rounded-lg px-6 py-3">
        <div className="text-base font-medium">
          第 {currentIndex + 1} / {questions.length} 题
        </div>
        <div className="text-base">
          已答: {answeredCount} / {questions.length}
        </div>
        {timeLeft !== null && (
          <div className={`text-lg font-mono font-bold ${timeLeft < 300 ? 'text-red-600' : 'text-primary'}`}>
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      {/* Question */}
      <Card>
        <CardContent className="py-8 px-6 space-y-6">
          <p className="text-xl font-medium leading-relaxed">{currentQ.stem}</p>

          <div className="space-y-3">
            {Object.entries(isTrueFalse ? tfOptions : currentQ.options).map(([key, text]) => {
              const isSelected = answers[currentQ.id] === key;
              return (
                <button
                  key={key}
                  onClick={() => handleAnswer(currentQ.id, key)}
                  disabled={submitted}
                  className={`w-full text-left px-6 py-4 rounded-lg border-2 text-lg transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5 font-medium'
                      : 'border-gray-200 hover:border-primary/40 hover:bg-gray-50'
                  }`}
                >
                  <span className="inline-block w-8 font-bold text-primary">{key}.</span>
                  {text}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="lg"
          onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="text-base px-6"
        >
          上一题
        </Button>

        <div className="flex gap-2">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                i === currentIndex
                  ? 'bg-primary text-white'
                  : answers[questions[i].id]
                    ? 'bg-primary/20 text-primary'
                    : 'bg-gray-100 text-gray-500'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {currentIndex < questions.length - 1 ? (
          <Button
            size="lg"
            onClick={() => setCurrentIndex(i => i + 1)}
            className="text-base px-6"
          >
            下一题
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={submitting}
            className="text-base px-6 bg-accent hover:bg-accent/90"
          >
            {submitting ? '交卷中...' : '交卷'}
          </Button>
        )}
      </div>
    </div>
  );
}
