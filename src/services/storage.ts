import { supabase } from './supabase';

export type StorageBucket = 'avatars' | 'event-covers' | 'verification-proofs';

/**
 * Uploads a local image (a file:// URI from expo-image-picker) to Supabase Storage
 * and returns the stored object path — persist THAT path (not the local URI, which
 * dies with the app sandbox) on the profile / event / application row.
 *
 * Path conventions (enforced by the storage RLS policies in supabase/schema.sql):
 *   avatars:             `<user_id>/<filename>`
 *   event-covers:        `<event_id>/<filename>`
 *   verification-proofs: `<user_id>/<filename>`  (private bucket)
 */
export async function uploadImage(bucket: StorageBucket, path: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });

  if (error) throw error;
  return path;
}

/** URL for objects in the public buckets (avatars, event-covers). */
export function getPublicImageUrl(bucket: 'avatars' | 'event-covers', path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * Short-lived URL for the private verification-proofs bucket. Generate one when a
 * reviewer opens the proof; do not store it on the row — store the object path.
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
