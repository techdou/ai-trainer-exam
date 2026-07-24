'use client';

import { Card, CardContent } from '@/components/ui/card';
import { BookOpenCheck, HelpCircle, Keyboard, Monitor } from 'lucide-react';

const tips = [
  {
    icon: Monitor,
    title: '如何使用本系统',
    content: '用浏览器打开老师给的网址，输入老师发的账号和密码，点"登录"按钮即可进入系统。',
  },
  {
    icon: BookOpenCheck,
    title: '理论练习怎么做',
    content: '进入"理论练习"，每道题选好答案后点"提交答案"，系统会立刻告诉你对不对。做错的题会自动进"错题本"，方便复习。',
  },
  {
    icon: HelpCircle,
    title: '考试注意事项',
    content: '考试有时间限制，开考后倒计时会显示在页面顶部。请在规定时间内完成所有题目并点"交卷"。一旦交卷不能修改答案。',
  },
  {
    icon: Keyboard,
    title: '遇到问题怎么办',
    content: '如果页面卡住，按 F5 刷新即可。如果忘记密码或登录不上，请举手找老师帮忙，不要自己反复尝试。',
  },
];

export default function HelpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">使用帮助</h1>
      <p className="text-lg text-gray-500 mb-6">第一次用？看看下面这些说明就明白了</p>

      <div className="space-y-4">
        {tips.map((tip, i) => {
          const Icon = tip.icon;
          return (
            <Card key={i}>
              <CardContent className="py-5 flex gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">{tip.title}</h3>
                  <p className="text-base text-gray-600 leading-relaxed">{tip.content}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
