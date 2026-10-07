import type { FileKind } from '@slc/shared';
import { post } from './api';

export interface PresignResponse {
  fileId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
}

/** Upload a file straight to storage (S3 or the local dev store) with progress events. */
export async function uploadMeetingFile(
  meetingId: string,
  kind: FileKind,
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ id: string; fileName: string; status: string; sizeBytes: number; kind: FileKind }> {
  const presign = await post<PresignResponse>(`/meetings/${meetingId}/files/presign`, {
    kind,
    fileName: file.name,
    mimeType: file.type || undefined,
    sizeBytes: file.size,
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(presign.method, presign.uploadUrl, true);
    for (const [k, v] of Object.entries(presign.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}). Please try again.`)));
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.send(file);
  });
  onProgress(100);
  return post(`/meetings/${meetingId}/files/${presign.fileId}/complete`);
}
