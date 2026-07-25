'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, clearSession } from '@/lib/session-client';
import { KeyRound, Loader2 } from 'lucide-react';

/**
 * 强制改密页: 使用初始密码/被重置密码登录的账号, 改密成功前无法进入任何业务页
 * (服务端 requireUser 返回 428, 本页是唯一放行入口)。
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!currentPassword || !newPassword) {
      setError('请填写当前密码和新密码');
      return;
    }
    if (newPassword.length < 8) {
      setError('新密码至少 8 位');
      return;
    }
    if (newPassword !== confirm) {
      setError('两次输入的新密码不一致');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      if (!res.ok) {
        setError(res.error || '修改失败，请重试');
        return;
      }
      // Supabase 改密后旧 token 立即失效(安全设计), 引导用新密码重新登录。
      clearSession();
      router.replace('/login?changed=1');
    } catch {
      setError('网络连接失败，请检查网络后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4">
            <KeyRound className="w-9 h-9" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold text-foreground">请先设置新密码</h1>
          <p className="text-lg text-muted-foreground mt-1">
            你正在使用老师发放的初始密码，为保障账号安全，首次登录必须修改。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
          <div>
            <label htmlFor="current" className="block text-base font-medium mb-2">当前密码（初始密码）</label>
            <input
              id="current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full h-12 px-4 text-lg rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="请输入老师发的初始密码"
            />
          </div>
          <div>
            <label htmlFor="new" className="block text-base font-medium mb-2">新密码</label>
            <input
              id="new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full h-12 px-4 text-lg rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="至少 8 位"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-base font-medium mb-2">再输入一次新密码</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full h-12 px-4 text-lg rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="请再输入一次"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-base text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 rounded-lg bg-primary text-primary-foreground text-lg font-semibold tracking-wider hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" aria-hidden />}
            {loading ? '正在修改…' : '确认修改并进入系统'}
          </button>

          <button
            type="button"
            onClick={() => { clearSession(); router.replace('/login'); }}
            className="w-full text-sm text-muted-foreground hover:text-foreground"
          >
            返回登录页
          </button>
        </form>
      </div>
    </div>
  );
}
