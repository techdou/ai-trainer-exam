import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 将内部存储的邮箱转为用户可见的"账号"展示。
 * 名册导入的学员邮箱格式为 `{身份证号}@student.exam.local`，
 * 对学员只展示身份证号本身，不暴露邮箱后缀。
 */
export function displayAccount(email: string): string {
  if (email.endsWith('@student.exam.local')) {
    return email.slice(0, -'@student.exam.local'.length).toUpperCase();
  }
  return email;
}
