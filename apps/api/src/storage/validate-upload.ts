/** Kiểm tra file upload: MIME whitelist + magic bytes + kích thước (SECURITY.md §4, threat T3). */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type ArtifactKind = 'PHOTO' | 'VOICE' | 'TEXT';

interface Rule {
  kind: ArtifactKind;
  ext: string;
  /** Trả true nếu magic bytes khớp. */
  sniff: (b: Buffer) => boolean;
}

const RULES: Record<string, Rule> = {
  'image/png': { kind: 'PHOTO', ext: 'png', sniff: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { kind: 'PHOTO', ext: 'jpg', sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'audio/webm': { kind: 'VOICE', ext: 'webm', sniff: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  'audio/ogg': { kind: 'VOICE', ext: 'ogg', sniff: (b) => b.subarray(0, 4).toString('latin1') === 'OggS' },
  'audio/mpeg': {
    kind: 'VOICE',
    ext: 'mp3',
    sniff: (b) => b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0),
  },
  'text/plain': { kind: 'TEXT', ext: 'txt', sniff: () => true },
};

export interface UploadCheck {
  ok: boolean;
  error?: string;
  kind?: ArtifactKind;
  ext?: string;
  mime?: string;
}

export function checkUpload(mimeType: string, data: Buffer): UploadCheck {
  const mime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const rule = RULES[mime];
  if (!rule) return { ok: false, error: `loại tệp không được phép: ${mime}` };
  if (data.length === 0) return { ok: false, error: 'tệp rỗng' };
  if (data.length > MAX_UPLOAD_BYTES) return { ok: false, error: `tệp vượt ${MAX_UPLOAD_BYTES} byte` };
  if (!rule.sniff(data)) return { ok: false, error: 'nội dung tệp không khớp với loại khai báo' };
  return { ok: true, kind: rule.kind, ext: rule.ext, mime };
}

/** Consent cần có để lưu loại artifact này. */
export function requiredConsentFor(kind: ArtifactKind): string | null {
  if (kind === 'PHOTO') return 'IMAGE_UPLOAD';
  if (kind === 'VOICE') return 'VOICE_RECORDING';
  return null;
}
