import { supabase } from '@/integrations/supabase/client';

const SIGNED_STORAGE_FLAG = import.meta.env.VITE_USE_SIGNED_STORAGE === 'true';
const SIGNED_STORAGE_FUNCTION = 'storage-signed-url';

type StorageResult<T> = { data: T | null; error: Error | null };

type SignedStorageAction = 'upload' | 'download' | 'delete';

interface SignedStorageResponse {
  success?: boolean;
  signedUrl?: string;
  token?: string;
  path?: string;
  removed?: unknown;
  error?: string;
}

interface SignedStorageRequest {
  action: SignedStorageAction;
  bucket: string;
  path?: string;
  paths?: string[];
  expiresIn?: number;
  upsert?: boolean;
}

export interface StorageUploadOptions {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
}

async function invokeSignedStorage(
  request: SignedStorageRequest
): Promise<StorageResult<SignedStorageResponse>> {
  const { data, error } = await supabase.functions.invoke(SIGNED_STORAGE_FUNCTION, {
    body: request,
  });

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  const response = data as SignedStorageResponse | null;
  if (!response || response.success === false) {
    const message = response?.error || 'Signed storage request failed';
    return { data: null, error: new Error(message) };
  }

  return { data: response, error: null };
}

export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob,
  options?: StorageUploadOptions
): Promise<StorageResult<{ path: string; fullPath?: string }>> {
  if (!SIGNED_STORAGE_FLAG) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, options);
    return { data, error };
  }

  const { data, error } = await invokeSignedStorage({
    action: 'upload',
    bucket,
    path,
    upsert: Boolean(options?.upsert),
  });

  if (error || !data?.token) {
    return { data: null, error: error ?? new Error('Missing signed upload token') };
  }

  const uploadResult = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, data.token, file, options);

  return { data: uploadResult.data, error: uploadResult.error };
}

export async function downloadFile(
  bucket: string,
  path: string,
  expiresIn = 600
): Promise<StorageResult<Blob>> {
  if (!SIGNED_STORAGE_FLAG) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);
    return { data, error };
  }

  const { data, error } = await invokeSignedStorage({
    action: 'download',
    bucket,
    path,
    expiresIn,
  });

  if (error || !data?.signedUrl) {
    return { data: null, error: error ?? new Error('Missing signed download URL') };
  }

  const response = await fetch(data.signedUrl);
  if (!response.ok) {
    return { data: null, error: new Error(`Signed download failed (${response.status})`) };
  }

  const blob = await response.blob();
  return { data: blob, error: null };
}

export async function createSignedDownloadUrl(
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<StorageResult<{ signedUrl: string }>> {
  if (!SIGNED_STORAGE_FLAG) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    return { data, error };
  }

  const { data, error } = await invokeSignedStorage({
    action: 'download',
    bucket,
    path,
    expiresIn,
  });

  if (error || !data?.signedUrl) {
    return { data: null, error: error ?? new Error('Missing signed download URL') };
  }

  return { data: { signedUrl: data.signedUrl }, error: null };
}

export async function removeFiles(
  bucket: string,
  paths: string[]
): Promise<StorageResult<unknown>> {
  if (!SIGNED_STORAGE_FLAG) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .remove(paths);
    return { data, error };
  }

  const { data, error } = await invokeSignedStorage({
    action: 'delete',
    bucket,
    paths,
  });

  if (error) {
    return { data: null, error };
  }

  return { data: data?.removed ?? null, error: null };
}
