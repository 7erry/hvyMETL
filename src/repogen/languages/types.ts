import type { MigrationPlan } from '../../types.js';

/** MongoDB officially supported client language identifiers. */
export type RepogenLanguageId =
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'go'
  | 'java'
  | 'kotlin'
  | 'node'
  | 'php'
  | 'python'
  | 'ruby'
  | 'rust'
  | 'scala'
  | 'swift';

/** One generated source file. */
export type GeneratedFile = {
  relativePath: string;
  content: string;
};

/** Metadata and renderer for one target language. */
export type RepogenLanguage = {
  id: RepogenLanguageId;
  label: string;
  driverName: string;
  generate(plan: MigrationPlan): GeneratedFile[];
};

/** Result returned to the web API. */
export type RepogenGenerateResult = {
  language: RepogenLanguageId;
  languageLabel: string;
  driverName: string;
  files: GeneratedFile[];
  collectionCount: number;
};
