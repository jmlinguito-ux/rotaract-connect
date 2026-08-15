import { useEffect, useState } from 'react';
import { StorageBucket, getSignedImageUrl, isRemoteUrl } from '../services/storage';

// Process-wide cache so re-rendering a message list doesn't re-sign every image.
// Signed URLs are cached a little under their real 1h expiry.
const cache = new Map<string, { url: string; expires: number }>();
const TTL_MS = 55 * 60 * 1000;

/**
 * Resolves a viewable URL for an object in a private bucket, caching the signed
 * URL. Values that are already full URLs (or local file uris) pass through.
 */
export function useSignedUrl(bucket: StorageBucket, path?: string): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!path) return null;
    if (isRemoteUrl(path) || path.startsWith('file:')) return path;
    const hit = cache.get(`${bucket}/${path}`);
    return hit && hit.expires > Date.now() ? hit.url : null;
  });

  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    if (isRemoteUrl(path) || path.startsWith('file:')) { setUrl(path); return; }
    const key = `${bucket}/${path}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) { setUrl(hit.url); return; }
    getSignedImageUrl(bucket, path)
      .then(signed => {
        cache.set(key, { url: signed, expires: Date.now() + TTL_MS });
        if (!cancelled) setUrl(signed);
      })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [bucket, path]);

  return url;
}
