/**
 * 验证脚本共享账号模块 — 从环境变量读取测试账号密码，避免硬编码。
 *
 * 优先级: process.env > .env.local > 抛出提示
 *
 * 在 .env.local 中配置（示例, 请填入真实种子密码）:
 *   VERIFY_ADMIN_PASSWORD=<your-admin-password>
 *   VERIFY_STUDENT_PASSWORD=<your-student-password>
 *   ...
 *
 * 用法:
 *   import { getAccounts } from './_accounts.mjs';
 *   const ACCOUNTS = getAccounts();
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // .env.local 不存在时静默
  }
}

loadEnvLocal();

const EMAIL_MAP = {
  admin: 'admin@exam.local',
  school: 'school@exam.local',
  teacher: 'teacher01@exam.local',
  editor: 'editor01@exam.local',
  reviewer: 'reviewer01@exam.local',
  invigilator: 'invig01@exam.local',
  auditor: 'auditor01@exam.local',
  student: 'stu001@student.exam.local',
  student2: 'stu002@student.exam.local',
};

const ENV_KEY_MAP = {
  admin: 'VERIFY_ADMIN_PASSWORD',
  school: 'VERIFY_SCHOOL_PASSWORD',
  teacher: 'VERIFY_TEACHER_PASSWORD',
  editor: 'VERIFY_EDITOR_PASSWORD',
  reviewer: 'VERIFY_REVIEWER_PASSWORD',
  invigilator: 'VERIFY_INVIGILATOR_PASSWORD',
  auditor: 'VERIFY_AUDITOR_PASSWORD',
  student: 'VERIFY_STUDENT_PASSWORD',
  student2: 'VERIFY_STUDENT2_PASSWORD',
};

/**
 * 获取指定角色的测试账号（email + password）。
 * @param {string} role - 角色名
 * @returns {{ email: string, password: string }}
 */
export function getAccount(role) {
  const email = EMAIL_MAP[role];
  const envKey = ENV_KEY_MAP[role];
  if (!email || !envKey) {
    throw new Error(`未知角色: ${role}。可选: ${Object.keys(EMAIL_MAP).join(', ')}`);
  }
  const password = process.env[envKey];
  if (!password) {
    throw new Error(
      `缺少环境变量 ${envKey}（角色 ${role} 的密码）。请在 .env.local 中配置。`,
    );
  }
  return { email, password };
}

/**
 * 获取多个角色的测试账号。
 * @param {...string} roles
 * @returns {Record<string, { email: string, password: string }>}
 */
export function getAccounts(...roles) {
  const result = {};
  for (const role of roles) {
    result[role] = getAccount(role);
  }
  return result;
}

/**
 * 获取全部测试账号。
 * @returns {Record<string, { email: string, password: string }>}
 */
export function getAllAccounts() {
  return getAccounts(...Object.keys(EMAIL_MAP));
}
