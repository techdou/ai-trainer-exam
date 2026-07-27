process.env.NODE_ENV = 'production';
if (!process.env.PORT && process.env.DEPLOY_RUN_PORT) {
  process.env.PORT = process.env.DEPLOY_RUN_PORT;
}

await import('../dist/server.js');
