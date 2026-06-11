import { describe, expect, it } from 'vitest';
import type { KnowledgeChunk } from '../types.js';
import { chunkKey, reciprocalRankFusion } from './retriever.js';

const chunkA: KnowledgeChunk = { sourceFile: 'bucket.md', heading: 'When to use', text: 'time series' };
const chunkB: KnowledgeChunk = { sourceFile: 'subset.md', heading: 'Applicability', text: 'bounded arrays' };
const chunkC: KnowledgeChunk = { sourceFile: 'computed.md', heading: 'Counters', text: 'read heavy' };

describe('chunkKey', () => {
  it('is stable for fusion lookups', () => {
    expect(chunkKey(chunkA)).toBe('bucket.md\0When to use');
  });
});

describe('reciprocalRankFusion', () => {
  it('boosts chunks that rank highly in both lists', () => {
    const bm25 = [
      { ...chunkA, score: 4.5 },
      { ...chunkB, score: 3.2 },
      { ...chunkC, score: 1.1 },
    ];
    const semantic = [
      { ...chunkB, score: 0.92 },
      { ...chunkC, score: 0.55 },
      { ...chunkA, score: 0.41 },
    ];

    const fused = reciprocalRankFusion([bm25, semantic], 60);
    expect(fused[0].heading).toBe('Applicability');
    const dualListScore = fused.find((c) => c.heading === 'Applicability')!.score;
    const singleListOnly = reciprocalRankFusion([[{ ...chunkA, score: 1 }]], 60)[0].score;
    expect(dualListScore).toBeGreaterThan(singleListOnly);
  });

  it('includes chunks that appear in only one list', () => {
    const onlyLexical = [{ ...chunkA, score: 2 }];
    const onlySemantic = [{ ...chunkB, score: 0.9 }];
    const fused = reciprocalRankFusion([onlyLexical, onlySemantic], 60);
    expect(fused).toHaveLength(2);
    expect(fused.map((c) => c.heading).sort()).toEqual(['Applicability', 'When to use']);
  });

  it('assigns higher RRF score when rank is better', () => {
    const first = [{ ...chunkA, score: 1 }];
    const second = [{ ...chunkB, score: 1 }, { ...chunkA, score: 0.5 }];
    const fusedFirst = reciprocalRankFusion([first], 60);
    const fusedSecond = reciprocalRankFusion([second], 60);
    expect(fusedFirst[0].score).toBeGreaterThan(fusedSecond.find((c) => c.heading === 'When to use')!.score);
  });
});
