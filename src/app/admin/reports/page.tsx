'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiFetch, getToken } from '@/lib/session-client';
import { toast } from 'sonner';
import {
  BarChart3,
  Users,
  Trophy,
  TrendingUp,
  FileCheck,
  BookOpen,
  Download,
} from 'lucide-react';

/**
 * 报表导出为二进制流, apiFetch 只处理 JSON, 这里单独走 fetch+Blob。
 * 从 Content-Disposition 里解析服务端给的文件名。
 */
async function downloadReport(type: 'scores' | 'progress', format: 'csv' | 'xlsx'): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api/admin/reports/export?type=${type}&format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || `导出失败(${res.status})`);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
  const filename = match ? decodeURIComponent(match[1]) : `报表.${format}`;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ScoreDistribution {
  range: string;
  count: number;
}

interface ExamPassRate {
  scheduleId: string;
  scheduleTitle: string;
  totalTakers: number;
  passedCount: number;
  avgScore: number;
  passRate: number;
}

interface CohortPerformance {
  cohortId: string;
  cohortName: string;
  studentCount: number;
  avgScore: number;
  passRate: number;
}

interface PracticeWeakArea {
  itemType: string;
  totalWrong: number;
  affectedUsers: number;
}

interface RecentActivity {
  user_name: string;
  action: string;
  detail: string;
  created_at: string;
}

interface ReportData {
  scoreDistribution: ScoreDistribution[];
  examPassRate: ExamPassRate[];
  cohortPerformance: CohortPerformance[];
  practiceWeakAreas: PracticeWeakArea[];
  recentActivity: RecentActivity[];
  overallStats: Record<string, string>;
}

const typeNameMap: Record<string, string> = {
  single_choice: '单选题',
  true_false: '判断题',
  fill_in_blank: '填空题',
  prompt_description: '提示词描述题',
  dialogue_sentiment: '对话情绪判读',
  excel_delete_rows: 'Excel删除行',
  stats_table_fill: '统计表填写',
  file_classification: '文件分类',
  image_cleaning: '图片清洗',
  image_annotation: '图片标注',
  text_sentiment: '文本情感',
  audio_transcription: '音频转写',
  data_comparison: '数据比对',
  label_consistency: '标注一致性',
  model_evaluation: '模型评估',
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5 px-5">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-6 h-6 text-primary" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-gray-500">{label}</div>
          {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = async (type: 'scores' | 'progress', format: 'csv' | 'xlsx') => {
    const key = `${type}-${format}`;
    setExporting(key);
    try {
      await downloadReport(type, format);
      toast.success('导出成功，文件已开始下载');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch('/api/admin/reports/overview');
        if (res.ok && res.data) {
          setData(res.data as ReportData);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-lg text-gray-500">
        加载报表数据...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-lg text-gray-500">
        暂无报表数据
      </div>
    );
  }

  const stats = data.overallStats || {};
  const maxDistCount = Math.max(...data.scoreDistribution.map(d => d.count), 1);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">数据报表与分析</h1>

      {/* 报表导出 */}
      <Card>
        <CardContent className="py-4 px-6 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-gray-400" />
            <span className="font-medium">报表导出</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">成绩明细</span>
            <Button variant="outline" size="sm" disabled={exporting !== null}
              onClick={() => handleExport('scores', 'csv')}>
              {exporting === 'scores-csv' ? '导出中…' : 'CSV'}
            </Button>
            <Button variant="outline" size="sm" disabled={exporting !== null}
              onClick={() => handleExport('scores', 'xlsx')}>
              {exporting === 'scores-xlsx' ? '导出中…' : 'Excel'}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">学员练习进度</span>
            <Button variant="outline" size="sm" disabled={exporting !== null}
              onClick={() => handleExport('progress', 'csv')}>
              {exporting === 'progress-csv' ? '导出中…' : 'CSV'}
            </Button>
            <Button variant="outline" size="sm" disabled={exporting !== null}
              onClick={() => handleExport('progress', 'xlsx')}>
              {exporting === 'progress-xlsx' ? '导出中…' : 'Excel'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 概览统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FileCheck}
          label="考试安排"
          value={stats.total_exams || '0'}
          sub="已创建的考试"
        />
        <StatCard
          icon={Users}
          label="参考人次"
          value={stats.total_attempts || '0'}
          sub="累计参加考试"
        />
        <StatCard
          icon={Trophy}
          label="通过人次"
          value={stats.total_passed || '0'}
          sub="成绩达标"
        />
        <StatCard
          icon={TrendingUp}
          label="平均分"
          value={stats.avg_score ? Math.round(Number(stats.avg_score) * 10) / 10 : '0'}
          sub="所有考试"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 成绩分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              成绩分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.scoreDistribution.length === 0 ? (
              <div className="text-center py-8 text-gray-400">暂无成绩数据</div>
            ) : (
              <div className="space-y-3">
                {data.scoreDistribution.map(d => (
                  <div key={d.range} className="flex items-center gap-3">
                    <div className="w-16 text-sm text-right text-gray-600 shrink-0">{d.range}分</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/70 flex items-center justify-end pr-2 transition-all"
                        style={{ width: `${Math.max((d.count / maxDistCount) * 100, 8)}%` }}
                      >
                        <span className="text-xs text-white font-medium">{d.count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 考试通过率 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              考试通过率
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.examPassRate.length === 0 ? (
              <div className="text-center py-8 text-gray-400">暂无考试数据</div>
            ) : (
              <div className="space-y-3">
                {data.examPassRate.map(e => (
                  <div key={e.scheduleId} className="border rounded-lg p-3 space-y-1">
                    <div className="text-sm font-medium truncate">{e.scheduleTitle}</div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>参考 {e.totalTakers} 人</span>
                      <span>通过 {e.passedCount} 人</span>
                      <span>均分 {Math.round(e.avgScore)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${e.passRate}%`,
                            backgroundColor: e.passRate >= 80 ? '#22c55e' : e.passRate >= 60 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">{e.passRate}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 班级成绩对比 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              班级成绩对比
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.cohortPerformance.length === 0 ? (
              <div className="text-center py-8 text-gray-400">暂无班级数据</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="text-left py-2 font-medium">班级</th>
                    <th className="text-right py-2 font-medium">人数</th>
                    <th className="text-right py-2 font-medium">均分</th>
                    <th className="text-right py-2 font-medium">通过率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cohortPerformance.map(c => (
                    <tr key={c.cohortId} className="border-b last:border-0">
                      <td className="py-2">{c.cohortName}</td>
                      <td className="text-right py-2">{c.studentCount}</td>
                      <td className="text-right py-2">{c.avgScore}</td>
                      <td className="text-right py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          c.passRate >= 80 ? 'bg-green-50 text-green-700' :
                          c.passRate >= 60 ? 'bg-yellow-50 text-yellow-700' :
                          'bg-red-50 text-red-700'
                        }`}>
                          {c.passRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* 练习题薄弱题型 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              练习题薄弱题型
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.practiceWeakAreas.length === 0 ? (
              <div className="text-center py-8 text-gray-400">暂无练习错题数据</div>
            ) : (
              <div className="space-y-3">
                {data.practiceWeakAreas.map(p => {
                  const label = typeNameMap[p.itemType] || p.itemType;
                  const maxWrong = Math.max(...data.practiceWeakAreas.map(w => w.totalWrong), 1);
                  return (
                    <div key={p.itemType} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{label}</span>
                        <span className="text-gray-500">
                          {p.totalWrong} 次错误 / {p.affectedUsers} 人受影响
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-red-400/70 transition-all"
                            style={{ width: `${Math.max((p.totalWrong / maxWrong) * 100, 5)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 最近考试活动 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">最近考试活动</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentActivity.length === 0 ? (
            <div className="text-center py-8 text-gray-400">暂无活动记录</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="text-left py-2 font-medium">学员</th>
                  <th className="text-left py-2 font-medium">操作</th>
                  <th className="text-left py-2 font-medium">详情</th>
                  <th className="text-right py-2 font-medium">时间</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.map((a, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2">{a.user_name}</td>
                    <td className="py-2">
                      <span className="inline-block px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
                        {a.action}
                      </span>
                    </td>
                    <td className="py-2 text-gray-600">{a.detail}</td>
                    <td className="py-2 text-right text-gray-400">
                      {a.created_at ? new Date(a.created_at).toLocaleString('zh-CN') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
