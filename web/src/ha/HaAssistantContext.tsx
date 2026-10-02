import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import {
  buildAtlasClusterCreateRequest,
  summarizeHaTopology,
  type HaClusterInputs,
} from '../../../src/atlas/atlasClusterTopology.ts';
import { buildAtlasHaArtifactBundle } from '../../../src/atlas/atlasHaExport.ts';
import { downloadText } from '../api';

export type HaAssistantContextValue = {
  inputs: HaClusterInputs;
  onChange: (next: HaClusterInputs) => void;
  jsonPreview: string;
  summary: ReturnType<typeof summarizeHaTopology>;
  downloadHaPack: () => void;
  applyQuickPrompt: (promptId: HaQuickPromptId) => void;
};

export type HaQuickPromptId = 'quorum5' | 'readReplicas';

const HaAssistantContext = createContext<HaAssistantContextValue | null>(null);

type HaAssistantProviderProps = {
  children: ReactNode;
  inputs: HaClusterInputs;
  onChange: (next: HaClusterInputs) => void;
};

export function HaAssistantProvider({ children, inputs, onChange }: HaAssistantProviderProps) {
  const payload = useMemo(() => buildAtlasClusterCreateRequest(inputs), [inputs]);
  const jsonPreview = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const summary = useMemo(() => summarizeHaTopology(inputs), [inputs]);

  const downloadHaPack = useCallback(() => {
    const bundle = buildAtlasHaArtifactBundle(inputs);
    downloadText('atlas-ha-provisioning-guide.md', bundle.provisioningGuideMd, 'text/markdown');
    downloadText('atlas-cluster-create.json', bundle.clusterCreateJson, 'application/json');
  }, [inputs]);

  const applyQuickPrompt = useCallback(
    (promptId: HaQuickPromptId) => {
      if (promptId === 'quorum5' && inputs.electableNodeCount !== 5) {
        onChange({ ...inputs, electableNodeCount: 5 });
      }
      if (promptId === 'readReplicas' && inputs.readOnlyReplicasPerRegion === 0) {
        onChange({ ...inputs, readOnlyReplicasPerRegion: 1 });
      }
    },
    [inputs, onChange],
  );

  const value = useMemo(
    (): HaAssistantContextValue => ({
      inputs,
      onChange,
      jsonPreview,
      summary,
      downloadHaPack,
      applyQuickPrompt,
    }),
    [inputs, onChange, jsonPreview, summary, downloadHaPack, applyQuickPrompt],
  );

  return <HaAssistantContext.Provider value={value}>{children}</HaAssistantContext.Provider>;
}

export function useHaAssistant(): HaAssistantContextValue {
  const ctx = useContext(HaAssistantContext);
  if (!ctx) {
    throw new Error('useHaAssistant must be used within HaAssistantProvider');
  }
  return ctx;
}
