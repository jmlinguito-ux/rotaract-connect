import { supabase } from './supabase';

export type StorageBucket = 'avatars' | 'event-covers' | 'verification-proofs' | 'chat-media';

/**
 * The buckets whose objects are world-readable. `getPublicImageUrl` is only valid
 * for these; private buckets (verification-proofs, chat-media) need a signed URL.
 */
type PublicBucket = 'avatars' | 'event-covers';

/**
 * Minimal shape of an expo-image-picker asset. We upload from `base64` when the
 * picker was asked for it (the reliable path in React Native — see below); `uri`
 * is the fallback for web / assets picked without base64.
 */
export interface PickedImage {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
}

/**
 * Dependency-free base64 → bytes. Hermes has no atob/Buffer, and
 * fetch(fileUri).blob() is unreliable on React Native (it frequently yields a
 * 0-byte blob, which is why uploads silently "succeeded" with empty files).
 * expo-image-picker can hand us base64 directly, so we decode that ourselves.
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/=]/g, '');
  const len = clean.length;
  let bufferLength = (len * 3) / 4;
  if (clean[len - 1] === '=') bufferLength--;
  if (clean[len - 2] === '=') bufferLength--;
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = B64.indexOf(clean[i]);
    const e2 = B64.indexOf(clean[i + 1]);
    const e3 = B64.indexOf(clean[i + 2]);
    const e4 = B64.indexOf(clean[i + 3]);
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (e3 !== -1 && clean[i + 2] !== '=') bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (e4 !== -1 && clean[i + 3] !== '=') bytes[p++] = ((e3 & 3) << 6) | e4;
  }
  return bytes;
}

function extForMime(mime?: string | null): string {
  switch (mime) {
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/heic': return 'heic';
    case 'image/gif': return 'gif';
    default: return 'jpg';
  }
}

/** True for values already pointing at a remote object (preset URLs, already-uploaded URLs). */
export function isRemoteUrl(value?: string | null): boolean {
  return !!value && /^https?:\/\//i.test(value);
}

/**
 * Uploads a picked image to Supabase Storage and returns the stored object path.
 * Persist THAT path (or, for public buckets, the public URL) on the row — never
 * the local `file://` uri, which dies with the app sandbox and means nothing on
 * another device.
 *
 * Throws on failure so callers can surface a real error instead of silently
 * storing a dead local uri (the previous behaviour, and the root cause of
 * "photos not syncing").
 */
export async function uploadImageAsset(
  bucket: StorageBucket,
  folder: string,
  asset: PickedImage,
): Promise<string> {
  const contentType = asset.mimeType || 'image/jpeg';
  const ext = extForMime(asset.mimeType) || (asset.fileName?.split('.').pop() ?? 'jpg');
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  let body: Uint8Array | ArrayBuffer;
  if (asset.base64) {
    body = decodeBase64(asset.base64);
  } else {
    // Fallback (mainly web): arrayBuffer() is reliable there, unlike blob() on RN.
    const res = await fetch(asset.uri);
    body = await res.arrayBuffer();
  }

  const byteLength = (body as Uint8Array).byteLength ?? (body as ArrayBuffer).byteLength ?? 0;
  if (byteLength === 0) {
    throw new Error('Selected image was empty — please try another photo.');
  }

  // 5MB hard limit check
  const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
  if (byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error('Image exceeds the 5MB size limit. Please choose a smaller photo or crop it before uploading.');
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, body, { upsert: true, contentType });

  if (error) throw error;
  return path;
}

/** URL for objects in the public buckets (avatars, event-covers). */
export function getPublicImageUrl(bucket: PublicBucket, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * Uploads to a public bucket and returns the ready-to-store public URL. Preset /
 * already-remote values are passed through unchanged so re-saving an event/profile
 * that kept its existing photo does not re-upload it.
 */
export async function uploadPublicImage(
  bucket: PublicBucket,
  folder: string,
  asset: PickedImage,
): Promise<string> {
  if (isRemoteUrl(asset.uri) && !asset.base64) return asset.uri;
  const path = await uploadImageAsset(bucket, folder, asset);
  return getPublicImageUrl(bucket, path);
}

/**
 * Short-lived URL for a private bucket (verification-proofs, chat-media). Generate
 * one when the object is opened; do not store it on the row — store the object path.
 */
export async function getSignedImageUrl(
  bucket: StorageBucket,
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}
