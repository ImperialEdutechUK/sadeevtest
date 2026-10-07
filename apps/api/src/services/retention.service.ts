import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { logger } from '../logger.js';
import { getStorage } from '../providers/storage/index.js';
import { getSettings } from './settings.service.js';

/**
 * Data minimisation: recordings are deleted after the configured number of
 * days (default 90). Transcripts and reports are kept for the transcript
 * retention period. A setting of 0 disables that sweep.
 */
export async function runRetentionSweep(): Promise<{ recordingsDeleted: number; transcriptsDeleted: number }> {
  const settings = await getSettings();
  const storage = getStorage();
  let recordingsDeleted = 0;
  let transcriptsDeleted = 0;

  if (settings.retentionDaysRecordings > 0) {
    const cutoff = new Date(Date.now() - settings.retentionDaysRecordings * 86_400_000);
    const files = await prisma.meetingFile.findMany({ where: { kind: 'RECORDING', status: { in: ['UPLOADED', 'PROCESSED'] }, createdAt: { lt: cutoff } }, take: 200 });
    for (const f of files) {
      try {
        await storage.delete(f.storageKey);
        await prisma.meetingFile.update({ where: { id: f.id }, data: { status: 'DELETED' } });
        recordingsDeleted++;
      } catch (err) {
        logger.warn({ err, fileId: f.id }, 'retention: could not delete recording');
      }
    }
  }
  if (settings.retentionDaysTranscripts > 0) {
    const cutoff = new Date(Date.now() - settings.retentionDaysTranscripts * 86_400_000);
    const res = await prisma.transcript.deleteMany({ where: { createdAt: { lt: cutoff } } });
    transcriptsDeleted = res.count;
  }
  if (recordingsDeleted || transcriptsDeleted) {
    audit({ action: 'retention.sweep', entityType: 'system', metadata: { recordingsDeleted, transcriptsDeleted } });
  }
  logger.info({ recordingsDeleted, transcriptsDeleted }, 'retention sweep complete');
  return { recordingsDeleted, transcriptsDeleted };
}
