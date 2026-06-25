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
} from '../managerReview';
import type { ManagerReviewAcceptances, MigrationArtifacts } from '../sessionState';
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
  onReviewAcceptancesChange: (acceptances: ManagerReviewAcceptances) => void;
  managerReviewAcceptances: ManagerReviewAcceptances | null;
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
    () => reviewItems.filter((item) => !item.accepted).length,
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
    const pendingNames = reviewItems.filter((item) => !item.accepted).map((item) => item.collectionName);
    onReviewAcceptancesChange(
      acceptAllCollectionReviews(managerReviewAcceptances, migrationPlan.generatedAt, pendingNames),
    );
  };

  return (
    <>
      <ResizableSplit
        sidebarWidth={sidebarWidth}
        onSidebarWidthChange={onSidebarWidthChange}
        sidebar={
          <ManagerSidebar
            progress={progress}
            artifacts={migrationArtifacts}
            blockerCount={progress.blockedCount}
            reviewCount={pendingReviewCount}
            profileInfo={profileInfo}
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
                    Review {pendingReviewCount} collection{pendingReviewCount === 1 ? '' : 's'}
                  </button>
                ) : null}
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
            <ManagerStatusBar milestone={milestone} statusMessage={statusMessage} />
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
        focusCollectionName={focusCollection}
      />
    </>
  );
}
