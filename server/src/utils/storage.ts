import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { query } from '../db';

export const STORAGE_ROOT = path.resolve(
  process.env.DAM_STORAGE_ROOT || path.join(process.cwd(), 'storage', 'dam')
);

// Ensure storage root exists
fs.mkdirSync(STORAGE_ROOT, { recursive: true });

/**
 * Validate that a given target path is strictly contained within STORAGE_ROOT.
 * Prevents Path Traversal attacks (OWASP A01 / A05).
 */
export function assertPathContained(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  const normalizedRoot = path.resolve(STORAGE_ROOT);

  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error('Security Error: Path traversal attempt detected.');
  }
  return resolved;
}

/**
 * Calculate SHA-256 hash of a file buffer (OWASP A02).
 */
export function computeBufferSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Auto-bootstrap default Workspace and Collection for a Tenant if none exists.
 */
export async function getOrCreateDefaultWorkspace(
  tenantId: number
): Promise<{ workspaceId: number; collectionId: number }> {
  // Check if workspace exists
  const workspaces = await query<any[]>(
    'SELECT id FROM workspaces WHERE tenant_id = ? ORDER BY id ASC LIMIT 1',
    [tenantId]
  );

  let workspaceId: number;
  if (workspaces && workspaces.length > 0) {
    workspaceId = workspaces[0].id;
  } else {
    const res = await query<any>(
      'INSERT INTO workspaces (tenant_id, name) VALUES (?, ?)',
      [tenantId, 'General Workspace']
    );
    workspaceId = res.insertId;
  }

  // Check if collection exists
  const collections = await query<any[]>(
    'SELECT id FROM collections WHERE workspace_id = ? ORDER BY id ASC LIMIT 1',
    [workspaceId]
  );

  let collectionId: number;
  if (collections && collections.length > 0) {
    collectionId = collections[0].id;
  } else {
    const res = await query<any>(
      'INSERT INTO collections (workspace_id, name) VALUES (?, ?)',
      [workspaceId, 'Todos los Archivos']
    );
    collectionId = res.insertId;
  }

  return { workspaceId, collectionId };
}

export interface GeneratedDerivative {
  derivativeType: string;
  width: number;
  height: number;
  byteSize: number;
  filePath: string;
}

/**
 * Generate WebP derivatives (thumb_200w and preview_800w) using sharp.
 */
export async function generateWebPDerivatives(
  inputBuffer: Buffer,
  mimeType: string,
  outDir: string
): Promise<GeneratedDerivative[]> {
  const derivatives: GeneratedDerivative[] = [];

  // Only generate image derivatives if input is an image
  if (!mimeType.startsWith('image/') || mimeType === 'image/gif') {
    return derivatives;
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  try {
    // 1. Thumbnail 200w WebP
    const thumbPath = path.join(outDir, 'thumb_200w.webp');
    assertPathContained(thumbPath);
    const thumbBuffer = await sharp(inputBuffer)
      .resize({ width: 200, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    fs.writeFileSync(thumbPath, thumbBuffer);
    const thumbMeta = await sharp(thumbBuffer).metadata();

    derivatives.push({
      derivativeType: 'THUMBNAIL_200W',
      width: Number(thumbMeta.width),
      height: Number(thumbMeta.height),
      byteSize: thumbBuffer.length,
      filePath: thumbPath,
    });

    // 2. Preview 800w WebP
    const previewPath = path.join(outDir, 'preview_800w.webp');
    assertPathContained(previewPath);
    const previewBuffer = await sharp(inputBuffer)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    fs.writeFileSync(previewPath, previewBuffer);
    const previewMeta = await sharp(previewBuffer).metadata();

    derivatives.push({
      derivativeType: 'PREVIEW_800W',
      width: Number(previewMeta.width),
      height: Number(previewMeta.height),
      byteSize: previewBuffer.length,
      filePath: previewPath,
    });
  } catch (err) {
    console.error('Error generating image derivatives with sharp:', err);
  }

  return derivatives;
}
