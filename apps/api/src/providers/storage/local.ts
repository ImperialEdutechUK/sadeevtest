import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import type { Config } from '../../config.js';
import type { PresignedUpload, StorageProvider } from './index.js';

/**
 * Local-disk storage for development and small on-premise installs.
 * "Presigned" URLs are HMAC-signed links served by the API itself
 * (see routes/uploads.ts), mirroring how S3 presigned URLs behave.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local' as const;
  private root: string;
  constructor(private cfg: Config) {
    this.root = path.resolve(process.cwd(), cfg.LOCAL_STORAGE_DIR);
  }
  private full(key: string): string {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root)) throw new Error('Invalid storage key');
    return p;
  }
  sign(key: string, op: 'put' | 'get', exp: number): string {
    return createHmac('sha256', this.cfg.COOKIE_SECRET).update(`${op}:${key}:${exp}`).digest('base64url');
  }
  verify(key: string, op: 'put' | 'get', exp: number, sig: string): boolean {
    return exp > Date.now() / 1000 && this.sign(key, op, exp) === sig;
  }
  async presignUpload(key: string, mimeType: string): Promise<PresignedUpload> {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const url = `${this.cfg.API_PUBLIC_URL}/api/uploads/put?key=${encodeURIComponent(key)}&exp=${exp}&sig=${this.sign(key, 'put', exp)}`;
    return { uploadUrl: url, method: 'PUT', headers: { 'Content-Type': mimeType }, expiresInSeconds: 3600 };
  }
  async presignDownload(key: string, fileName: string): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + 900;
    return `${this.cfg.API_PUBLIC_URL}/api/uploads/get?key=${encodeURIComponent(key)}&exp=${exp}&sig=${this.sign(key, 'get', exp)}&name=${encodeURIComponent(fileName)}`;
  }
  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.full(key));
      return true;
    } catch {
      return false;
    }
  }
  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.full(key));
  }
  async write(key: string, body: Buffer, _mimeType?: string): Promise<void> {
    const p = this.full(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }
  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.full(key));
    } catch {
      /* already gone */
    }
  }
  s3Uri(): string | null {
    return null;
  }
  pathFor(key: string): string {
    return this.full(key);
  }
}
