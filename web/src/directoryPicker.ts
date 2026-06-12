/** Result of choosing a folder that contains CSV exports. */
export type CsvDirectoryPick = {
  /** Folder name shown in the UI (not a server filesystem path). */
  label: string;
  /** CSV files found in the chosen folder. */
  files: File[];
};

/** Keep only files whose names end with .csv (case-insensitive). */
function filterCsvFiles(files: File[]): File[] {
  return files.filter((file) => file.name.toLowerCase().endsWith('.csv'));
}

/** Read top-level CSV files from a directory handle (File System Access API). */
async function readCsvFilesFromHandle(handle: FileSystemDirectoryHandle): Promise<File[]> {
  const files: File[] = [];
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.csv')) continue;
    files.push(await entry.getFile());
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return files;
}

/** Pick a folder via showDirectoryPicker when the browser supports it. */
async function pickDirectoryWithFileSystemAccess(): Promise<CsvDirectoryPick | null> {
  if (typeof window.showDirectoryPicker !== 'function') return null;

  const handle = await window.showDirectoryPicker({ mode: 'read' });
  const files = filterCsvFiles(await readCsvFilesFromHandle(handle));
  if (files.length === 0) return null;

  return { label: handle.name, files };
}

/** Fallback folder picker using webkitdirectory on a hidden file input. */
function pickDirectoryWithInput(): Promise<CsvDirectoryPick | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.style.display = 'none';

    const finish = (result: CsvDirectoryPick | null) => {
      input.remove();
      resolve(result);
    };

    input.addEventListener('change', () => {
      const allFiles = Array.from(input.files ?? []);
      const files = filterCsvFiles(allFiles);
      if (files.length === 0) {
        finish(null);
        return;
      }

      const relativePath = files[0]?.webkitRelativePath ?? '';
      const label = relativePath.includes('/') ? relativePath.split('/')[0]! : 'Selected folder';
      files.sort((a, b) => a.name.localeCompare(b.name));
      finish({ label, files });
    });

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Open the browser folder picker and return CSV files from the chosen directory.
 * Uses the File System Access API when available, otherwise webkitdirectory.
 */
export async function pickCsvDirectory(): Promise<CsvDirectoryPick | null> {
  try {
    const viaApi = await pickDirectoryWithFileSystemAccess();
    if (viaApi) return viaApi;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }

  return pickDirectoryWithInput();
}
