import { useMemo, useState } from 'react';
import { downloadJson, downloadText } from '../api';
import type { MigrationArtifacts } from '../sessionState';

type ArtifactTab = {
  id: string;
  label: string;
  fileName: string;
  mime: string;
  content: string;
  isJson?: boolean;
};

type MigrationArtifactsViewProps = {
  artifacts: MigrationArtifacts;
  onChange: (next: MigrationArtifacts) => void;
  onBack: () => void;
};

function buildTabs(artifacts: MigrationArtifacts): ArtifactTab[] {
  const tabs: ArtifactTab[] = [
    {
      id: 'plan',
      label: 'Migration plan',
      fileName: 'migration-plan.json',
      mime: 'application/json',
      content: artifacts.planJson,
      isJson: true,
    },
    {
      id: 'report',
      label: 'Design report',
      fileName: 'design-report.md',
      mime: 'text/markdown',
      content: artifacts.designReportMarkdown,
    },
  ];
  for (const prompt of artifacts.prompts) {
    tabs.push({
      id: prompt.fileName,
      label: prompt.fileName.replace(/\.md$/, ''),
      fileName: prompt.fileName,
      mime: 'text/markdown',
      content: prompt.content,
    });
  }
  return tabs;
}

export function MigrationArtifactsView({ artifacts, onChange, onBack }: MigrationArtifactsViewProps) {
  const tabs = useMemo(() => buildTabs(artifacts), [artifacts]);
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? 'plan');

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const updateContent = (content: string) => {
    if (!active) return;
    if (active.id === 'plan') {
      onChange({ ...artifacts, planJson: content });
      return;
    }
    if (active.id === 'report') {
      onChange({ ...artifacts, designReportMarkdown: content });
      return;
    }
    onChange({
      ...artifacts,
      prompts: artifacts.prompts.map((p) => (p.fileName === active.fileName ? { ...p, content } : p)),
    });
  };

  const handleDownload = () => {
    if (!active) return;
    if (active.isJson) {
      try {
        downloadJson(active.fileName, JSON.parse(active.content));
      } catch {
        downloadText(active.fileName, active.content, active.mime);
      }
      return;
    }
    downloadText(active.fileName, active.content, active.mime);
  };

  const handleDownloadAll = () => {
    for (const tab of tabs) {
      if (tab.isJson) {
        try {
          downloadJson(tab.fileName, JSON.parse(tab.content));
        } catch {
          downloadText(tab.fileName, tab.content, tab.mime);
        }
      } else {
        downloadText(tab.fileName, tab.content, tab.mime);
      }
    }
  };

  return (
    <div className="migration-view">
      <div className="migration-toolbar">
        <button type="button" className="ghost" onClick={onBack}>
          ← Back to diagram
        </button>
        <span style={{ fontSize: '0.85rem', opacity: 0.85 }}>
          AI migration artifacts
          {artifacts.retrievalStrategy ? ` · RAG: ${artifacts.retrievalStrategy}` : ''}
        </span>
        <button type="button" className="primary" onClick={handleDownloadAll}>
          Download all
        </button>
      </div>

      <div className="migration-body">
        <nav className="artifact-tabs" aria-label="Migration artifacts">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.id === activeId ? 'active' : ''}
              onClick={() => setActiveId(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="artifact-editor">
          <div className="artifact-editor-header">
            <code>{active?.fileName}</code>
            <button type="button" className="primary" onClick={handleDownload} disabled={!active}>
              Download
            </button>
          </div>
          <textarea
            className="artifact-textarea"
            value={active?.content ?? ''}
            onChange={(e) => updateContent(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
