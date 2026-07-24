'use client';

import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  Users,
  UsersRound,
  BookOpen,
  ShieldCheck,
  FileUp,
  ClipboardCheck,
  Image,
  SlidersHorizontal,
  FileText,
  CalendarClock,
  MonitorCheck,
  Award,
  ScrollText,
  BarChart3,
  Settings,
} from 'lucide-react';
import { RoleLayout } from '@/components/role-layout';

const navItems = [
  { href: '/admin/dashboard', label: '工作台', icon: LayoutDashboard },
  { href: '/admin/organizations', label: '学校管理', icon: Building2, roles: ['super_admin'] },
  { href: '/admin/projects', label: '培训项目', icon: FolderKanban, roles: ['super_admin', 'school_admin'] },
  { href: '/admin/cohorts', label: '班级管理', icon: UsersRound, roles: ['super_admin', 'school_admin'] },
  { href: '/admin/users', label: '账号管理', icon: Users, roles: ['super_admin', 'school_admin'] },
  { href: '/admin/practice-bank', label: '练习题库', icon: BookOpen, roles: ['super_admin', 'school_admin', 'question_editor', 'question_reviewer'] },
  { href: '/admin/exam-bank', label: '考试题库', icon: ShieldCheck, roles: ['super_admin', 'school_admin', 'question_editor', 'question_reviewer'] },
  { href: '/admin/import', label: '题库导入', icon: FileUp, roles: ['super_admin', 'school_admin', 'question_editor'] },
  { href: '/admin/review', label: '题目审核', icon: ClipboardCheck, roles: ['super_admin', 'school_admin', 'question_reviewer'] },
  { href: '/admin/media-studio', label: '素材工坊', icon: Image, roles: ['super_admin', 'school_admin', 'question_editor'] },
  { href: '/admin/grading-calibration', label: '评分校准', icon: SlidersHorizontal, roles: ['super_admin', 'school_admin'] },
  { href: '/admin/papers', label: '试卷管理', icon: FileText, roles: ['super_admin', 'school_admin'] },
  { href: '/admin/exam-schedules', label: '考务安排', icon: CalendarClock, roles: ['super_admin', 'school_admin'] },
  { href: '/admin/exam-monitor', label: '考试监控', icon: MonitorCheck, roles: ['super_admin', 'school_admin', 'invigilator'] },
  { href: '/admin/results', label: '成绩管理', icon: Award, roles: ['super_admin', 'school_admin', 'invigilator'] },
  { href: '/admin/audit', label: '审计日志', icon: ScrollText, roles: ['super_admin', 'auditor'] },
  { href: '/admin/reports', label: '报表导出', icon: BarChart3, roles: ['super_admin', 'school_admin', 'auditor'] },
  { href: '/admin/settings', label: '系统设置', icon: Settings, roles: ['super_admin'] },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleLayout
      roles={['super_admin', 'school_admin', 'question_editor', 'question_reviewer', 'invigilator', 'auditor']}
      navItems={navItems}
      title="管理后台"
    >
      {children}
    </RoleLayout>
  );
}
