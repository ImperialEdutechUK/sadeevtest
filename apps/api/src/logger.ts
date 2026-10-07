import pino from 'pino';
import { loadConfig } from './config.js';

const cfg = loadConfig();

export const logger = pino({
  level: cfg.LOG_LEVEL,
  ...(cfg.NODE_ENV !== 'production'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
    : {}),
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
