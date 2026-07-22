import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/storage/database/shared/schema.ts',
  out: './drizzle',
});
