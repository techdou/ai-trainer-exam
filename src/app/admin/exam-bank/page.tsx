'use client';

import { useState, useEffect, useCallback } from 'react';

interface QuestionItem {
  id: string;
  bank_type: string;
  question_type: string;
  stem: string;
  options: string | Record<string, string> | null;
  answer_key: string;
  difficulty: number;
  review_status: string;
  knowledge_point: string | null;
  practice_only: boolean;
  created_at: string;
}

interface ListData {
  items: QuestionItem[];
  total: number;
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  imported_unreviewed: '待清洗',
  needs_revision: '需修改',
  reviewed: '已审核',
  published: '已发布',
  retired: '已退役',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  imported_unreviewed: 'bg-orange-100 text-orange-800',
  needs_revision: 'bg-red-100 text-red-800',
  reviewed: 'bg-blue-100 text-blue-800',
  published: 'bg-green-100 text-green-800',
  retired: 'bg-gray-200 text-gray-600',
};

export default function QuestionBankPage({
  params,
}: {
  params: { bankType: 'practice-bank' | 'exam-bank' };
}) {
  const bankType = params.bankType === 'exam-bank' ? 'exam' : 'practice';
  const bankLabel = bankType === 'exam' ? '考试库' : '练习库';

  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const pageSize = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      bankType,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (keyword) params.set('keyword', keyword);
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('questionType', typeFilter);

    const res = await fetch(`/api/admin/questions?${params}`);
    const json = await res.json();
    if (json.success) {
      setData(json.data);
    }
    setLoading(false);
  }, [bankType, page, keyword, statusFilter, typeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async (id: string, action: string) => {
    const res = await fetch('/api/admin/questions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    const json = await res.json();
    if (json.success) {
      fetchData();
    } else {
      alert(json.error || '操作失败');
    }
  };

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{bankLabel}管理</h1>
        <a
          href="/admin/import"
          className="rounded-md bg-[oklch(0.45_0.09_175)] px-4 py-2 text-base font-medium text-white hover:brightness-110 transition"
        >
          导入 DOCX
        </a>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-sm text-gray-600 mb-1">搜索关键词</label>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (setPage(1), fetchData())}
            placeholder="搜索题干..."
            className="rounded-md border border-gray-300 px-3 py-2 text-base w-64"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">状态</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-300 px-3 py-2 text-base"
          >
            <option value="">全部状态</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">题型</label>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-300 px-3 py-2 text-base"
          >
            <option value="">全部题型</option>
            <option value="single_choice">单选题</option>
            <option value="true_false">判断题</option>
          </select>
        </div>
        <button
          onClick={() => { setPage(1); fetchData(); }}
          className="rounded-md border border-gray-300 px-4 py-2 text-base hover:bg-gray-50"
        >
          搜索
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-base">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 font-medium text-gray-700">题干</th>
              <th className="px-3 py-3 font-medium text-gray-700 whitespace-nowrap">题型</th>
              <th className="px-3 py-3 font-medium text-gray-700 whitespace-nowrap">难度</th>
              <th className="px-3 py-3 font-medium text-gray-700 whitespace-nowrap">状态</th>
              <th className="px-3 py-3 font-medium text-gray-700 whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">加载中...</td></tr>
            ) : !data || data.items.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-500">暂无题目</td></tr>
            ) : (
              data.items.map((q) => (
                <tr key={q.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 max-w-md">
                    <div className="truncate text-base" title={q.stem}>
                      {q.stem}
                    </div>
                    {q.practice_only && (
                      <span className="text-xs text-orange-600">练习专用</span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-gray-600">
                    {q.question_type === 'single_choice' ? '单选' : '判断'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-gray-600">L{q.difficulty}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`rounded px-2 py-1 text-xs font-medium ${STATUS_COLORS[q.review_status] || 'bg-gray-100'}`}>
                      {STATUS_LABELS[q.review_status] || q.review_status}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex gap-2">
                      {q.review_status === 'imported_unreviewed' && (
                        <>
                          <button
                            onClick={() => handleAction(q.id, 'approve')}
                            className="rounded text-sm px-2 py-1 bg-green-600 text-white hover:bg-green-700"
                          >
                            通过
                          </button>
                          <button
                            onClick={() => handleAction(q.id, 'revise')}
                            className="rounded text-sm px-2 py-1 bg-orange-500 text-white hover:bg-orange-600"
                          >
                            退回修改
                          </button>
                        </>
                      )}
                      {q.review_status === 'reviewed' && (
                        <button
                          onClick={() => handleAction(q.id, 'publish')}
                          className="rounded text-sm px-2 py-1 bg-[oklch(0.45_0.09_175)] text-white hover:brightness-110"
                        >
                          发布
                        </button>
                      )}
                      {q.review_status === 'published' && (
                        <button
                          onClick={() => handleAction(q.id, 'retire')}
                          className="rounded text-sm px-2 py-1 bg-gray-400 text-white hover:bg-gray-500"
                        >
                          退役
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">
            共 {data?.total ?? 0} 条，第 {page}/{totalPages} 页
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              上一页
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
