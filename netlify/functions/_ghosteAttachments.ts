/**
 * Ghoste AI Attachments Handler
 *
 * Reads media assets from canonical media_assets table using service role.
 * NO client-side URLs, NO user_uploads references.
 */

import { getSupabaseAdmin } from './_supabaseAdmin';

export interface AttachmentInput {
  media_asset_id?: string;
  kind?: string;
  filename?: string;
  mime?: string;
  size?: number;
  url?: string;
}

export interface ResolvedAttachment {
  id: string;
  kind: 'video' | 'image' | 'audio' | 'file';
  filename: string;
  mime: string;
  size: number;
  public_url: string | null;
  storage_bucket: string;
  storage_key: string;
  meta_ready: boolean;
  meta_ready_url: string | null;
}

/**
 * Resolve attachments from media_assets table using service role
 *
 * CRITICAL: Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS
 *
 * @param userId - User ID (for security check)
 * @param attachments - Attachment references from message
 * @returns Resolved attachment data with storage URLs
 */
export async function resolveAttachments(
  userId: string,
  attachments: AttachmentInput[]
): Promise<ResolvedAttachment[]> {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();

  console.log('[resolveAttachments] Resolving for user:', userId);
  console.log('[resolveAttachments] Input attachments:', attachments.length);

  const mediaAssetIds = attachments
    .map(a => a.media_asset_id)
    .filter((id): id is string => !!id);

  if (mediaAssetIds.length === 0) {
    console.warn('[resolveAttachments] No media_asset_id found in attachments');
    return [];
  }

  // Query media_assets with service role (bypasses RLS)
  const { data: assets, error } = await supabase
    .from('media_assets')
    .select('id, kind, filename, mime, size, public_url, storage_bucket, storage_key, meta_ready, meta_ready_url, owner_user_id')
    .eq('owner_user_id', userId)
    .in('id', mediaAssetIds);

  if (error) {
    console.error('[resolveAttachments] Query error:', error);
    return [];
  }

  if (!assets || assets.length === 0) {
    console.warn('[resolveAttachments] No media assets found for IDs:', mediaAssetIds);
    return [];
  }

  console.log('[resolveAttachments] Resolved', assets.length, 'attachments');

  return assets.map(asset => ({
    id: asset.id,
    kind: asset.kind as 'video' | 'image' | 'audio' | 'file',
    filename: asset.filename,
    mime: asset.mime,
    size: asset.size,
    public_url: asset.public_url,
    storage_bucket: asset.storage_bucket,
    storage_key: asset.storage_key,
    meta_ready: asset.meta_ready,
    meta_ready_url: asset.meta_ready_url,
  }));
}

/**
 * Format attachments for AI prompt
 * Provide clear, usable descriptions without exposing storage details
 */
export function formatAttachmentsForAI(attachments: ResolvedAttachment[]): string {
  if (!attachments || attachments.length === 0) {
    return '';
  }

  const lines: string[] = [];

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('📎 ATTACHMENTS (USER UPLOADED MEDIA)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  attachments.forEach((att, idx) => {
    lines.push(`${idx + 1}. ${att.filename}`);
    lines.push(`   Type: ${att.kind} (${att.mime})`);
    lines.push(`   Size: ${formatBytes(att.size)}`);

    if (att.meta_ready && att.meta_ready_url) {
      lines.push(`   ✅ Meta Ads Ready: ${att.meta_ready_url}`);
    } else if (att.kind === 'video' || att.kind === 'image') {
      lines.push(`   ⚠️  Not Meta-ready yet (pending processing)`);
    }

    lines.push(`   Media Asset ID: ${att.id}`);
    lines.push('');
  });

  lines.push('💡 HOW TO USE:');
  lines.push('- For "run ads": Use media_asset_id in campaign draft');
  lines.push('- For video ads: Use meta_ready_url if available');
  lines.push('- For image ads: Use meta_ready_url if available');
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
