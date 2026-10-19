import { join, resolve } from 'node:path';

/** This package. */
export const TOOL_DIR = resolve(import.meta.dirname, '..');
export const ROOT = resolve(TOOL_DIR, '../..');
export const DESIGN_DIR = join(ROOT, 'design');
export const RENDERS_DIR = join(DESIGN_DIR, 'renders');
export const STORE_DIR = join(ROOT, 'store');
export const MOBILE_ASSETS = join(ROOT, 'apps/mobile/assets');

/** The board file every launch asset is drawn on. */
export const LAUNCH_FILE = '13 Launch.dc.html';
export const SHOP_FILE = '09 Shop and Plus.dc.html';
