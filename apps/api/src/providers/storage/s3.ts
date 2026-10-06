import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from '../../config.js';
import type { PresignedUpload, StorageProvider } from './index.js';

export class S3StorageProvider implements StorageProvider {
  readonly name = 's3' as const;
  private client: S3Client;
  private bucket: string;
  constructor(cfg: Config) {
    this.bucket = cfg.S3_BUCKET;
    this.client = new S3Client({
      region: cfg.S3_REGION,
      ...(cfg.S3_ENDPOINT ? { endpoint: cfg.S3_ENDPOINT } : {}),
      forcePathStyle: cfg.S3_FORCE_PATH_STYLE,
    });
  }
  async presignUpload(key: string, mimeType: string): Promise<PresignedUpload> {
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: 3600 });
    return { uploadUrl: url, method: 'PUT', headers: { 'Content-Type': mimeType }, expiresInSeconds: 3600 };
  }
  async presignDownload(key: string, fileName: string, mimeType: string): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
      ResponseContentType: mimeType,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: 900 });
  }
  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
  async read(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  async write(key: string, body: Buffer, mimeType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: mimeType }));
  }
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  s3Uri(key: string): string {
    return `s3://${this.bucket}/${key}`;
  }
}
