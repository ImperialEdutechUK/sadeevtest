import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { loadConfig } from './config.js';

const cfg = loadConfig();

const adapter = new PrismaPg({ connectionString: cfg.DATABASE_URL, max: 10 });

export const prisma = new PrismaClient({
  adapter,
  log: cfg.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export type Db = typeof prisma;
