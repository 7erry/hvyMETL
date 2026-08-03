import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { SizingAssistantStudioSeedPayload } from '../../../src/copilot/sizingAssistantStudioSeed.ts';
import {
  createSizingAssistantSession,
  fetchSizingAssistantStatus,
  seedSizingAssistantSession,
  sendSizingAssistantChat,
  type SizingAssistantChatMessage,
} from '../api';

export type SizingAssistantUiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  markdown?: boolean;
  toolResults?: Array<{ tool: string; ok: boolean; summary: string }>;
};

type SizingAssistantContextValue = {
  sessionId: string | null;
  messages: SizingAssistantUiMessage[];
  status: 'idle' | 'loading';
  configured: boolean;
  model: string | null;
  parameters: Record<string, unknown>;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  resetSession: () => Promise<void>;
};

const SizingAssistantContext = createContext<SizingAssistantContextValue | null>(null);

function newMessageId(): string {
  return `sizing-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function SizingAssistantProvider({
  children,
  studioSeed,
}: {
  children: ReactNode;
  studioSeed?: SizingAssistantStudioSeedPayload | null;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SizingAssistantUiMessage[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading'>('idle');
  const [configured, setConfigured] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const studioSeedRef = useRef(studioSeed);
  studioSeedRef.current = studioSeed ?? null;

  useEffect(() => {
    void fetchSizingAssistantStatus()
      .then((result) => {
        setConfigured(result.configured);
        setModel(result.model);
      })
      .catch(() => {
        setConfigured(false);
        setModel(null);
      });
  }, []);

  const applySeedToSession = useCallback(async (activeSessionId: string) => {
    const seed = studioSeedRef.current;
    if (!seed) return;
    const seeded = await seedSizingAssistantSession(activeSessionId, seed);
    setParameters(seeded.parameters ?? {});
  }, []);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId;
    const created = await createSizingAssistantSession(studioSeedRef.current ?? undefined);
    setSessionId(created.sessionId);
    setParameters(created.parameters ?? {});
    return created.sessionId;
  }, [sessionId]);

  useEffect(() => {
    const seed = studioSeed;
    if (!seed || !sessionId) return;
    void applySeedToSession(sessionId);
  }, [sessionId, studioSeed, applySeedToSession]);

  const resetSession = useCallback(async () => {
    setMessages([]);
    setError(null);
    const created = await createSizingAssistantSession(studioSeedRef.current ?? undefined);
    setSessionId(created.sessionId);
    setParameters(created.parameters ?? {});
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status === 'loading') return;

      setError(null);
      setStatus('loading');

      const userMessage: SizingAssistantUiMessage = {
        id: newMessageId(),
        role: 'user',
        content: trimmed,
      };
      setMessages((prev) => [...prev, userMessage]);

      try {
        const activeSessionId = await ensureSession();
        const llmMessages: SizingAssistantChatMessage[] = [...messages, userMessage].map((message) => ({
          role: message.role,
          content: message.content,
        }));

        const response = await sendSizingAssistantChat({
          sessionId: activeSessionId,
          messages: llmMessages,
          studioSeed: studioSeedRef.current ?? undefined,
        });

        setParameters(response.parameters ?? {});
        const assistantMessage: SizingAssistantUiMessage = {
          id: newMessageId(),
          role: 'assistant',
          content: response.message.content?.trim() || summarizeToolResults(response.toolResults),
          markdown: true,
          toolResults: response.toolResults.length > 0 ? response.toolResults : undefined,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setMessages((prev) => [
          ...prev,
          {
            id: newMessageId(),
            role: 'assistant',
            content: `Sizing assistant error: ${message}`,
          },
        ]);
      } finally {
        setStatus('idle');
      }
    },
    [ensureSession, messages, status],
  );

  const value = useMemo(
    () => ({
      sessionId,
      messages,
      status,
      configured,
      model,
      parameters,
      error,
      sendMessage,
      resetSession,
    }),
    [sessionId, messages, status, configured, model, parameters, error, sendMessage, resetSession],
  );

  return <SizingAssistantContext.Provider value={value}>{children}</SizingAssistantContext.Provider>;
}

function summarizeToolResults(toolResults: Array<{ tool: string; ok: boolean; summary: string }>): string {
  if (toolResults.length === 0) return '';
  return toolResults.map((item) => `- **${item.tool}**: ${item.summary}`).join('\n');
}

export function useSizingAssistant(): SizingAssistantContextValue {
  const ctx = useContext(SizingAssistantContext);
  if (!ctx) {
    throw new Error('useSizingAssistant must be used within SizingAssistantProvider');
  }
  return ctx;
}

/** Optional hook when provider may be absent. */
export function useSizingAssistantOptional(): SizingAssistantContextValue | null {
  return useContext(SizingAssistantContext);
}
