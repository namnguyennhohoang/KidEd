import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AppConfig } from '../config.js';
import { resolveFromRepoRoot } from '../paths.js';

/** Cổng lưu trữ artifact. Dev: filesystem. Production: S3-compatible. */
export interface StoragePort {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class FilesystemStorage implements StoragePort {
  constructor(private readonly baseDir: string) {}

  private path(key: string): string {
    // key được sanitize ở nơi tạo (chỉ [a-zA-Z0-9_/.-]).
    return join(this.baseDir, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.path(key)).catch(() => undefined);
  }
}

/** AWS SDK nạp động — không nằm trên đường chạy dev/test (SDK rất nặng). */
class S3Storage implements StoragePort {
  private clientP?: Promise<{
    send: (cmd: unknown) => Promise<{ Body?: { transformToByteArray(): Promise<Uint8Array> } }>;
    Put: (i: object) => unknown;
    Get: (i: object) => unknown;
    Del: (i: object) => unknown;
  }>;

  constructor(
    private readonly bucket: string,
    private readonly endpoint: string,
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
  ) {}

  private lib() {
    this.clientP ??= import('@aws-sdk/client-s3').then((m) => {
      const client = new m.S3Client({
        region: 'auto',
        forcePathStyle: !!this.endpoint,
        credentials: { accessKeyId: this.accessKeyId, secretAccessKey: this.secretAccessKey },
        ...(this.endpoint ? { endpoint: this.endpoint } : {}),
      });
      return {
        send: (cmd: unknown) => client.send(cmd as never) as never,
        Put: (i: object) => new m.PutObjectCommand(i as never),
        Get: (i: object) => new m.GetObjectCommand(i as never),
        Del: (i: object) => new m.DeleteObjectCommand(i as never),
      };
    });
    return this.clientP;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const s3 = await this.lib();
    await s3.send(s3.Put({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }));
  }

  async get(key: string): Promise<Buffer> {
    const s3 = await this.lib();
    const res = await s3.send(s3.Get({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    const s3 = await this.lib();
    await s3.send(s3.Del({ Bucket: this.bucket, Key: key }));
  }
}

export function createStorage(config: AppConfig): StoragePort {
  if (config.STORAGE_DRIVER === 's3') {
    if (!config.S3_BUCKET || !config.S3_ACCESS_KEY || !config.S3_SECRET_KEY) {
      throw new Error('STORAGE_DRIVER=s3 cần S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY.');
    }
    return new S3Storage(config.S3_BUCKET, config.S3_ENDPOINT, config.S3_ACCESS_KEY, config.S3_SECRET_KEY);
  }
  return new FilesystemStorage(resolveFromRepoRoot(config.STORAGE_FS_DIR));
}
