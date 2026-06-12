import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MigrationPlan } from '../types.js';
import { getRepogenLanguage, type GeneratedFile, type RepogenGenerateResult, type RepogenLanguageId } from './languages/index.js';

/** Options for one generation run. */
export type RepogenOptions = {
  /** Path to migration-plan.json. */
  planPath: string;
  /** Folder receiving the generated repository modules. */
  outDir: string;
  /** Target client language (defaults to Node.js TypeScript). */
  language?: RepogenLanguageId | string;
};

/** Options when the plan object is already in memory. */
export type RepogenFromPlanOptions = {
  plan: MigrationPlan;
  language?: RepogenLanguageId | string;
  outDir?: string;
};

/** Write generated files to disk. */
function writeGeneratedFiles(outDir: string, files: GeneratedFile[]): void {
  mkdirSync(outDir, { recursive: true });
  for (const file of files) {
    const filePath = join(outDir, file.relativePath);
    writeFileSync(filePath, file.content);
    console.log(`Wrote ${filePath}`);
  }
}

/** Generate repository layer source files from a migration plan. */
export function generateFromPlan(options: RepogenFromPlanOptions): RepogenGenerateResult {
  const language = getRepogenLanguage(options.language);
  const files = language.generate(options.plan);

  if (options.outDir) {
    writeGeneratedFiles(options.outDir, files);
    console.log(
      `Generated ${options.plan.collections.length} repositories for profile "${options.plan.profileId}" (${language.label}).`,
    );
  }

  return {
    language: language.id,
    languageLabel: language.label,
    driverName: language.driverName,
    files,
    collectionCount: options.plan.collections.length,
  };
}

/** Run the generator from a migration-plan.json file on disk. */
export function runRepogen(options: RepogenOptions): RepogenGenerateResult {
  const plan: MigrationPlan = JSON.parse(readFileSync(options.planPath, 'utf8'));
  return generateFromPlan({ plan, language: options.language, outDir: options.outDir });
}
