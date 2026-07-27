'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/session-client';
import { toast } from 'sonner';
import { Settings, Save, Info, Database, Upload } from 'lucide-react';

interface SettingItem {
  key: string;
  label: string;
  value: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: string[];
  description: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/settings');
      if (res.ok && res.data) {
        setSettings((res.data as { settings: SettingItem[] }).settings);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async (key: string, value: string) => {
    setSaving(key);
    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: { key, value },
      });
      if (res.ok) {
        toast.success('保存成功', { description: `${key} 已更新` });
      } else {
        toast.error('保存失败', { description: String(res.error) });
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-lg text-gray-500">
        加载设置...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">系统设置</h1>
          <p className="text-base text-gray-500">管理系统全局配置参数</p>
        </div>
      </div>

      <div className="space-y-4">
        {settings.map(s => (
          <Card key={s.key}>
            <CardContent className="py-5 px-6">
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1 space-y-1">
                  <div className="text-base font-medium">{s.label}</div>
                  <div className="flex items-center gap-1 text-sm text-gray-400">
                    <Info className="w-3.5 h-3.5" />
                    {s.description}
                  </div>
                  <div className="text-xs text-gray-300 mt-1">键名: {s.key}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {s.type === 'boolean' ? (
                    <select
                      value={s.value}
                      onChange={(e) => {
                        const newSettings = settings.map(item =>
                          item.key === s.key ? { ...item, value: e.target.value } : item
                        );
                        setSettings(newSettings);
                      }}
                      className="border rounded-lg px-3 py-2 text-base bg-white"
                    >
                      <option value="true">启用</option>
                      <option value="false">禁用</option>
                    </select>
                  ) : s.type === 'select' && s.options ? (
                    <select
                      value={s.value}
                      onChange={(e) => {
                        const newSettings = settings.map(item =>
                          item.key === s.key ? { ...item, value: e.target.value } : item
                        );
                        setSettings(newSettings);
                      }}
                      className="border rounded-lg px-3 py-2 text-base bg-white"
                    >
                      {s.options.map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type={s.type}
                      value={s.value}
                      onChange={(e) => {
                        const newSettings = settings.map(item =>
                          item.key === s.key ? { ...item, value: e.target.value } : item
                        );
                        setSettings(newSettings);
                      }}
                      className="w-40 text-base"
                    />
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleSave(s.key, s.value)}
                    disabled={saving === s.key}
                  >
                    <Save className="w-4 h-4 mr-1" />
                    {saving === s.key ? '保存中...' : '保存'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 题库管理 */}
      <Card>
        <CardContent className="py-5 px-6">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 space-y-1">
              <div className="text-base font-medium flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                初级理论考试题库
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-400">
                <Info className="w-3.5 h-3.5" />
                一键导入初级理论考试题（50单选题 + 40判断题 + 10填空题，共100题）
              </div>
              <div className="text-sm text-gray-400">
                会清除现有理论题后重新导入，同时写入练习库和考试库。实操题不受影响。
              </div>
            </div>
            <div className="shrink-0">
              <Button
                onClick={async () => {
                  if (!confirm('确认导入初级理论考试题库？\n\n此操作会清除现有理论题并重新导入100题，实操题不受影响。')) return;
                  setSeeding(true);
                  try {
                    const res = await apiFetch('/api/admin/seed-theory', { method: 'POST' });
                    if (res.ok && res.data) {
                      const d = res.data as { deleted?: number; inserted?: number };
                      toast.success('导入成功', {
                        description: `清除旧题 ${d.deleted ?? 0} 条，导入新题 ${d.inserted ?? 0} 条`,
                      });
                    } else {
                      toast.error('导入失败', { description: String(res.error) });
                    }
                  } catch {
                    toast.error('网络错误');
                  } finally {
                    setSeeding(false);
                  }
                }}
                disabled={seeding}
              >
                <Upload className="w-4 h-4 mr-1" />
                {seeding ? '导入中...' : '一键导入理论题'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
