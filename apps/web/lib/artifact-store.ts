'use client';

import { cgid, csrfToken } from './api';

/**
 * Artifact tạo khi mất mạng: mã hóa AES-GCM rồi lưu IndexedDB, upload khi có mạng
 * (spec §11 "artifact lưu cục bộ có mã hóa phù hợp"; AUDIT_PHASE1 EDU-4).
 * Dedupe phía server theo `clientArtifactId`.
 */

const DB = 'tiny-artifacts';
const KEYS = 'keys';
const PENDING = 'pending';

interface PendingArtifact {
  cgid: string; // = clientArtifactId gửi server
  sessionCgid: string; // để tìm server session id sau khi sync
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  mime: string;
  filename: string;
  createdAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(KEYS)) d.createObjectStore(KEYS);
      if (!d.objectStoreNames.contains(PENDING)) d.createObjectStore(PENDING, { keyPath: 'cgid' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const r = fn(db.transaction(store, mode).objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

/** Khóa mã hóa cục bộ trên thiết bị (không rời máy). Lưu CryptoKey trực tiếp (structured clone). */
async function deviceKey(): Promise<CryptoKey> {
  const existing = await tx<CryptoKey | undefined>(KEYS, 'readonly', (s) => s.get('device'));
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await tx(KEYS, 'readwrite', (s) => s.put(key, 'device'));
  return key;
}

/** Mã hóa file và xếp hàng chờ upload. Trả cgid (clientArtifactId). */
export async function queueArtifact(sessionCgid: string, file: File): Promise<string> {
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = await file.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const item: PendingArtifact = {
    cgid: cgid('art'),
    sessionCgid,
    iv: iv.buffer,
    ciphertext,
    mime: file.type || 'image/png',
    filename: file.name || 'artifact.png',
    createdAt: new Date().toISOString(),
  };
  await tx(PENDING, 'readwrite', (s) => s.put(item));
  return item.cgid;
}

export async function pendingCount(sessionCgid: string): Promise<number> {
  const all = (await tx<PendingArtifact[]>(PENDING, 'readonly', (s) => s.getAll())) ?? [];
  return all.filter((a) => a.sessionCgid === sessionCgid).length;
}

export interface FlushResult {
  uploaded: number;
  consentBlocked: number;
  stillPending: number;
}

/**
 * Upload các artifact đang chờ. `resolveServerId(sessionCgid)` phải trả server session id
 * (đã sync) hoặc null nếu chưa sync được.
 */
let flushing: Promise<FlushResult> | null = null;

export function flushArtifacts(
  resolveServerId: (sessionCgid: string) => Promise<string | null>,
): Promise<FlushResult> {
  // Chống chạy song song (nhiều listener 'online').
  flushing ??= doFlush(resolveServerId).finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush(
  resolveServerId: (sessionCgid: string) => Promise<string | null>,
): Promise<FlushResult> {
  if (typeof indexedDB === 'undefined') return { uploaded: 0, consentBlocked: 0, stillPending: 0 };
  const all = (await tx<PendingArtifact[]>(PENDING, 'readonly', (s) => s.getAll())) ?? [];
  const key = await deviceKey();
  const res: FlushResult = { uploaded: 0, consentBlocked: 0, stillPending: 0 };

  for (const a of all) {
    const serverId = await resolveServerId(a.sessionCgid);
    if (!serverId) {
      res.stillPending += 1;
      continue;
    }
    let plaintext: ArrayBuffer;
    try {
      plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(a.iv) }, key, a.ciphertext);
    } catch {
      // Không giải mã được (mất khóa) -> bỏ để không kẹt hàng đợi mãi.
      await tx(PENDING, 'readwrite', (s) => s.delete(a.cgid));
      continue;
    }
    const fd = new FormData();
    fd.append('clientArtifactId', a.cgid);
    fd.append('file', new Blob([plaintext], { type: a.mime }), a.filename);
    try {
      const r = await fetch(`/api/sessions/${serverId}/artifacts`, {
        method: 'POST',
        headers: { 'x-csrf-token': csrfToken() },
        body: fd,
      });
      if (r.ok) {
        await tx(PENDING, 'readwrite', (s) => s.delete(a.cgid));
        res.uploaded += 1;
      } else if (r.status === 403) {
        res.consentBlocked += 1; // giữ lại, chờ ba/mẹ bật quyền
      } else {
        res.stillPending += 1;
      }
    } catch {
      res.stillPending += 1;
    }
  }
  return res;
}
