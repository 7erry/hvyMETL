import { useMemo, useState, useEffect } from 'react';
import { ResizableSplit } from './ResizableSplit';
import { SchemaPhaseToggle } from './SchemaPhaseToggle';
import type { SchemaPhase } from './SchemaPhaseToggle';
import { ManagerSchemaCanvas } from './ManagerSchemaCanvas';
import { ManagerSidebar } from './ManagerSidebar';
import { ManagerStatusBar } from './ManagerStatusBar';
import { ManagerReviewModal } from './ManagerReviewModal';
import {
  buildBusinessDomains,
  computeManagerMilestone,
  computeMigrationProgress,
} from '../managerDashboard';
import {
  acceptAllCollectionReviews,
  acceptCollectionReview,
  buildCollectionReviewItems,
  rejectTableReview,
} from '../managerReview';
import type { ManagerReviewAcceptances, ManagerCostInputs, MigrationArtifacts } from '../sessionState';
import type { MigrationPlan } from '../migrationPlanTypes';
import type { Dialect, SqlStructuralModel } from '../types';

const MANAGER_SIDEBAR_MIN_WIDTH = 460;
const MANAGER_SIDEBAR_MAX_WIDTH = 780;

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
  onReviewAcceptancesChange: (acceptances: ManagerReviewAcceptances) => void;
  managerReviewAcceptances: ManagerReviewAcceptances | null;
  managerCostInputs: ManagerCostInputs;
  onManagerCostInputsChange: (inputs: ManagerCostInputs) => void;
  dialects: Dialect[];
  dialect: string;
  ddl: string;
  apiConnected: boolean;
  onDialectChange: (dialect: string) => void;
  onDdlChange: (ddl: string) => void;
  onImportQuery: () => void;
  onSchemaFile: (file: File) => void;
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
  onReviewAcceptancesChange,
  managerReviewAcceptances,
  managerCostInputs,
  onManagerCostInputsChange,
  dialects,
  dialect,
  ddl,
  apiConnected,
  onDialectChange,
  onDdlChange,
  onImportQuery,
  onSchemaFile,
  exporting,
  statusMessage,
  pipelineOpen,
  profileInfo,
}: ManagerViewProps) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [focusCollection, setFocusCollection] = useState<string | null>(null);

  const reviewItems = useMemo(
    () =>
      buildCollectionReviewItems(
        migrationPlan,
        migrationArtifacts?.transformationSummary,
        managerReviewAcceptances,
      ),
    [migrationPlan, migrationArtifacts?.transformationSummary, managerReviewAcceptances],
  );

  const pendingReviewCount = useMemo(
    () => reviewItems.filter((item) => !item.resolved).length,
    [reviewItems],
  );

  useEffect(() => {
    if (schemaPhase !== 'after' || pendingReviewCount === 0) {
      setReviewOpen(false);
      setFocusCollection(null);
    }
  }, [pendingReviewCount, schemaPhase]);

  const showReviewActions = schemaPhase === 'after' && pendingReviewCount > 0;

  const domains = useMemo(
    () =>
      buildBusinessDomains(
        model,
        migrationPlan,
        schemaPhase,
        migrationArtifacts,
        migrationArtifacts?.transformationSummary,
        managerReviewAcceptances,
      ),
    [model, migrationPlan, schemaPhase, migrationArtifacts, managerReviewAcceptances],
  );

  const progress = useMemo(() => computeMigrationProgress(domains), [domains]);
  const milestone = useMemo(
    () =>
      computeManagerMilestone(
        model,
        migrationPlan,
        migrationArtifacts,
        pipelineOpen,
        managerReviewAcceptances,
      ),
    [model, migrationPlan, migrationArtifacts, pipelineOpen, managerReviewAcceptances],
  );

  const openReview = (collectionName?: string) => {
    setFocusCollection(collectionName ?? null);
    setReviewOpen(true);
  };

  const handleAcceptReview = (collectionName: string) => {
    if (!migrationPlan?.generatedAt) return;
    onReviewAcceptancesChange(
      acceptCollectionReview(managerReviewAcceptances, migrationPlan.generatedAt, collectionName),
    );
  };

  const handleAcceptAllReviews = () => {
    if (!migrationPlan?.generatedAt) return;
    const pendingNames = reviewItems.filter((item) => !item.resolved).map((item) => item.collectionName);
    onReviewAcceptancesChange(
      acceptAllCollectionReviews(managerReviewAcceptances, migrationPlan.generatedAt, pendingNames),
    );
  };

  const handleRejectTableReview = (collectionName: string, tableName: string, reason: string) => {
    if (!migrationPlan?.generatedAt) return;
    onReviewAcceptancesChange(
      rejectTableReview(managerReviewAcceptances, migrationPlan.generatedAt, collectionName, tableName, reason),
    );
  };

  return (
    <>
      <ResizableSplit
        sidebarWidth={Math.max(sidebarWidth, MANAGER_SIDEBAR_MIN_WIDTH)}
        minWidth={MANAGER_SIDEBAR_MIN_WIDTH}
        maxWidth={MANAGER_SIDEBAR_MAX_WIDTH}
        stackedSidebarMode={!model ? 'import' : 'default'}
        onSidebarWidthChange={onSidebarWidthChange}
        sidebar={
          <ManagerSidebar
            model={model}
            migrationPlan={migrationPlan}
            progress={progress}
            artifacts={migrationArtifacts}
            blockerCount={progress.blockedCount}
            reviewCount={pendingReviewCount}
            profileInfo={profileInfo}
            managerCostInputs={managerCostInputs}
            onManagerCostInputsChange={onManagerCostInputsChange}
            dialects={dialects}
            dialect={dialect}
            ddl={ddl}
            apiConnected={apiConnected}
            onDialectChange={onDialectChange}
            onDdlChange={onDdlChange}
            onImportQuery={onImportQuery}
            onSchemaFile={onSchemaFile}
            onOpenReview={() => openReview()}
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
                {showReviewActions ? (
                  <button type="button" className="primary" onClick={() => openReview()}>
                    Review {pendingReviewCount} change{pendingReviewCount === 1 ? '' : 's'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={showReviewActions ? 'secondary' : 'primary'}
                  onClick={onRunPipeline}
                  disabled={!model}
                >
                  Run pipeline
                </button>
                <button type="button" className="secondary" onClick={onGenerateReport} disabled={!model || exporting}>
                  {exporting ? 'Generating…' : 'Generate report'}
                </button>
                <button type="button" className="secondary" onClick={onSignOffExport} disabled={!migrationPlan}>
                  Sign off export
                </button>
                {migrationArtifacts ? (
                  <button type="button" className="tertiary" onClick={onOpenMigrationView}>
                    View full report
                  </button>
                ) : null}
              </div>
            </div>
            <ManagerSchemaCanvas
              domains={domains}
              phase={schemaPhase}
              onReviewEntity={
                showReviewActions
                  ? (entityId) => {
                      const entity = domains.flatMap((d) => d.entities).find((e) => e.id === entityId);
                      if (entity?.status === 'review') openReview(entityId);
                    }
                  : undefined
              }
            />
            <ManagerStatusBar milestone={milestone} statusMessage={statusMessage} schemaPhase={schemaPhase} />
          </div>
        }
      />

      <ManagerReviewModal
        open={reviewOpen}
        items={reviewItems}
        onClose={() => {
          setReviewOpen(false);
          setFocusCollection(null);
        }}
        onAccept={handleAcceptReview}
        onAcceptAll={handleAcceptAllReviews}
        onRejectTable={handleRejectTableReview}
        focusCollectionName={focusCollection}
      />
    </>
  );
}
