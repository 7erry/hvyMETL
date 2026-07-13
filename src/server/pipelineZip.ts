import { ZipArchive } from 'archiver';
import { createWriteStream, existsSync } from 'node:fs';
import { basename, join } from 'node:path';

export const PIPELINE_RESULTS_ZIP_NAME = 'pipeline-results.zip';

/** Zip every file under sourceDir into zipPath. */
export function zipDirectory(sourceDir: string, zipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.glob('**/*', {
      cwd: sourceDir,
      ignore: [PIPELINE_RESULTS_ZIP_NAME],
      dot: true,
    });
    void archive.finalize();
  });
}

/** Resolve the zip path for one pipeline run directory. */
export function pipelineResultsZipPath(runDir: string): string {
  return join(runDir, PIPELINE_RESULTS_ZIP_NAME);
}

/** Human-friendly download filename for a pipeline run. */
export function pipelineResultsDownloadFilename(runId: string): string {
  return `hvymetl-pipeline-${basename(runId)}.zip`;
}

/** True when a results zip already exists for this run. */
export function pipelineResultsZipExists(runDir: string): boolean {
  return existsSync(pipelineResultsZipPath(runDir));
}
