import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "人工智能训练师五级练习与考试系统",
  description:
    "面向职业培训学校的零基础学员，提供人工智能训练师五级理论练习、实操训练与正式考试服务。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
