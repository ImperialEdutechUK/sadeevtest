import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['src/**/*.test.ts'], env: { DATABASE_URL: 'postgresql://postgres@127.0.0.1:5432/meeting_review', JWT_SECRET: 'test-secret-test-secret', COOKIE_SECRET: 'test-secret-test-secret' } } });
