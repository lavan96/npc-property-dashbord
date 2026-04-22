export const MAX_DOCUMENT_UPLOAD_FILES = 10;

export type UploadProcessingMode = 'parallel' | 'sequential';

export interface UploadFailure {
  fileName: string;
  error: string;
}

export function mergeFilesWithLimit(existingFiles: File[], incomingFiles: File[], maxFiles: number = MAX_DOCUMENT_UPLOAD_FILES) {
  return [...existingFiles, ...incomingFiles].slice(0, maxFiles);
}

export async function processFilesByMode<T>(
  files: File[],
  mode: UploadProcessingMode,
  processor: (file: File, index: number) => Promise<T>,
) {
  if (mode === 'sequential') {
    const successes: T[] = [];
    const failures: UploadFailure[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        successes.push(await processor(file, index));
      } catch (error: any) {
        failures.push({
          fileName: file.name,
          error: error?.message || 'Upload failed',
        });
      }
    }

    return { successes, failures };
  }

  const results = await Promise.allSettled(files.map((file, index) => processor(file, index)));

  const successes: T[] = [];
  const failures: UploadFailure[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successes.push(result.value);
      return;
    }

    failures.push({
      fileName: files[index]?.name || `File ${index + 1}`,
      error: result.reason?.message || 'Upload failed',
    });
  });

  return { successes, failures };
}