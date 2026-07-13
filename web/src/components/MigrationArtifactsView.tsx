import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  downloadJson,
  downloadText,
  fetchRepogenLanguages,
  generateRepositories,
  type RepogenLanguageOption,
} from '../api';
import type { MigrationArtifacts } from '../sessionState';
import { ArtifactCodePanel } from './ArtifactCodePanel';
import { ApiArtifactsExplorer } from './ApiArtifactsExplorer';
import { CopyButton } from './CopyButton';
import { ResizableVerticalSplit } from './ResizableVerticalSplit';

type ArtifactTab = {
  id: string;
  label: string;
  fileName: string;
  mime: string;
  content: string;
  isJson?: boolean;
  readOnly?: boolean;
  group?: 'core' | 'prompt' | 'repo';
};

type MigrationArtifactsViewProps = {
  artifacts: MigrationArtifacts;
  onChange: (next: MigrationArtifacts) => void;
  onBack: () => void;
};

const DEFAULT_API_PANEL_HEIGHT = 300;
const COLLAPSED_API_PANEL_HEIGHT = 44;

function buildTabs(artifacts: MigrationArtifacts): ArtifactTab[] {
  const tabs: ArtifactTab[] = [
    {
      id: 'plan',
      label: 'Migration plan',
      fileName: 'migration-plan.json',
      mime: 'application/json',
      content: artifacts.planJson,
      isJson: true,
      group: 'core',
    },
    {
      id: 'report',
      label: 'Design report',
      fileName: 'design-report.md',
      mime: 'text/markdown',
      content: artifacts.designReportMarkdown,
      group: 'core',
    },
  ];

  for (const prompt of artifacts.prompts) {
    tabs.push({
      id: prompt.fileName,
      label: prompt.fileName.replace(/\.md$/, ''),
      fileName: prompt.fileName,
      mime: 'text/markdown',
      content: prompt.content,
      group: 'prompt',
    });
  }

  return tabs;
}

export function MigrationArtifactsView({ artifacts, onChange, onBack }: MigrationArtifactsViewProps) {
  const tabs = useMemo(() => buildTabs(artifacts), [artifacts]);
  const repoFiles = artifacts.repositories?.files ?? [];
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? 'plan');
  const [languages, setLanguages] = useState<RepogenLanguageOption[]>([]);
  const [repogenLanguage, setRepogenLanguage] = useState('node');
  const [generatingRepos, setGeneratingRepos] = useState(false);
  const [repogenError, setRepogenError] = useState('');
  const [apiPanelHeight, setApiPanelHeight] = useState(DEFAULT_API_PANEL_HEIGHT);
  const [apiPanelCollapsed, setApiPanelCollapsed] = useState(false);
  const [savedApiPanelHeight, setSavedApiPanelHeight] = useState(DEFAULT_API_PANEL_HEIGHT);

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

  const active = useMemo((): ArtifactTab | undefined => {
    if (activeId.startsWith('repo:')) {
      const path = activeId.slice(5);
      const file = repoFiles.find((entry) => entry.relativePath === path);
      if (file) {
        return {
          id: activeId,
          label: file.relativePath,
          fileName: file.relativePath,
          mime: 'text/plain',
          content: file.content,
          readOnly: true,
          group: 'repo',
        };
      }
    }
    return tabs.find((t) => t.id === activeId) ?? tabs[0];
  }, [activeId, repoFiles, tabs]);

  const coreTabs = tabs.filter((t) => t.group === 'core');
  const promptTabs = tabs.filter((t) => t.group === 'prompt');
  const isRepoView = active?.group === 'repo';
  const selectedRepoPath = isRepoView ? active.fileName : '';

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
    handleDownloadRepositories();
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

  const toggleApiPanel = () => {
    if (apiPanelCollapsed) {
      setApiPanelCollapsed(false);
      setApiPanelHeight(savedApiPanelHeight);
    } else {
      setSavedApiPanelHeight(apiPanelHeight);
      setApiPanelCollapsed(true);
      setApiPanelHeight(COLLAPSED_API_PANEL_HEIGHT);
    }
  };

  const handleApiPanelHeightChange = (height: number) => {
    setApiPanelHeight(height);
    if (!apiPanelCollapsed) {
      setSavedApiPanelHeight(height);
    }
  };

  const metaParts = [
    artifacts.retrievalStrategy ? `RAG: ${artifacts.retrievalStrategy}` : null,
    artifacts.repositories
      ? `Repos: ${artifacts.repositories.languageLabel}`
      : null,
  ].filter(Boolean);

  return (
    <div className="migration-view">
      <header className="migration-toolbar migration-toolbar--compact">
        <div className="migration-toolbar__start">
          <button type="button" className="tertiary" onClick={onBack}>
            Back to dashboard
          </button>
          <div className="migration-toolbar__title">
            <h2>Migration export</h2>
            {metaParts.length > 0 ? (
              <span className="migration-toolbar__meta">{metaParts.join(' · ')}</span>
            ) : null}
          </div>
        </div>
        <div className="migration-toolbar__actions">
          <label className="migration-toolbar__field">
            <span>Repository language</span>
            <select
              value={repogenLanguage}
              onChange={(e) => setRepogenLanguage(e.target.value)}
              disabled={generatingRepos}
              aria-label="Repository language"
            >
              {languages.map((language) => (
                <option key={language.id} value={language.id}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() => void handleGenerateRepositories()}
            disabled={generatingRepos || !artifacts.planJson.trim()}
          >
            {generatingRepos ? 'Generating…' : artifacts.repositories ? 'Regenerate repos' : 'Generate repos'}
          </button>
          {artifacts.repositories ? (
            <button type="button" className="secondary" onClick={handleDownloadRepositories}>
              Download repos
            </button>
          ) : null}
          <button type="button" className="primary" onClick={handleDownloadAll}>
            Download all
          </button>
        </div>
      </header>

      {repogenError ? <p className="pipeline-error migration-toolbar-error">{repogenError}</p> : null}

      <div className="migration-content">
        <ResizableVerticalSplit
          bottomHeight={apiPanelHeight}
          onBottomHeightChange={handleApiPanelHeightChange}
          minBottom={apiPanelCollapsed ? COLLAPSED_API_PANEL_HEIGHT : 160}
          minTop={220}
          top={
            <div className="artifact-pane">
              <nav className="artifact-tabs artifact-tabs--horizontal" aria-label="Source files">
                {coreTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={tab.id === activeId ? 'active' : ''}
                    onClick={() => setActiveId(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
                {promptTabs.length > 0 ? (
                  <span className="artifact-tabs__divider" aria-hidden="true" />
                ) : null}
                {promptTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`artifact-tab--secondary${tab.id === activeId ? ' active' : ''}`}
                    onClick={() => setActiveId(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              <div className="artifact-editor">
                <div className="artifact-editor-header">
                  <div className="artifact-editor-header__left">
                    {repoFiles.length > 0 ? (
                      <label className="api-artifacts-inline-field artifact-repo-select">
                        <span className="api-artifacts-inline-field__label">Generated source</span>
                        <select
                          value={selectedRepoPath}
                          onChange={(e) => {
                            const path = e.target.value;
                            if (path) setActiveId(`repo:${path}`);
                          }}
                          aria-label="Generated repository source file"
                        >
                          <option value="" disabled>
                            Select file…
                          </option>
                          {repoFiles.map((file) => (
                            <option key={file.relativePath} value={file.relativePath}>
                              {file.relativePath}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {!isRepoView ? <code>{active?.fileName}</code> : null}
                  </div>
                  <div className="artifact-editor-header__actions">
                    <CopyButton text={active?.content ?? ''} label="Copy code" />
                    <button type="button" className="tertiary" onClick={handleDownload} disabled={!active}>
                      Download file
                    </button>
                  </div>
                </div>
                <ArtifactCodePanel
                  value={active?.content ?? ''}
                  fileName={active?.fileName ?? 'artifact.txt'}
                  mime={active?.mime ?? 'text/plain'}
                  isJson={active?.isJson}
                  readOnly={active?.readOnly}
                  onChange={active?.readOnly ? undefined : updateContent}
                />
              </div>
            </div>
          }
          bottom={
            <ApiArtifactsExplorer
              initialBundle={artifacts.apiArtifacts}
              collapsed={apiPanelCollapsed}
              onToggleCollapse={toggleApiPanel}
            />
          }
        />
      </div>
    </div>
  );
}
