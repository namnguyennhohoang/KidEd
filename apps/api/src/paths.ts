import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** apps/api/src -> apps/api */
export const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** apps/api -> repo root */
export const REPO_ROOT = resolve(API_ROOT, '..', '..');
export const CONTENT_ROOT = join(REPO_ROOT, 'content');
export const MIGRATIONS_DIR = join(API_ROOT, 'drizzle');

/**
 * Đường dẫn tương đối trong cấu hình (vd `./data/pglite`) luôn neo vào REPO ROOT,
 * KHÔNG phụ thuộc cwd — để mọi entrypoint (script root, script workspace, server, test)
 * cùng trỏ về một chỗ. Đây là nguyên nhân bug "server thấy DB rỗng" đã sửa.
 */
export function resolveFromRepoRoot(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}
