// Hands a backup file to the person: the Android share sheet when the browser can share files, otherwise a download.
// Browser code only (no data logic). It never touches storage.

export type HandOff = 'shared' | 'downloaded' | 'cancelled';

interface Env {
  nav: Pick<Navigator, 'share' | 'canShare'>;
  download: (file: File) => void;
}

/** A click on a temporary link makes the browser save the file. */
function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

/** Share the file; if sharing is not possible (not supported, or it fails for any reason except the person closing the
 * sheet) download it instead. The person closing the share sheet = 'cancelled': nothing was handed over. */
export async function handOffBackup(
  fileName: string,
  text: string,
  env: Env = { nav: navigator, download: downloadFile },
): Promise<HandOff> {
  const file = new File([text], fileName, { type: 'application/json' });
  const data = { files: [file], title: fileName };
  if (typeof env.nav.share === 'function' && typeof env.nav.canShare === 'function' && env.nav.canShare(data)) {
    try {
      await env.nav.share(data);
      return 'shared';
    } catch (e) {
      if (isAbort(e)) return 'cancelled';
      // Any other failure: fall through to the download.
    }
  }
  env.download(file);
  return 'downloaded';
}
