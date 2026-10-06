import { useRef, useState } from 'react';
import { CheckCircle2, FileText, FileVideo, Trash2, UploadCloud } from 'lucide-react';
import { ACCEPTED_EXTENSIONS, FILE_KIND_LABELS, extensionOf, type FileKind } from '@slc/shared';
import { cn } from '@/lib/cn';
import { fmtBytes } from '@/lib/format';
import { ProgressBar } from './Misc';

export interface UploadedFile {
  id: string;
  fileName: string;
  sizeBytes: number;
  status: string;
}

export function Dropzone({
  kind,
  title,
  description,
  file,
  progress,
  error,
  onFile,
  onRemove,
  required,
}: {
  kind: FileKind;
  title: string;
  description: string;
  file: UploadedFile | null;
  progress: number | null;
  error?: string | null;
  onFile: (f: File) => void;
  onRemove?: () => void;
  required?: boolean;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const accept = ACCEPTED_EXTENSIONS[kind].join(',');
  const Icon = kind === 'RECORDING' ? FileVideo : FileText;

  const pick = (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    if (!ACCEPTED_EXTENSIONS[kind].includes(extensionOf(f.name))) {
      alert(`"${f.name}" is not a file type we can read for ${FILE_KIND_LABELS[kind].toLowerCase()}. Accepted: ${ACCEPTED_EXTENSIONS[kind].join(', ')}`);
      return;
    }
    onFile(f);
  };

  if (file && progress === null) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{title}</p>
          <p className="truncate text-sm text-slate-600">
            {file.fileName} &middot; {fmtBytes(file.sizeBytes)}
          </p>
        </div>
        <div className="flex gap-1">
          <button type="button" className="rounded-lg px-2 py-1 text-sm text-brand-700 hover:bg-white" onClick={() => inputRef.current?.click()}>
            Replace
          </button>
          {onRemove && (
            <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-rose-600" onClick={onRemove} aria-label={`Remove ${file.fileName}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={(e) => pick(e.target.files)} />
      </div>
    );
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${title}. Click to choose a file or drag one here.`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
          over ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:border-brand-400 hover:bg-brand-50/40',
          error && 'border-rose-300',
        )}
      >
        {progress !== null ? (
          <div className="w-full max-w-xs">
            <p className="mb-2 text-sm font-medium text-slate-800">Uploading {file?.fileName ?? ''}&hellip; {progress}%</p>
            <ProgressBar value={progress} label="Upload progress" />
            <p className="mt-2 text-xs text-slate-500">Large recordings can take a few minutes. Keep this tab open.</p>
          </div>
        ) : (
          <>
            <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              {over ? <UploadCloud className="h-6 w-6" /> : <Icon className="h-6 w-6" />}
            </span>
            <p className="text-sm font-semibold text-slate-900">
              {title} {required ? <span className="text-rose-600">*</span> : <span className="font-normal text-slate-500">(optional)</span>}
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
            <p className="mt-3 text-xs text-slate-400">Drag a file here or click to choose &middot; {ACCEPTED_EXTENSIONS[kind].join(' ')}</p>
          </>
        )}
      </div>
      {error && (
        <p className="mt-1.5 text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}
      <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={(e) => pick(e.target.files)} />
    </div>
  );
}
