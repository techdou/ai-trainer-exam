// ai-trainer-exam PM2 配置（gpu-box 部署，2026-09-27 自广州迁移）
// 链路：PM2 → node scripts/start.mjs → next（PORT=18702 仅本机）
// 数据栈独立 compose：deploy/selfhosted（网关 18100 / db 25433 / minio 19000）
module.exports = {
  apps: [
    {
      name: "ai-exam",
      cwd: __dirname,
      script: "pnpm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 18702,
        HOSTNAME: "127.0.0.1",
      },
      max_memory_restart: "1G",
      kill_timeout: 5000,
      merge_logs: true,
      out_file: __dirname + "/.logs/pm2-out.log",
      error_file: __dirname + "/.logs/pm2-error.log",
      time: true,
    },
  ],
};
