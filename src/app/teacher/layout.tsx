'use client';

import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  UsersRound,
  ClipboardList,
  TrendingUp,
  PieChart,
  FileText,
  Award,
} from 'lucide-react';
import { RoleLayout } from '@/components/role-layout';

const navItems = [
  { href: '/teacher/dashboard', label: '工作台', icon: LayoutDashboard },
  { href: '/teacher/cohorts', label: '我的班级', icon: UsersRound },
  { href: '/teacher/assignments', label: '练习作业', icon: ClipboardList },
  { href: '/teacher/progress', label: '学习进度', icon: TrendingUp },
  { href: '/teacher/error-analysis', label: '错题分析', icon: PieChart },
  { href: '/teacher/mock-exams', label: '模拟考试', icon: FileText },
  { href: '/teacher/results', label: '成绩查看', icon: Award },
];

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <RoleLayout roles={['teacher']} navItems={navItems} title="教师工作台">
      {children}
    </RoleLayout>
  );
}
