/**
 * Infer the best-matching workload profile from a SQL structural model.
 *
 * Table and column names are scored against domain keyword signals so the web UI
 * can auto-select "E-commerce Catalog" (and other presets) after schema import.
 */

import { isEavTable, isFirehoseTable, isPolymorphicTable } from '../design/patternSelector.js';
import type { SqlStructuralModel, WorkloadProfileId } from '../types.js';
import { ALL_PROFILES, getProfile } from './profiles.js';

type PresetProfileId = Exclude<WorkloadProfileId, 'custom'>;

export type ProfileInferenceResult = {
  profileId: PresetProfileId;
  label: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  scores: Record<PresetProfileId, number>;
};

/** Table-name keywords that strongly suggest a workload domain. */
const TABLE_SIGNALS: Record<PresetProfileId, RegExp[]> = {
  catalog: [
    /^products?$/,
    /^product_/,
    /^brands?$/,
    /^categor/,
    /^orders?$/,
    /^order_/,
    /^cart/,
    /^sku/,
    /^inventor/,
    /^warehouse/,
    /^supplier/,
    /^merch/,
    /^customer_reviews?$/,
    /^loyalty/,
    /^sales_channel/,
  ],
  cms: [/^pages?$/, /^content_/, /^authors?$/, /^posts?$/, /^revisions?$/, /^blocks?$/, /^tags?$/, /^assets?$/],
  iot: [/^readings?$/, /^sensor/, /^devices?$/, /^firmware/, /^sites?$/, /^measurements?$/, /^telemetry/],
  mobile: [/^sessions?$/, /^push_/, /^notifications?$/, /^app_/, /^tweets?$/, /^follows?$/, /^likes?$/],
  personalization: [/^affin/, /^recommend/, /^segments?$/, /^traits?$/, /^personaliz/],
  'realtime-analytics': [/^events?$/, /^rollup/, /^metrics?$/, /^impressions?$/, /^clicks?$/, /^analytics_/],
  'single-view': [/^customers?$/, /^customer_/, /^profiles?$/, /^identities$/],
  ledger: [/^transactions?$/, /^accounts?$/, /^ledger/, /^journal/, /^balances?$/, /^payments?$/],
};

function tableNameMatches(tableName: string, patterns: RegExp[]): boolean {
  const lower = tableName.toLowerCase();
  return patterns.some((pattern) => pattern.test(lower));
}

function countIncomingReferences(model: SqlStructuralModel, tableName: string): number {
  return model.tables.reduce(
    (count, table) => count + table.foreignKeys.filter((fk) => fk.referencesTable === tableName).length,
    0,
  );
}

function scoreTableSignals(model: SqlStructuralModel): Record<PresetProfileId, number> {
  const scores = Object.fromEntries(ALL_PROFILES.map((profile) => [profile.id, 0])) as Record<PresetProfileId, number>;

  for (const table of model.tables) {
    for (const profileId of Object.keys(TABLE_SIGNALS) as PresetProfileId[]) {
      if (tableNameMatches(table.name, TABLE_SIGNALS[profileId])) {
        scores[profileId] += 3;
      }
    }
  }

  return scores;
}

function applyStructuralBonuses(model: SqlStructuralModel, scores: Record<PresetProfileId, number>): void {
  const tableNames = new Set(model.tables.map((table) => table.name.toLowerCase()));

  if (model.tables.some((table) => isFirehoseTable(table))) {
    scores.iot += 4;
    scores['realtime-analytics'] += 3;
  }

  if (model.tables.some((table) => isPolymorphicTable(table))) {
    scores.cms += 4;
  }

  if (model.tables.some((table) => isEavTable(table))) {
    scores.catalog += 3;
    scores.personalization += 2;
  }

  if (tableNames.has('customers') || tableNames.has('customer')) {
    const hubScore = countIncomingReferences(model, 'customers') + countIncomingReferences(model, 'customer');
    if (hubScore >= 4) {
      scores['single-view'] += hubScore;
    }
  }

  if (tableNames.has('products') && (tableNames.has('orders') || tableNames.has('order_items'))) {
    scores.catalog += 5;
  }

  if (tableNames.has('pages') && model.tables.some((table) => /block|content/i.test(table.name))) {
    scores.cms += 4;
  }

  if (tableNames.has('devices') && model.tables.some((table) => /reading|sensor|measurement/i.test(table.name))) {
    scores.iot += 5;
  }

  if (tableNames.has('transactions') && tableNames.has('accounts')) {
    scores.ledger += 6;
  }

  if (tableNames.has('users') && (tableNames.has('tweets') || tableNames.has('follows'))) {
    scores.mobile += 4;
  }
}

function pickConfidence(topScore: number, secondScore: number): ProfileInferenceResult['confidence'] {
  if (topScore >= 8 && topScore - secondScore >= 3) return 'high';
  if (topScore >= 4 && topScore - secondScore >= 2) return 'medium';
  return 'low';
}

function buildReason(profileId: PresetProfileId, model: SqlStructuralModel): string {
  const matches = model.tables
    .filter((table) => tableNameMatches(table.name, TABLE_SIGNALS[profileId]))
    .map((table) => table.name)
    .slice(0, 4);
  const profile = getProfile(profileId);
  if (matches.length > 0) {
    return `Matched ${profile.label.toLowerCase()} signals in tables: ${matches.join(', ')}.`;
  }
  return `Defaulted to ${profile.label} based on overall schema shape (${model.tables.length} tables).`;
}

/**
 * Score all preset profiles and return the best match for a structural model.
 */
export function inferWorkloadProfile(model: SqlStructuralModel): ProfileInferenceResult {
  const scores = scoreTableSignals(model);
  applyStructuralBonuses(model, scores);

  const ranked = (Object.entries(scores) as [PresetProfileId, number][]).sort((left, right) => right[1] - left[1]);
  const [profileId, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;
  const resolvedId = topScore > 0 ? profileId : 'catalog';
  const profile = getProfile(resolvedId);

  return {
    profileId: resolvedId as PresetProfileId,
    label: profile.label,
    confidence: topScore > 0 ? pickConfidence(topScore, secondScore) : 'low',
    reason: buildReason(resolvedId as PresetProfileId, model),
    scores,
  };
}
