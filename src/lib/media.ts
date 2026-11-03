import type { SupabaseClient } from "@supabase/supabase-js";

export const MEDIA_BUCKET = "chain-media";
export const LIBRARY_BUCKET = "library-images";
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Run images live in a PRIVATE bucket; pages show them through signed URLs that
// expire after an hour. Returns a map path -> URL (missing files are omitted).
export async function signedImageUrls(supabase: SupabaseClient, paths: string[]) {
  const unique = [...new Set(paths)];
  const urls = new Map<string, string>();
  if (unique.length === 0) return urls;
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(unique, 3600);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

// The library bucket is public (the admin app manages it).
export function libraryUrl(storagePath: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${LIBRARY_BUCKET}/${storagePath}`;
}
