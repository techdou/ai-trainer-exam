-- GoTrue(v2.189) 自带 auth schema 迁移, 但迁移假设 auth schema 已存在(官方全家桶由
-- supabase/postgres 镜像初始化建好, 裁剪版需自建)。此文件必须在首次初始化时执行。
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;
