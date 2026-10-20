// Hands the summary pictures to the person (step 3.4): the Android share sheet when the browser can share these files, otherwise
// one download per picture. Same approach as `handOffBackup`: closing the sheet is not an error. Browser code only; never touches storage.
import { downloadFile, isAbort, type HandOff } from './backupFile';

interface Env {
  nav: Pick<Navigator, 'share' | 'canShare'>;
  download: (file: File) => void;
  /** A short wait between downloads: Chrome may refuse a burst of downloads started in the same instant. */
  pause: () => Promise<void>;
}

const defaultEnv = (): Env => ({
  nav: navigator,
  download: downloadFile,
  pause: () => new Promise((resolve) => setTimeout(resolve, 400)),
});

/** File name of picture `index` (1-based). The member's name is never part of it. */
export const summaryFileName = (date: string, index: number): string => `judya-summary-${date}-${index}.png`;

export function summaryFiles(blobs: Blob[], date: string): File[] {
  return blobs.map((b, i) => new File([b], summaryFileName(date, i + 1), { type: 'image/png' }));
}

export async function handOffSummary(files: File[], text: string, env: Env = defaultEnv()): Promise<HandOff> {
  if (typeof env.nav.share === 'function' && typeof env.nav.canShare === 'function' && env.nav.canShare({ files })) {
    try {
      await env.nav.share({ files, text });
      return 'shared';
    } catch (e) {
      if (isAbort(e)) return 'cancelled';
      // Any other failure: fall through to the downloads.
    }
  }
  for (const [i, f] of files.entries()) {
    if (i > 0) await env.pause();
    env.download(f);
  }
  return 'downloaded';
}
