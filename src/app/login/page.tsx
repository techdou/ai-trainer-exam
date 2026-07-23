'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSession, homeForRoles, type ClientUser } from '@/lib/session-client';
import { BookOpenCheck, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!account.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }
    setLoading(true);
    try {
      // 支持输入"用户名"或完整邮箱：不含 @ 时补全学员伪邮箱域
      const email = account.includes('@') ? account.trim() : `${account.trim()}@student.exam.local`;
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || '账号或密码不正确，请检查后重试。如果忘记密码，请联系老师。');
        return;
      }
      const user = json.data.user as ClientUser;
      saveSession(json.data.accessToken, user);
      router.replace(homeForRoles(user.roles));
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
            <BookOpenCheck className="w-9 h-9" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold text-foreground">人工智能训练师五级</h1>
          <p className="text-lg text-muted-foreground mt-1">练习与考试系统</p>
        </div>

        <form onSubmit={handleLogin} className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
          <div>
            <label htmlFor="account" className="block text-base font-medium mb-2">
              账号
            </label>
            <input
              id="account"
              type="text"
              autoComplete="username"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="w-full h-12 px-4 text-lg rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="请输入老师发的账号"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-base font-medium mb-2">
              密码
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 text-lg rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="请输入密码"
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
            className="w-full h-14 rounded-lg bg-primary text-primary-foreground text-lg font-semibold hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" aria-hidden />}
            {loading ? '正在登录…' : '登 录'}
          </button>

          <p className="text-sm text-muted-foreground text-center">
            第一次使用？账号和初始密码由培训老师发放。
          </p>
        </form>
      </div>
    </div>
  );
}
