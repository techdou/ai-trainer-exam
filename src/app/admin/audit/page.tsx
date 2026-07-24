'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/session-client';
import { ScrollText, Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  detail: unknown;
  createdAt: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const actionLabelMap: Record<string, string> = {
  login: '登录',
  logout: '登出',
  create: '创建',
  update: '更新',
  delete: '删除',
  import: '导入',
  submit: '提交',
  grade: '评分',
  publish: '发布',
  start_exam: '开始考试',
  submit_exam: '交卷',
  create_question: '创建题目',
  update_question: '更新题目',
  delete_question: '删除题目',
  create_schedule: '创建考试安排',
  update_schedule: '更新考试安排',
  create_paper: '创建试卷',
  adjust_score: '调整分数',
  publish_results: '发布成绩',
};

const entityLabelMap: Record<string, string> = {
  user: '用户',
  question: '题目',
  exam: '考试',
  schedule: '考试安排',
  paper: '试卷',
  score: '成绩',
  organization: '组织',
  cohort: '班级',
  system: '系统',
};

function getActionLabel(action: string): string {
  return actionLabelMap[action] || action;
}

function getEntityLabel(entityType: string | null): string {
  if (!entityType) return '-';
  return entityLabelMap[entityType] || entityType;
}

function getActionColor(action: string): string {
  if (action.includes('create') || action.includes('import')) return 'bg-green-50 text-green-700';
  if (action.includes('update') || action.includes('adjust')) return 'bg-blue-50 text-blue-700';
  if (action.includes('delete')) return 'bg-red-50 text-red-700';
  if (action.includes('submit') || action.includes('grade') || action.includes('publish')) return 'bg-purple-50 text-purple-700';
  if (action.includes('login') || action.includes('logout')) return 'bg-gray-50 text-gray-700';
  return 'bg-gray-50 text-gray-700';
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterActorId, setFilterActorId] = useState('');

  const loadLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (filterAction) params.set('action', filterAction);
      if (filterActorId) params.set('actorId', filterActorId);

      const res = await apiFetch(`/api/admin/audit-logs?${params.toString()}`);
      if (res.ok && res.data) {
        const d = res.data as { logs: AuditLog[]; pagination: Pagination };
        setLogs(d.logs);
        setPagination(d.pagination);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterActorId]);

  useEffect(() => {
    loadLogs(1);
  }, [loadLogs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ScrollText className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">审计日志</h1>
          <p className="text-base text-gray-500">查看系统关键操作记录</p>
        </div>
      </div>

      {/* 过滤器 */}
      <Card>
        <CardContent className="py-4 px-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                placeholder="操作类型 (如 create, submit)"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="w-56"
              />
            </div>
            <Input
              placeholder="操作人 ID"
              value={filterActorId}
              onChange={(e) => setFilterActorId(e.target.value)}
              className="w-56"
            />
            <Button variant="outline" onClick={() => loadLogs(1)}>
              搜索
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 日志列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            操作记录
            <span className="text-sm font-normal text-gray-400 ml-2">
              共 {pagination.total} 条
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">暂无审计日志</div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="text-left py-2 font-medium">时间</th>
                    <th className="text-left py-2 font-medium">操作人</th>
                    <th className="text-left py-2 font-medium">角色</th>
                    <th className="text-left py-2 font-medium">操作</th>
                    <th className="text-left py-2 font-medium">对象类型</th>
                    <th className="text-left py-2 font-medium">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 text-gray-500 whitespace-nowrap">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString('zh-CN') : '-'}
                      </td>
                      <td className="py-2">{log.actorName}</td>
                      <td className="py-2 text-gray-500">{log.actorRole || '-'}</td>
                      <td className="py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getActionColor(log.action)}`}>
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="py-2 text-gray-600">{getEntityLabel(log.entityType)}</td>
                      <td className="py-2 text-gray-400 max-w-xs truncate">
                        {log.detail && typeof log.detail === 'object' && 'message' in (log.detail as Record<string, unknown>)
                          ? String((log.detail as Record<string, unknown>).message)
                          : log.entityId
                            ? `ID: ${log.entityId.substring(0, 8)}...`
                            : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 分页 */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-gray-500">
                    第 {pagination.page} / {pagination.totalPages} 页
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => loadLogs(pagination.page - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => loadLogs(pagination.page + 1)}
                    >
                      下一页
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
