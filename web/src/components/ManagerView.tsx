import { useMemo } from 'react';
import { ResizableSplit } from './ResizableSplit';
import { SchemaPhaseToggle } from './SchemaPhaseToggle';
import type { SchemaPhase } from './SchemaPhaseToggle';
import { ManagerSchemaCanvas } from './ManagerSchemaCanvas';
import { ManagerSidebar } from './ManagerSidebar';
import { ManagerStatusBar } from './ManagerStatusBar';
import {
  buildBusinessDomains,
  computeManagerMilestone,
  computeMigrationProgress,
} from '../managerDashboard';
import type { MigrationArtifacts } from '../sessionState';
import type { MigrationPlan } from '../migrationPlanTypes';
import type { SqlStructuralModel } from '../types';

type ManagerViewProps = {
  model: SqlStructuralModel | null;
  migrationPlan: MigrationPlan | null;
  migrationArtifacts: MigrationArtifacts | null;
  schemaPhase: SchemaPhase;
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  onSchemaPhaseChange: (phase: SchemaPhase) => void;
  onRunPipeline: () => void;
  onGenerateReport: () => void;
  onSignOffExport: () => void;
  onOpenMigrationView: () => void;
  exporting: boolean;
  statusMessage: string;
  pipelineOpen: boolean;
  profileInfo: { label: string; readPercent: number; writePercent: number } | null;
};

export function ManagerView({
  model,
  migrationPlan,
  migrationArtifacts,
  schemaPhase,
  sidebarWidth,
  onSidebarWidthChange,
  onSchemaPhaseChange,
  onRunPipeline,
  onGenerateReport,
  onSignOffExport,
  onOpenMigrationView,
  exporting,
  statusMessage,
  pipelineOpen,
  profileInfo,
}: ManagerViewProps) {
  const domains = useMemo(
    () =>
      buildBusinessDomains(
        model,
        migrationPlan,
        schemaPhase,
        migrationArtifacts,
        migrationArtifacts?.transformationSummary,
      ),
    [model, migrationPlan, schemaPhase, migrationArtifacts],
  );

  const progress = useMemo(() => computeMigrationProgress(domains), [domains]);
  const milestone = useMemo(
    () => computeManagerMilestone(model, migrationPlan, migrationArtifacts, pipelineOpen),
    [model, migrationPlan, migrationArtifacts, pipelineOpen],
  );

  return (
    <ResizableSplit
      sidebarWidth={sidebarWidth}
      onSidebarWidthChange={onSidebarWidthChange}
      sidebar={
        <ManagerSidebar
          progress={progress}
          artifacts={migrationArtifacts}
          blockerCount={progress.blockedCount}
          reviewCount={progress.reviewCount}
          profileInfo={profileInfo}
        />
      }
      main={
        <div className="manager-main">
          <div className="manager-phase-bar">
            <SchemaPhaseToggle
              phase={schemaPhase}
              onChange={onSchemaPhaseChange}
              hasAfter={Boolean(migrationPlan)}
            />
            <div className="manager-phase-bar__actions">
              <button type="button" className="ghost" onClick={onRunPipeline} disabled={!model}>
                Run full pipeline
              </button>
              <button type="button" className="primary" onClick={onGenerateReport} disabled={!model || exporting}>
                {exporting ? 'Generating…' : 'Generate migration report'}
              </button>
              <button
                type="button"
                className="primary"
                onClick={onSignOffExport}
                disabled={!migrationPlan}
              >
                Sign off & export blueprint
              </button>
              {migrationArtifacts ? (
                <button type="button" className="ghost" onClick={onOpenMigrationView}>
                  Open full report
                </button>
              ) : null}
            </div>
          </div>
          <ManagerSchemaCanvas domains={domains} phase={schemaPhase} />
          <ManagerStatusBar milestone={milestone} statusMessage={statusMessage} />
        </div>
      }
    />
  );
}
