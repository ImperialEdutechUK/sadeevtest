import type { Settings } from '@slc/shared';
import { loadConfig } from '../config.js';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';

const DEFAULTS = (): Settings => {
  const cfg = loadConfig();
  return {
    collegeName: 'South London College',
    llmModel: cfg.OPENROUTER_MODEL,
    retentionDaysRecordings: 90,
    retentionDaysTranscripts: 730,
    redactLearnerNames: false,
    allowTutorSelfUpload: true,
    emailNotifications: true,
    transcriptionLanguage: cfg.TRANSCRIBE_LANGUAGE,
  };
};

let cache: { value: Settings; at: number } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 15_000) return cache.value;
  const row = await prisma.setting.findUnique({ where: { key: 'app' } });
  const value = { ...DEFAULTS(), ...((row?.value as Partial<Settings>) ?? {}) };
  cache = { value, at: Date.now() };
  return value;
}

export async function updateSettings(actorId: string, patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await prisma.setting.upsert({ where: { key: 'app' }, create: { key: 'app', value: next }, update: { value: next } });
  cache = null;
  audit({ actorId, action: 'settings.updated', entityType: 'setting', entityId: 'app', metadata: patch as Record<string, unknown> });
  return next;
}
