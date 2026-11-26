import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = join(ROOT, 'data');
export const UPLOAD_DIR = join(DATA_DIR, 'uploads');
export const DB_PATH = join(DATA_DIR, 'eduplay.sqlite');
export const PUBLIC_DIR = join(ROOT, 'public');
