import { loadConfig } from '../../config.js';
import { LocalStorageProvider } from './local.js';
import { S3StorageProvider } from './s3.js';

export interface PresignedUpload {
  /** URL the browser PUTs the file to. */
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface StorageProvider {
  readonly name: 'local' | 's3';
  presignUpload(key: string, mimeType: string, sizeBytes: number): Promise<PresignedUpload>;
  presignDownload(key: string, fileName: string, mimeType: string): Promise<string>;
  exists(key: string): Promise<boolean>;
  read(key: string): Promise<Buffer>;
  write(key: string, body: Buffer, mimeType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** s3://bucket/key form for AWS services such as Transcribe; null for local storage. */
  s3Uri(key: string): string | null;
}

let instance: StorageProvider | null = null;
export function getStorage(): StorageProvider {
  if (instance) return instance;
  const cfg = loadConfig();
  instance = cfg.STORAGE_PROVIDER === 's3' ? new S3StorageProvider(cfg) : new LocalStorageProvider(cfg);
  return instance;
}
