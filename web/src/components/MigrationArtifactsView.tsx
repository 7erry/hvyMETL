import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  downloadJson,
  downloadText,
  fetchRepogenLanguages,
  generateRepositories,
  type RepogenLanguageOption,
} from '../api';
import type { MigrationArtifacts } from '../sessionState';

type ArtifactTab = {
  id: string;
  label: string;
  fileName: string;
  mime: string;
  content: string;
  isJson?: boolean;
  readOnly?: boolean;
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

  if (artifacts.repositories) {
    for (const file of artifacts.repositories.files) {
      tabs.push({
        id: `repo:${file.relativePath}`,
        label: file.relativePath,
        fileName: file.relativePath,
        mime: 'text/plain',
        content: file.content,
        readOnly: true,
      });
    }
  }

  return tabs;
}

export function MigrationArtifactsView({ artifacts, onChange, onBack }: MigrationArtifactsViewProps) {
  const tabs = useMemo(() => buildTabs(artifacts), [artifacts]);
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? 'plan');
  const [languages, setLanguages] = useState<RepogenLanguageOption[]>([]);
  const [repogenLanguage, setRepogenLanguage] = useState('node');
  const [generatingRepos, setGeneratingRepos] = useState(false);
  const [repogenError, setRepogenError] = useState('');

  useEffect(() => {
    void fetchRepogenLanguages()
      .then(setLanguages)
      .catch(() => setLanguages([]));
  }, []);

  useEffect(() => {
    if (artifacts.repositories?.language) {
      setRepogenLanguage(artifacts.repositories.language);
    }
  }, [artifacts.repositories?.language]);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const updateContent = (content: string) => {
    if (!active || active.readOnly) return;
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

  const handleDownloadRepositories = () => {
    if (!artifacts.repositories) return;
    for (const file of artifacts.repositories.files) {
      downloadText(file.relativePath, file.content, 'text/plain');
    }
  };

  const handleGenerateRepositories = useCallback(async () => {
    setGeneratingRepos(true);
    setRepogenError('');
    try {
      const result = await generateRepositories(artifacts.planJson, repogenLanguage);
      onChange({
        ...artifacts,
        repositories: {
          language: result.language,
          languageLabel: result.languageLabel,
          driverName: result.driverName,
          files: result.files,
          generatedAt: new Date().toISOString(),
        },
      });
      const firstRepoTab = result.files[0]?.relativePath;
      if (firstRepoTab) setActiveId(`repo:${firstRepoTab}`);
    } catch (e) {
      setRepogenError(String(e));
    } finally {
      setGeneratingRepos(false);
    }
  }, [artifacts, onChange, repogenLanguage]);

  return (
    <div className="migration-view">
      <div className="migration-toolbar">
        <button type="button" className="ghost" onClick={onBack}>
          ← Back to diagram
        </button>
        <span style={{ fontSize: '0.85rem', opacity: 0.85 }}>
          AI migration artifacts
          {artifacts.retrievalStrategy ? ` · RAG: ${artifacts.retrievalStrategy}` : ''}
          {artifacts.repositories
            ? ` · Repositories: ${artifacts.repositories.languageLabel} (${artifacts.repositories.driverName})`
            : ''}
        </span>
        <button type="button" className="primary" onClick={handleDownloadAll}>
          Download all
        </button>
      </div>

      <div className="repogen-bar panel">
        <label style={{ fontSize: '0.85rem' }}>
          Repository language
          <select
            value={repogenLanguage}
            onChange={(e) => setRepogenLanguage(e.target.value)}
            disabled={generatingRepos}
            aria-label="Repository language"
          >
            {languages.map((language) => (
              <option key={language.id} value={language.id}>
                {language.label} ({language.driverName})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="primary"
          onClick={() => void handleGenerateRepositories()}
          disabled={generatingRepos || !artifacts.planJson.trim()}
        >
          {generatingRepos ? 'Generating…' : artifacts.repositories ? 'Regenerate repositories' : 'Generate repositories'}
        </button>
        {artifacts.repositories ? (
          <button type="button" className="ghost" onClick={handleDownloadRepositories}>
            Download repositories
          </button>
        ) : null}
        {repogenError ? <span className="pipeline-error">{repogenError}</span> : null}
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
            readOnly={active?.readOnly}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
