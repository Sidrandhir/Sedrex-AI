// services/storageService.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Storage Service v1.0
//
// Handles all file operations:
//   - Chat images    → sedrex-uploads/userId/images/
//   - Documents      → sedrex-uploads/userId/documents/
//   - Profile pics   → sedrex-avatars/userId/
//   - Chat exports   → sedrex-artifacts/userId/exports/
//   - Code artifacts → sedrex-artifacts/userId/code/
//
// Usage:
//   import { storageService } from './storageService';
//
//   // Upload image from file input
//   const result = await storageService.uploadImage(file, userId, sessionId);
//   result.url   // signed URL to display
//   result.path  // storage path to save in DB
//
//   // Upload document
//   const result = await storageService.uploadDocument(file, userId, sessionId);
//
//   // Get signed URL for existing file
//   const url = await storageService.getSignedUrl('sedrex-uploads', path);
// ══════════════════════════════════════════════════════════════════

import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getMonthlyLimit } from './tierConfig';

// ── Types ─────────────────────────────────────────────────────────

export interface UploadResult {
  path:         string;    // storage path — save this to DB
  url:          string;    // signed URL — use this to display
  publicUrl?:   string;    // only set for avatars
  bucket:       string;
  originalName: string;
  mimeType:     string;
  sizeBytes:    number;
  fileType:     FileType;
}

export type FileType = 'image' | 'document' | 'avatar' | 'export' | 'artifact';

export interface StorageStats {
  totalFiles:     number;
  totalSizeBytes: number;
  imageCount:     number;
  documentCount:  number;
  artifactCount:  number;
}

// ── Config ────────────────────────────────────────────────────────

const BUCKETS = {
  uploads:   'sedrex-uploads',
  avatars:   'sedrex-avatars',
  artifacts: 'sedrex-artifacts',
} as const;

const SIGNED_URL_TTL = 60 * 60; // 1 hour in seconds

// Image MIME types that can be displayed inline
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
]);

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf', 'text/plain', 'text/csv', 'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel', 'application/msword', 'application/json',
]);

// ── Helpers ───────────────────────────────────────────────────────

function generateFileName(originalName: string): string {
  const ext       = originalName.split('.').pop()?.toLowerCase() ?? 'bin';
  const timestamp = Date.now().toString(36);
  const random    = Math.random().toString(36).slice(2, 8);
  return `${timestamp}_${random}.${ext}`;
}

function getFileType(mimeType: string): FileType {
  if (IMAGE_MIME_TYPES.has(mimeType))    return 'image';
  if (DOCUMENT_MIME_TYPES.has(mimeType)) return 'document';
  return 'document';
}

function guard(): void {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase not configured — cannot upload files');
  }
}

// ── Core upload function ──────────────────────────────────────────

async function uploadFile(
  file:         File,
  bucket:       string,
  storagePath:  string,
  fileType:     FileType,
): Promise<UploadResult> {
  guard();

  const { error } = await supabase!.storage
    .from(bucket)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert:       false,
      contentType:  file.type,
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  // Get URL
  let url = '';
  let publicUrl: string | undefined;

  if (bucket === BUCKETS.avatars) {
    const { data } = supabase!.storage.from(bucket).getPublicUrl(storagePath);
    url = data.publicUrl;
    publicUrl = data.publicUrl;
  } else {
    const { data, error: urlError } = await supabase!.storage
      .from(bucket)
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    if (urlError) throw new Error(`Failed to get URL: ${urlError.message}`);
    url = data.signedUrl;
  }

  return {
    path:         storagePath,
    url,
    publicUrl,
    bucket,
    originalName: file.name,
    mimeType:     file.type,
    sizeBytes:    file.size,
    fileType,
  };
}

// ── Public API ────────────────────────────────────────────────────

export const storageService = {

  // ── Chat images ──────────────────────────────────────────────
  async uploadImage(
    file:           File,
    userId:         string,
    conversationId?: string,
  ): Promise<UploadResult> {
    if (!IMAGE_MIME_TYPES.has(file.type)) {
      throw new Error(`File type ${file.type} is not a supported image format`);
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Image must be under 10 MB');
    }
    const fileName = generateFileName(file.name);
    const path     = `${userId}/images/${conversationId ? conversationId + '/' : ''}${fileName}`;
    const result   = await uploadFile(file, BUCKETS.uploads, path, 'image');
    await this._trackUpload(result, userId, conversationId);
    return result;
  },

  // ── Documents (PDF, DOCX, XLSX, CSV) ─────────────────────────
  async uploadDocument(
    file:           File,
    userId:         string,
    conversationId?: string,
  ): Promise<UploadResult> {
    if (!DOCUMENT_MIME_TYPES.has(file.type)) {
      throw new Error(`File type ${file.type} is not a supported document format`);
    }
    if (file.size > 50 * 1024 * 1024) {
      throw new Error('Document must be under 50 MB');
    }
    const fileName = generateFileName(file.name);
    const path     = `${userId}/documents/${conversationId ? conversationId + '/' : ''}${fileName}`;
    const result   = await uploadFile(file, BUCKETS.uploads, path, 'document');
    await this._trackUpload(result, userId, conversationId);
    return result;
  },

  // ── Profile picture ───────────────────────────────────────────
  async uploadAvatar(
    file:   File,
    userId: string,
  ): Promise<UploadResult> {
    if (!IMAGE_MIME_TYPES.has(file.type)) {
      throw new Error('Avatar must be JPEG, PNG, or WebP');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Avatar must be under 5 MB');
    }
    // Always overwrite — one avatar per user
    const ext    = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path   = `${userId}/avatar.${ext}`;
    const result = await uploadFile(file, BUCKETS.avatars, path, 'avatar');

    // Update profile avatar_url
    if (supabase) {
      await supabase.from('profiles')
        .update({ avatar_url: result.publicUrl })
        .eq('id', userId);
    }
    await this._trackUpload(result, userId);
    return result;
  },

  // ── Chat export (.md file) ────────────────────────────────────
  async uploadExport(
    content:        string,
    filename:       string,
    userId:         string,
    conversationId?: string,
  ): Promise<UploadResult> {
    const blob = new Blob([content], { type: 'text/markdown' });
    const file = new File([blob], filename, { type: 'text/markdown' });
    const path = `${userId}/exports/${generateFileName(filename)}`;
    const result = await uploadFile(file, BUCKETS.artifacts, path, 'export');
    await this._trackUpload(result, userId, conversationId);
    return result;
  },

  // ── Code artifact ─────────────────────────────────────────────
  async uploadArtifact(
    content:  string,
    filename: string,
    language: string,
    userId:   string,
    artifactId?: string,
  ): Promise<UploadResult> {
    const mimeType = language === 'html' ? 'text/html'
                   : language === 'css'  ? 'text/css'
                   : language === 'json' ? 'application/json'
                   : 'text/plain';
    const blob   = new Blob([content], { type: mimeType });
    const file   = new File([blob], filename, { type: mimeType });
    const path   = `${userId}/code/${artifactId ?? generateFileName(filename)}`;
    const result = await uploadFile(file, BUCKETS.artifacts, path, 'artifact');
    await this._trackUpload(result, userId);
    return result;
  },

  // ── Get signed URL for existing file ─────────────────────────
  async getSignedUrl(bucket: string, path: string, expiresIn = SIGNED_URL_TTL): Promise<string> {
    guard();
    if (bucket === BUCKETS.avatars) {
      const { data } = supabase!.storage.from(bucket).getPublicUrl(path);
      return data.publicUrl;
    }
    const { data, error } = await supabase!.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    if (error) throw new Error(`Failed to get signed URL: ${error.message}`);
    return data.signedUrl;
  },

  // ── Delete file ───────────────────────────────────────────────
  async deleteFile(bucket: string, path: string, userId: string): Promise<void> {
    guard();
    const { error } = await supabase!.storage.from(bucket).remove([path]);
    if (error) throw new Error(`Delete failed: ${error.message}`);

    // Mark as deleted in tracking table
    if (supabase) {
      await supabase.from('file_uploads')
        .update({ is_deleted: true })
        .eq('storage_path', path)
        .eq('user_id', userId);
    }
  },

  // ── List user files ───────────────────────────────────────────
  async getUserFiles(userId: string, fileType?: FileType) {
    if (!isSupabaseConfigured || !supabase) return [];
    let query = supabase
      .from('file_uploads')
      .select('id, original_name, display_name, file_type, mime_type, file_size_bytes, file_size_human, storage_path, public_url, upload_status, created_at')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (fileType) query = query.eq('file_type', fileType);
    const { data } = await query.limit(100);
    return data ?? [];
  },

  // ── Get storage stats for user ────────────────────────────────
  async getStorageStats(userId: string): Promise<StorageStats> {
    if (!isSupabaseConfigured || !supabase) {
      return { totalFiles: 0, totalSizeBytes: 0, imageCount: 0, documentCount: 0, artifactCount: 0 };
    }
    const { data } = await supabase
      .from('file_uploads')
      .select('file_type, file_size_bytes')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .limit(1000);

    const files = data ?? [];
    return {
      totalFiles:     files.length,
      totalSizeBytes: files.reduce((s, f) => s + (f.file_size_bytes ?? 0), 0),
      imageCount:     files.filter(f => f.file_type === 'image').length,
      documentCount:  files.filter(f => f.file_type === 'document').length,
      artifactCount:  files.filter(f => f.file_type === 'artifact').length,
    };
  },

  // ── Convert base64 image to File (for existing messages) ──────
  base64ToFile(base64Data: string, mimeType: string, filename: string): File {
    const byteString = atob(base64Data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new File([ab], filename, { type: mimeType });
  },

  // ── Internal: track upload in file_uploads table ──────────────
  async _trackUpload(
    result:         UploadResult,
    userId:         string,
    conversationId?: string,
  ): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      await supabase.from('file_uploads').insert({
        user_id:         userId,
        conversation_id: conversationId ?? null,
        bucket:          result.bucket,
        storage_path:    result.path,
        public_url:      result.publicUrl ?? null,
        original_name:   result.originalName,
        // Map app-only FileType values to the CHECK-constraint-valid set.
        // 'avatar'/'export'/'artifact' are not in the schema's CHECK list.
        file_type:       result.fileType === 'avatar'   ? 'image'
                       : result.fileType === 'export'   ? 'text'
                       : result.fileType === 'artifact' ? 'code'
                       : result.fileType,
        mime_type:       result.mimeType,
        file_size_bytes: result.sizeBytes,
      });
    } catch {
      // Never let tracking failure break the upload
    }
  },
};

// ── Legacy getStats export (keeps existing analyticsService compat) ──
export async function getStats(userId: string) {
  if (!isSupabaseConfigured || !supabase) {
    return {
      userId,
      tier: 'free' as const,
      totalMessagesSent: 0,
      monthlyMessagesSent: 0,
      monthlyMessagesLimit: getMonthlyLimit('free'),
      tokensEstimated: 0,
      modelUsage: {},
      dailyHistory: [],
    };
  }
  try {
    const { data } = await supabase
      .from('user_stats')
      .select('user_id, tier, total_messages, monthly_messages, tokens_estimated, model_usage, daily_history')
      .eq('user_id', userId)
      .maybeSingle();
    return {
      userId:               data?.user_id    ?? userId,
      tier:                 data?.tier       ?? 'free',
      totalMessagesSent:    data?.total_messages    ?? 0,
      monthlyMessagesSent:  data?.monthly_messages  ?? 0,
      monthlyMessagesLimit: getMonthlyLimit(data?.tier),
      tokensEstimated:      data?.tokens_estimated  ?? 0,
      modelUsage:           data?.model_usage       ?? {},
      dailyHistory:         data?.daily_history     ?? [],
    };
  } catch {
    return {
      userId, tier: 'free' as const,
      totalMessagesSent: 0, monthlyMessagesSent: 0,
      monthlyMessagesLimit: getMonthlyLimit('free'), tokensEstimated: 0,
      modelUsage: {}, dailyHistory: [],
    };
  }
}