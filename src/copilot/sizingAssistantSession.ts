/**
 * In-memory sizing assistant session store (Release 4.0 Phase 2).
 */

import { randomUUID } from 'node:crypto';
import type { CopilotChatMessage } from './groveChat.js';
import type {
  ResourceCuratorHandoffStatus,
  SizingAssistantSession,
  SizingSessionParameters,
} from './sizingAssistantTypes.js';
import { DEFAULT_SHARD_PENALTY_MULTIPLIER } from './sizingAssistantTypes.js';

export type SizingSessionStore = {
  create(): SizingAssistantSession;
  get(sessionId: string): SizingAssistantSession | undefined;
  save(session: SizingAssistantSession): void;
  delete(sessionId: string): void;
  clear(): void;
};

/** Process-local session map for dev and tests. */
export class InMemorySizingSessionStore implements SizingSessionStore {
  private sessions = new Map<string, SizingAssistantSession>();

  create(): SizingAssistantSession {
    const now = new Date().toISOString();
    const session: SizingAssistantSession = {
      sessionId: randomUUID(),
      createdAt: now,
      updatedAt: now,
      aborted: false,
      parameters: {},
      shardPenaltyMultiplier: DEFAULT_SHARD_PENALTY_MULTIPLIER,
      resourceCuratorHandoff: 'not_started',
      transcripts: [],
      chatMessages: [],
    };
    this.sessions.set(session.sessionId, structuredClone(session));
    return structuredClone(session);
  }

  get(sessionId: string): SizingAssistantSession | undefined {
    const found = this.sessions.get(sessionId);
    return found ? structuredClone(found) : undefined;
  }

  save(session: SizingAssistantSession): void {
    this.sessions.set(session.sessionId, structuredClone(session));
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  clear(): void {
    this.sessions.clear();
  }
}

let activeStore: SizingSessionStore = new InMemorySizingSessionStore();

/** Replace the global session store (tests). */
export function setSizingSessionStore(store: SizingSessionStore): void {
  activeStore = store;
}

export function getSizingSessionStore(): SizingSessionStore {
  return activeStore;
}

export function createSizingSession(): SizingAssistantSession {
  return activeStore.create();
}

export function getSizingSession(sessionId: string): SizingAssistantSession | undefined {
  return activeStore.get(sessionId);
}

export function touchSession(session: SizingAssistantSession): SizingAssistantSession {
  session.updatedAt = new Date().toISOString();
  activeStore.save(session);
  return session;
}

export function mergeSessionParameters(
  session: SizingAssistantSession,
  patch: Partial<SizingSessionParameters>,
): SizingAssistantSession {
  session.parameters = { ...session.parameters, ...patch };
  if (typeof patch.shard_penalty_multiplier === 'number') {
    session.shardPenaltyMultiplier = Math.max(1, patch.shard_penalty_multiplier);
  }
  return touchSession(session);
}

function isSizingParameterMissing(
  key: keyof SizingSessionParameters,
  params: SizingSessionParameters,
): boolean {
  const value = params[key];
  if (value === undefined || value === null) return true;
  if (key === 'workload_type') {
    return typeof value !== 'string' || value.length === 0;
  }
  if (key === 'target_availability_sla' || key === 'cloud_provider') {
    return typeof value !== 'string' || value.trim().length === 0;
  }
  if (key === 'target_regions') {
    return !Array.isArray(value) || value.length === 0;
  }
  if (typeof value === 'boolean') {
    return false;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return true;
  if (key === 'data_compression_percentage' || key === 'geo_sharded_regions_required') {
    return false;
  }
  if (key === 'active_working_set_percentage') {
    return value <= 0;
  }
  return value <= 0;
}

/** Apply patch fields only where the session does not already have a positive value. */
export function mergeSessionParametersIfMissing(
  session: SizingAssistantSession,
  patch: Partial<SizingSessionParameters>,
): { session: SizingAssistantSession; appliedKeys: string[] } {
  const appliedKeys: string[] = [];
  const next: Partial<SizingSessionParameters> = {};
  for (const [rawKey, value] of Object.entries(patch)) {
    const key = rawKey as keyof SizingSessionParameters;
    if (value === undefined) continue;
    if (isSizingParameterMissing(key, session.parameters)) {
      next[key] = value as SizingSessionParameters[typeof key];
      appliedKeys.push(rawKey);
    }
  }
  if (appliedKeys.length === 0) {
    return { session, appliedKeys };
  }
  return { session: mergeSessionParameters(session, next), appliedKeys };
}

export function setResourceCuratorHandoff(
  session: SizingAssistantSession,
  status: ResourceCuratorHandoffStatus,
): SizingAssistantSession {
  session.resourceCuratorHandoff = status;
  return touchSession(session);
}

export function appendChatMessages(
  session: SizingAssistantSession,
  messages: CopilotChatMessage[],
): SizingAssistantSession {
  session.chatMessages.push(...messages.map((message) => structuredClone(message)));
  return touchSession(session);
}

export function resetSizingSession(session: SizingAssistantSession): SizingAssistantSession {
  session.aborted = false;
  session.parameters = {};
  session.shardPenaltyMultiplier = DEFAULT_SHARD_PENALTY_MULTIPLIER;
  session.resourceCuratorHandoff = 'not_started';
  session.transcripts = [];
  session.chatMessages = [];
  return touchSession(session);
}
