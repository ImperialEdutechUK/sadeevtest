import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(5).default(30),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).default(14),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('storage'),
  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default('eu-west-2'),
  S3_ENDPOINT: z.string().default(''),
  S3_FORCE_PATH_STYLE: bool.default(false),

  TRANSCRIPTION_PROVIDER: z.enum(['aws', 'mock']).default('mock'),
  TRANSCRIBE_REGION: z.string().default('eu-west-2'),
  TRANSCRIBE_LANGUAGE: z.string().default('en-GB'),
  TRANSCRIBE_MAX_SPEAKERS: z.coerce.number().int().min(2).max(10).default(4),

  LLM_PROVIDER: z.enum(['openrouter', 'mock']).default('mock'),
  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: z.string().default('anthropic/claude-sonnet-5.5'),
  OPENROUTER_FALLBACK_MODEL: z.string().default(''),
  LLM_TIMEOUT_MS: z.coerce.number().int().default(180_000),

  EMAIL_PROVIDER: z.enum(['ses', 'none']).default('none'),
  SES_REGION: z.string().default('eu-west-2'),
  EMAIL_FROM: z.string().default('Meeting Review <no-reply@example.ac.uk>'),

  SEED_ADMIN_EMAIL: z.string().default('admin@example.ac.uk'),
  SEED_ADMIN_PASSWORD: z.string().default('ChangeMe-2026!'),
  SEED_DEMO_DATA: bool.default(true),

  RUN_WORKER_IN_API: bool.default(true),

  // Background job transport: pg-boss (PostgreSQL, long-running processes) or SQS (serverless / Lambda)
  JOB_QUEUE: z.enum(['pgboss', 'sqs']).default('pgboss'),
  SQS_QUEUE_URL: z.string().default(''),
  SQS_REGION: z.string().default('eu-west-2'),
  RUN_MIGRATIONS_ON_START: bool.default(false),
  TRUST_PROXY: bool.default(true),
  // When set, every request must carry this value in the X-Origin-Verify header (added by CloudFront), so the
  // origin cannot be reached directly. Leave empty for local development.
  ORIGIN_VERIFY_SECRET: z.string().default(''),
});

export type Config = z.infer<typeof EnvSchema>;

let cached: Config | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee apps/api/.env.example`);
  }
  const cfg = parsed.data;
  if (cfg.STORAGE_PROVIDER === 's3' && !cfg.S3_BUCKET) throw new Error('S3_BUCKET is required when STORAGE_PROVIDER=s3');
  if (cfg.TRANSCRIPTION_PROVIDER === 'aws' && cfg.STORAGE_PROVIDER !== 's3')
    throw new Error('TRANSCRIPTION_PROVIDER=aws requires STORAGE_PROVIDER=s3 (Amazon Transcribe reads from S3)');
  if (cfg.JOB_QUEUE === 'sqs' && !cfg.SQS_QUEUE_URL) throw new Error('SQS_QUEUE_URL is required when JOB_QUEUE=sqs');
  if (cfg.LLM_PROVIDER === 'openrouter' && !cfg.OPENROUTER_API_KEY)
    throw new Error('OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter');
  cached = cfg;
  return cfg;
}

export const isProd = () => loadConfig().NODE_ENV === 'production';
