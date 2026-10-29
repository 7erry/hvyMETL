import type { LocaleId } from './locales';

/** Studio UI strings. Deep panel copy can adopt these keys incrementally. */
export type MessageKey =
  | 'nav.primary'
  | 'nav.database'
  | 'nav.schema'
  | 'nav.sizing'
  | 'nav.shell'
  | 'nav.aggregation'
  | 'nav.copilot'
  | 'nav.roles'
  | 'nav.settings'
  | 'language.label'
  | 'common.cancel'
  | 'common.close'
  | 'common.save'
  | 'common.loading'
  | 'common.error'
  | 'common.signIn'
  | 'common.signOut'
  | 'common.signInAgain'
  | 'auth.loadingTitle'
  | 'auth.loadingBody'
  | 'auth.expiredTitle'
  | 'auth.welcomeTitle'
  | 'auth.welcomeBody'
  | 'auth.pendingTitle'
  | 'auth.pendingBody'
  | 'auth.terms'
  | 'consent.bannerTitle'
  | 'consent.bannerBody'
  | 'consent.acceptAll'
  | 'consent.rejectOptional'
  | 'consent.customize'
  | 'consent.prefsTitle'
  | 'consent.regimeOptIn'
  | 'consent.regimeOptOut'
  | 'consent.necessaryTitle'
  | 'consent.necessaryDetail'
  | 'consent.functionalTitle'
  | 'consent.functionalDetail'
  | 'consent.analyticsTitle'
  | 'consent.analyticsDetail'
  | 'consent.marketingTitle'
  | 'consent.marketingDetail'
  | 'consent.savePrefs'
  | 'consent.prefsLink'
  | 'schema.title'
  | 'schema.pasteHint'
  | 'schema.pastePlaceholder'
  | 'schema.import'
  | 'schema.loadExample'
  | 'schema.dropHint'
  | 'schema.detected'
  | 'schema.liveTitle'
  | 'schema.modalTitle'
  | 'schema.modalSubtitle'
  | 'schema.modalClose'
  | 'live.agentHint'
  | 'live.agentPlatform'
  | 'live.chooseComputer'
  | 'live.download'
  | 'live.engine'
  | 'live.uri'
  | 'live.database'
  | 'live.copyCommand'
  | 'live.importLive'
  | 'live.reading'
  | 'live.engine.mongodb'
  | 'live.engine.postgresql'
  | 'live.engine.mysql'
  | 'live.engine.mssql'
  | 'live.engine.sqlite'
  | 'pipeline.title'
  | 'pipeline.run'
  | 'pipeline.csv'
  | 'manager.title'
  | 'shell.title'
  | 'aggregation.title'
  | 'aggregation.stages'
  | 'aggregation.pipeline'
  | 'aggregation.stageCount'
  | 'aggregation.searchStages'
  | 'aggregation.catFilter'
  | 'aggregation.catTransform'
  | 'aggregation.catJoins'
  | 'aggregation.addHint'
  | 'aggregation.form'
  | 'aggregation.json'
  | 'aggregation.jsonOnlyHint'
  | 'aggregation.selectStage'
  | 'aggregation.tabResults'
  | 'aggregation.tabPreview'
  | 'aggregation.tabCode'
  | 'aggregation.input'
  | 'aggregation.output'
  | 'aggregation.run'
  | 'aggregation.runHint'
  | 'copilot.title'
  | 'copilot.open'
  | 'status.ready'
  | 'footer.apiConnected'
  | 'footer.apiDisconnected'
  | 'workflow.aria'
  | 'workflow.importDdl'
  | 'workflow.beforeSql'
  | 'workflow.afterMongo'
  | 'workflow.afterTitleReady'
  | 'workflow.afterTitleNeedPlan'
  | 'workflow.export'
  | 'workflow.exporting'
  | 'workflow.runPipeline'
  | 'phase.aria'
  | 'view.aria'
  | 'view.label'
  | 'view.stacked'
  | 'view.stackedTitle'
  | 'view.sideBySide'
  | 'view.sideBySideTitle'
  | 'view.relTitle'
  | 'view.mdbTitle'
  | 'sidebar.schemaImport'
  | 'sidebar.embedOverrides'
  | 'sidebar.timeSeries'
  | 'sidebar.sqlTables'
  | 'sidebar.snapToGrid'
  | 'sidebar.mongoTarget'
  | 'sidebar.mongoTargetHint'
  | 'sidebar.mongoCsvHint'
  | 'sidebar.chooseCsvs'
  | 'sidebar.refreshDesign'
  | 'sidebar.designing'
  | 'sidebar.downloadPlan'
  | 'sidebar.planPlaceholder'
  | 'sidebar.transformation'
  | 'sidebar.transformationEmpty'
  | 'sidebar.transformationRefresh'
  | 'sidebar.transformationUpdating'
  | 'sidebar.transformationProfile'
  | 'sidebar.yes'
  | 'sidebar.no'
  | 'sidebar.csvEnriched'
  | 'sidebar.perCollection'
  | 'sidebar.schemaVersioningOnly'
  | 'sidebar.embedsPrefix'
  | 'sidebar.embedOverridesLink'
  | 'sidebar.sizingTitle'
  | 'sidebar.sizingEmpty'
  | 'sidebar.sizingIntro'
  | 'sidebar.datasetScale'
  | 'sidebar.workloadType'
  | 'sidebar.workloadReadHeavy'
  | 'sidebar.workloadReadHeavyHint'
  | 'sidebar.workloadBalanced'
  | 'sidebar.workloadBalancedHint'
  | 'sidebar.workloadWriteHeavy'
  | 'sidebar.workloadWriteHeavyHint'
  | 'sidebar.dataGrowth'
  | 'sidebar.yoy'
  | 'sidebar.sliderNote'
  | 'sidebar.schemaStatsNote'
  | 'sidebar.rawRecommendedAria'
  | 'sidebar.archiveByCollection'
  | 'sidebar.eligibleCollections'
  | 'sidebar.eligibleCollection'
  | 'sidebar.archiveRetainHint'
  | 'sidebar.recommended'
  | 'sidebar.available'
  | 'sidebar.dateField'
  | 'sidebar.hotRetention'
  | 'sidebar.years'
  | 'sidebar.archivePartitionHint'
  | 'sidebar.recommendedTier'
  | 'sidebar.targetWorkloadProfile'
  | 'sidebar.recommendedTierLabel'
  | 'sidebar.maxConnections'
  | 'sidebar.datasetSizeEst'
  | 'sidebar.planningStorage'
  | 'sidebar.exceedsReplicaSet'
  | 'sidebar.inclGrowth'
  | 'sidebar.targetRam'
  | 'sidebar.avgDocSize'
  | 'sidebar.workingSetFits'
  | 'sidebar.atlasTierReference'
  | 'sidebar.tierCol'
  | 'sidebar.vcpuCol'
  | 'sidebar.ramCol'
  | 'sidebar.storageScaleCol'
  | 'sidebar.maxConnCol'
  | 'sidebar.shardingTitle'
  | 'sidebar.shardingCollections'
  | 'sidebar.shardingHeader'
  | 'sidebar.shardingIntro'
  | 'sidebar.shardingDocs'
  | 'sidebar.shardingBestPractices'
  | 'sidebar.collectionCol'
  | 'sidebar.hotStorageCol'
  | 'sidebar.shardKeyCol'
  | 'sidebar.strategyCol'
  | 'sidebar.supportingIndexCol'
  | 'sidebar.mongoCollections'
  | 'sidebar.shareDiagram'
  | 'sidebar.shareSqlHint'
  | 'sidebar.shareMongoHint'
  | 'sidebar.exportDiagram'
  | 'sidebar.importDiagram'
  | 'sidebar.pipelineHistory'
  | 'sidebar.session'
  | 'sidebar.sessionHint'
  | 'sidebar.clearSession'
  | 'header.signOut'
  | 'header.terms';

export type MessageCatalog = Record<MessageKey, string>;

const en: MessageCatalog = {
  'nav.primary': 'Primary',
  'nav.database': 'Database',
  'nav.schema': 'Schema',
  'nav.sizing': 'Sizing',
  'nav.shell': 'Shell',
  'nav.aggregation': 'Aggregate',
  'nav.copilot': 'Copilot',
  'nav.roles': 'Roles',
  'nav.settings': 'Settings',
  'language.label': 'Language',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.loading': 'Loading…',
  'common.error': 'Something went wrong.',
  'common.signIn': 'Sign in',
  'common.signOut': 'Sign out',
  'common.signInAgain': 'Sign in again',
  'auth.loadingTitle': 'Loading hvyMETL Studio…',
  'auth.loadingBody': 'Checking your sign-in session.',
  'auth.expiredTitle': 'Session expired',
  'auth.welcomeTitle': 'Welcome to hvyMETL Studio',
  'auth.welcomeBody':
    'Sign in at hvymetl.studio with Google, Facebook, or your organization account to access migration design, manager review, and pipeline tools.',
  'auth.pendingTitle': 'Access pending',
  'auth.pendingBody':
    'Your account is signed in, but it does not have the admin, developer, or manager role yet.',
  'auth.terms': 'Terms and Conditions',
  'consent.bannerTitle': 'Cookies and local storage',
  'consent.bannerBody':
    'We use local storage for your session and optional cookies for preferences, analytics, and marketing.',
  'consent.acceptAll': 'Accept all',
  'consent.rejectOptional': 'Reject optional',
  'consent.customize': 'Customize',
  'consent.prefsTitle': 'Privacy preferences',
  'consent.regimeOptIn':
    'Your browser looks like a region that requires opt-in, so optional categories stay off until you accept.',
  'consent.regimeOptOut':
    'Your browser looks like a US region. You can opt out of analytics and marketing at any time.',
  'consent.necessaryTitle': 'Strictly necessary',
  'consent.necessaryDetail': 'Keeps the studio session and this consent choice in local storage. Always on.',
  'consent.functionalTitle': 'Functional',
  'consent.functionalDetail': 'Remembers studio preferences on this browser.',
  'consent.analyticsTitle': 'Analytics',
  'consent.analyticsDetail': 'Platform telemetry about how the studio is used.',
  'consent.marketingTitle': 'Marketing',
  'consent.marketingDetail': 'Measurement used to reach you about hvyMETL. Off when Global Privacy Control is on.',
  'consent.savePrefs': 'Save preferences',
  'consent.prefsLink': 'Cookie Preferences',
  'schema.title': 'Schema import',
  'schema.pasteHint': 'Paste DDL, JSON Schema, DynamoDB, or MongoDB JSON. Drop CSV, SQLite, or schema files here.',
  'schema.pastePlaceholder': 'Drop/Paste…',
  'schema.import': 'Import schema',
  'schema.loadExample': 'Load example',
  'schema.dropHint': 'Drop files to import',
  'schema.detected': 'Detected',
  'schema.liveTitle': 'Live database',
  'schema.modalTitle': 'Start with schema import',
  'schema.modalSubtitle':
    'Paste a schema, upload a file, or connect to a live database. hvyMETL builds the source model before design, cost, or ETL.',
  'schema.modalClose': 'Close schema import dialog',
  'live.agentHint':
    'hvymetl.studio cannot open a database on your computer. Download the agent, copy the command, and paste it in a terminal on the computer that has the database. The agent opens an outbound WebSocket, reads schema, and can stream a full extract. On Windows, use PowerShell.',
  'live.agentPlatform': 'Agent for this computer',
  'live.chooseComputer': 'Choose your computer…',
  'live.download': 'Download',
  'live.engine': 'Database type',
  'live.uri': 'Connection URI',
  'live.database': 'Database',
  'live.copyCommand': 'Copy command',
  'live.importLive': 'Import live data',
  'live.reading': 'Reading…',
  'live.engine.mongodb': 'MongoDB',
  'live.engine.postgresql': 'PostgreSQL',
  'live.engine.mysql': 'MySQL',
  'live.engine.mssql': 'Microsoft SQL Server',
  'live.engine.sqlite': 'SQLite',
  'pipeline.title': 'Pipeline',
  'pipeline.run': 'Run pipeline',
  'pipeline.csv': 'CSV source',
  'manager.title': 'Manager',
  'shell.title': 'MongoDB Shell',
  'aggregation.title': 'Aggregation',
  'aggregation.stages': 'Pipeline Stages',
  'aggregation.pipeline': 'Aggregation Pipeline',
  'aggregation.stageCount': 'stages',
  'aggregation.searchStages': 'Search stages…',
  'aggregation.catFilter': 'Filter',
  'aggregation.catTransform': 'Transformation',
  'aggregation.catJoins': 'Joins',
  'aggregation.addHint': '+ Click, dbl-click, or drop additional stages.',
  'aggregation.form': 'Form',
  'aggregation.json': 'Json',
  'aggregation.jsonOnlyHint': 'This stage is edited as JSON.',
  'aggregation.selectStage': 'Select a stage to inspect.',
  'aggregation.tabResults': 'Aggregation Results',
  'aggregation.tabPreview': 'Aggregation Preview',
  'aggregation.tabCode': 'Query Code',
  'aggregation.input': 'Input',
  'aggregation.output': 'Output',
  'aggregation.run': 'Run',
  'aggregation.runHint': 'Run to compile the pipeline against sample documents.',
  'copilot.title': 'Copilot',
  'copilot.open': 'Open Copilot',
  'status.ready': 'Ready',
  'footer.apiConnected': 'API connected',
  'footer.apiDisconnected': 'API disconnected',
  'workflow.aria': 'Migration workflow',
  'workflow.importDdl': 'Import DDL',
  'workflow.beforeSql': 'Before · SQL',
  'workflow.afterMongo': 'After · MongoDB',
  'workflow.afterTitleReady': 'MongoDB collections from migration plan',
  'workflow.afterTitleNeedPlan': 'Generate a migration plan first',
  'workflow.export': 'Export migration',
  'workflow.exporting': 'Exporting…',
  'workflow.runPipeline': 'Run pipeline',
  'phase.aria': 'Schema phase',
  'view.aria': 'Diagram view',
  'view.label': 'View',
  'view.stacked': 'Stacked split',
  'view.stackedTitle': 'SQL on top, MongoDB below',
  'view.sideBySide': 'Side-by-side split',
  'view.sideBySideTitle': 'SQL on the left, MongoDB on the right',
  'view.relTitle': 'Before · SQL (relational source schema)',
  'view.mdbTitle': 'After · MongoDB (migration plan)',
  'sidebar.schemaImport': 'Instant Schema Import',
  'sidebar.embedOverrides': 'Embed Overrides',
  'sidebar.timeSeries': 'Time Series Overrides',
  'sidebar.sqlTables': 'SQL tables',
  'sidebar.snapToGrid': 'Snap to grid (hold Shift for free move)',
  'sidebar.mongoTarget': 'MongoDB Target Schema',
  'sidebar.mongoTargetHint':
    'AI/RAG migration plan — collections, embeds, indexes, and pattern decisions before Atlas import.',
  'sidebar.mongoCsvHint':
    'Export SQL table data as CSV so row counts and relationship cardinality drive embed, subset, and bucket folding. SQLite .db imports include stats automatically.',
  'sidebar.chooseCsvs': 'Choose CSVs',
  'sidebar.refreshDesign': 'Refresh design',
  'sidebar.designing': 'Designing…',
  'sidebar.downloadPlan': 'Download plan',
  'sidebar.planPlaceholder': 'Run design to generate migration-plan.json…',
  'sidebar.transformation': 'Transformation Summary',
  'sidebar.transformationEmpty':
    'Run design to see why patterns and embeds were or were not applied.',
  'sidebar.transformationRefresh': 'Refresh summary',
  'sidebar.transformationUpdating': 'Updating…',
  'sidebar.transformationProfile': 'Profile {label} ({ratio}) · row stats: ',
  'sidebar.yes': 'yes',
  'sidebar.no': 'no',
  'sidebar.csvEnriched': ' · CSV-enriched',
  'sidebar.perCollection': 'Per collection ({count})',
  'sidebar.schemaVersioningOnly': 'schema-versioning only',
  'sidebar.embedsPrefix': 'embeds: ',
  'sidebar.embedOverridesLink': 'Embed Overrides (Before SQL)',
  'sidebar.sizingTitle': 'Sizing Cost Projection',
  'sidebar.sizingEmpty': 'Import a source schema to estimate Atlas sizing and monthly run costs.',
  'sidebar.sizingIntro':
    'Heuristic sizing from your DDL and workload profile — not a formal Atlas quote.',
  'sidebar.datasetScale': 'Dataset scale — raw data:',
  'sidebar.workloadType': 'Workload type',
  'sidebar.workloadReadHeavy': 'Read-heavy (80/20)',
  'sidebar.workloadReadHeavyHint': 'Blogs, storefronts, analytics dashboards',
  'sidebar.workloadBalanced': 'Balanced (50/50)',
  'sidebar.workloadBalancedHint': 'Mixed transactional and reporting workloads',
  'sidebar.workloadWriteHeavy': 'Write-heavy (20/80)',
  'sidebar.workloadWriteHeavyHint': 'IoT logging, chat, financial ledgers',
  'sidebar.dataGrowth': 'Expected data growth:',
  'sidebar.yoy': 'YoY',
  'sidebar.sliderNote':
    'Slider is piecewise: 1 GB–{mid} uses the left half; larger sizes scale faster to {max} (4 TB at center).',
  'sidebar.schemaStatsNote': 'Schema stats estimate shape; ~{rows} documents.',
  'sidebar.rawRecommendedAria': '{size} raw data · recommended {tier}',
  'sidebar.archiveByCollection': 'Archive pattern by collection',
  'sidebar.eligibleCollections': '{count} eligible collections',
  'sidebar.eligibleCollection': '{count} eligible collection',
  'sidebar.archiveRetainHint':
    'Retain recent data on the hot Atlas cluster, then route older dated documents to Online Archive.',
  'sidebar.recommended': 'Recommended',
  'sidebar.available': 'Available',
  'sidebar.dateField': 'date field',
  'sidebar.hotRetention': 'Hot retention',
  'sidebar.years': 'years',
  'sidebar.archivePartitionHint':
    'Partition: {fields}. Use Atlas Data Federation\'s unified connection string for hot + archived queries.',
  'sidebar.recommendedTier': 'Recommended Tier',
  'sidebar.targetWorkloadProfile': 'Target workload profile',
  'sidebar.recommendedTierLabel': 'Recommended tier',
  'sidebar.maxConnections': 'Max connections',
  'sidebar.datasetSizeEst': 'Dataset size (est.)',
  'sidebar.planningStorage': 'Planning storage (12 mo)',
  'sidebar.exceedsReplicaSet': ' · exceeds single replica set disk — sharding recommended',
  'sidebar.inclGrowth': ' incl. {percent}% YoY growth',
  'sidebar.targetRam': 'Target RAM (est.)',
  'sidebar.avgDocSize': 'Avg document size',
  'sidebar.workingSetFits':
    '{percent}% of index + active working set fits in WiredTiger cache',
  'sidebar.atlasTierReference':
    'Atlas tier reference (vCPU, RAM, storage scale, max connections)',
  'sidebar.tierCol': 'Tier',
  'sidebar.vcpuCol': 'vCPU',
  'sidebar.ramCol': 'RAM',
  'sidebar.storageScaleCol': 'Standard storage scale',
  'sidebar.maxConnCol': 'Max connections',
  'sidebar.shardingTitle': 'Sharding Recommended',
  'sidebar.shardingCollections': '{count} collections',
  'sidebar.shardingHeader': 'Sharding recommended ({threshold}+ dataset)',
  'sidebar.shardingIntro':
    'At this scale, plan a sharded cluster with shard keys that distribute reads and writes uniformly.',
  'sidebar.shardingDocs': 'Sharding documentation',
  'sidebar.shardingBestPractices': 'Performance best practices',
  'sidebar.collectionCol': 'Collection',
  'sidebar.hotStorageCol': 'Hot storage',
  'sidebar.shardKeyCol': 'Shard key',
  'sidebar.strategyCol': 'Strategy',
  'sidebar.supportingIndexCol': 'Supporting index',
  'sidebar.mongoCollections': 'MongoDB collections',
  'sidebar.shareDiagram': 'Share Diagram',
  'sidebar.shareSqlHint': 'Export or import SQL table layout and positions.',
  'sidebar.shareMongoHint': 'Export or import MongoDB collection layout, migration plan, and canvas positions.',
  'sidebar.exportDiagram': 'Export diagram',
  'sidebar.importDiagram': 'Import diagram',
  'sidebar.pipelineHistory': 'Pipeline History',
  'sidebar.session': 'Session',
  'sidebar.sessionHint':
    'Your work is saved in this browser tab. Refreshing keeps schema, layout, and migration artifacts.',
  'sidebar.clearSession': 'Clear session',
  'header.signOut': 'Sign out',
  'header.terms': 'Terms',
};

const pt: MessageCatalog = {
  ...en,
  'nav.primary': 'Principal',
  'nav.database': 'Banco de dados',
  'nav.schema': 'Esquema',
  'nav.sizing': 'Dimensionamento',
  'nav.shell': 'Shell',
  'nav.aggregation': 'Agregar',
  'nav.copilot': 'Copiloto',
  'nav.roles': 'Funções',
  'nav.settings': 'Configurações',
  'aggregation.title': 'Agregação',
  'aggregation.stages': 'Estágios do pipeline',
  'aggregation.pipeline': 'Pipeline de agregação',
  'aggregation.stageCount': 'estágios',
  'aggregation.searchStages': 'Buscar estágios…',
  'aggregation.catFilter': 'Filtro',
  'aggregation.catTransform': 'Transformação',
  'aggregation.catJoins': 'Joins',
  'aggregation.addHint': '+ Clique, dê duplo clique ou solte estágios.',
  'aggregation.form': 'Formulário',
  'aggregation.json': 'Json',
  'aggregation.jsonOnlyHint': 'Este estágio é editado como JSON.',
  'aggregation.selectStage': 'Selecione um estágio para inspecionar.',
  'aggregation.tabResults': 'Resultados da agregação',
  'aggregation.tabPreview': 'Prévia da agregação',
  'aggregation.tabCode': 'Código da consulta',
  'aggregation.input': 'Entrada',
  'aggregation.output': 'Saída',
  'aggregation.run': 'Executar',
  'aggregation.runHint': 'Execute para compilar o pipeline nos documentos de exemplo.',
  'language.label': 'Idioma',
  'common.cancel': 'Cancelar',
  'common.close': 'Fechar',
  'common.save': 'Salvar',
  'common.loading': 'Carregando…',
  'common.error': 'Algo deu errado.',
  'common.signIn': 'Entrar',
  'common.signOut': 'Sair',
  'common.signInAgain': 'Entrar novamente',
  'auth.loadingTitle': 'Carregando hvyMETL Studio…',
  'auth.loadingBody': 'Verificando sua sessão.',
  'auth.expiredTitle': 'Sessão expirada',
  'auth.welcomeTitle': 'Bem-vindo ao hvyMETL Studio',
  'auth.welcomeBody':
    'Entre em hvymetl.studio com Google, Facebook ou a conta da sua organização para acessar o design de migração, a revisão do gerente e o pipeline.',
  'auth.pendingTitle': 'Acesso pendente',
  'auth.pendingBody':
    'Sua conta está autenticada, mas ainda não tem a função de admin, desenvolvedor ou gerente.',
  'auth.terms': 'Termos e Condições',
  'consent.bannerTitle': 'Cookies e armazenamento local',
  'consent.bannerBody':
    'Usamos armazenamento local para a sessão e cookies opcionais para preferências, análise e marketing.',
  'consent.acceptAll': 'Aceitar tudo',
  'consent.rejectOptional': 'Recusar opcionais',
  'consent.customize': 'Personalizar',
  'consent.prefsTitle': 'Preferências de privacidade',
  'consent.regimeOptIn':
    'Seu navegador parece estar em uma região que exige consentimento; as categorias opcionais ficam desligadas até você aceitar.',
  'consent.regimeOptOut':
    'Seu navegador parece estar em uma região dos EUA. Você pode desativar análise e marketing a qualquer momento.',
  'consent.necessaryTitle': 'Estritamente necessários',
  'consent.necessaryDetail': 'Mantém a sessão do studio e esta escolha de consentimento. Sempre ativos.',
  'consent.functionalTitle': 'Funcionais',
  'consent.functionalDetail': 'Lembra preferências do studio neste navegador.',
  'consent.analyticsTitle': 'Análise',
  'consent.analyticsDetail': 'Telemetria sobre como o studio é usado.',
  'consent.marketingTitle': 'Marketing',
  'consent.marketingDetail': 'Medição para contato sobre o hvyMETL. Desligado com Global Privacy Control.',
  'consent.savePrefs': 'Salvar preferências',
  'consent.prefsLink': 'Preferências de cookies',
  'schema.title': 'Importar esquema',
  'schema.pasteHint': 'Cole DDL, JSON Schema, DynamoDB ou MongoDB JSON. Solte CSV, SQLite ou arquivos de esquema aqui.',
  'schema.pastePlaceholder': 'Soltar/Colar…',
  'schema.import': 'Importar esquema',
  'schema.loadExample': 'Carregar exemplo',
  'schema.dropHint': 'Solte arquivos para importar',
  'schema.detected': 'Detectado',
  'schema.liveTitle': 'Banco ao vivo',
  'schema.modalTitle': 'Comece importando o esquema',
  'schema.modalSubtitle':
    'Cole um esquema, envie um arquivo ou conecte a um banco ao vivo. O hvyMETL monta o modelo de origem antes do design, custo ou ETL.',
  'schema.modalClose': 'Fechar diálogo de importação de esquema',
  'live.agentHint':
    'O hvymetl.studio não abre um banco no seu computador. Baixe o agente, copie o comando e execute-o no terminal da máquina com o banco. O agente abre um WebSocket de saída, lê o esquema e pode transmitir uma extração completa. No Windows, use o PowerShell.',
  'live.agentPlatform': 'Agente para este computador',
  'live.chooseComputer': 'Escolha seu computador…',
  'live.download': 'Baixar',
  'live.engine': 'Tipo de banco',
  'live.uri': 'URI de conexão',
  'live.database': 'Banco de dados',
  'live.copyCommand': 'Copiar comando',
  'live.importLive': 'Importar dados ao vivo',
  'live.reading': 'Lendo…',
  'pipeline.title': 'Pipeline',
  'pipeline.run': 'Executar pipeline',
  'pipeline.csv': 'Fonte CSV',
  'manager.title': 'Gerente',
  'shell.title': 'Shell MongoDB',
  'copilot.title': 'Copiloto',
  'copilot.open': 'Abrir Copiloto',
  'status.ready': 'Pronto',
  'footer.apiConnected': 'API conectada',
  'footer.apiDisconnected': 'API desconectada',
  'workflow.aria': 'Fluxo de migração',
  'workflow.importDdl': 'Importar DDL',
  'workflow.beforeSql': 'Antes · SQL',
  'workflow.afterMongo': 'Depois · MongoDB',
  'workflow.afterTitleReady': 'Coleções MongoDB do plano de migração',
  'workflow.afterTitleNeedPlan': 'Gere um plano de migração primeiro',
  'workflow.export': 'Exportar migração',
  'workflow.exporting': 'Exportando…',
  'workflow.runPipeline': 'Executar pipeline',
  'phase.aria': 'Fase do esquema',
  'view.aria': 'Vista do diagrama',
  'view.label': 'Vista',
  'view.stacked': 'Divisão empilhada',
  'view.stackedTitle': 'SQL em cima, MongoDB abaixo',
  'view.sideBySide': 'Divisão lado a lado',
  'view.sideBySideTitle': 'SQL à esquerda, MongoDB à direita',
  'view.relTitle': 'Antes · SQL (esquema relacional de origem)',
  'view.mdbTitle': 'Depois · MongoDB (plano de migração)',
  'sidebar.schemaImport': 'Importação instantânea de esquema',
  'sidebar.embedOverrides': 'Substituições de embed',
  'sidebar.timeSeries': 'Substituições de séries temporais',
  'sidebar.sqlTables': 'Tabelas SQL',
  'sidebar.snapToGrid': 'Ajustar à grade (Segure Shift para mover livremente)',
  'sidebar.mongoTarget': 'Esquema alvo MongoDB',
  'sidebar.mongoTargetHint':
    'Plano de migração AI/RAG — coleções, embeds, índices e decisões de padrão antes da importação no Atlas.',
  'sidebar.mongoCsvHint':
    'Exporte dados das tabelas SQL como CSV para que contagens e cardinalidade orientem embed, subset e bucket. Imports SQLite .db já incluem estatísticas.',
  'sidebar.chooseCsvs': 'Escolher CSVs',
  'sidebar.refreshDesign': 'Atualizar design',
  'sidebar.designing': 'Projetando…',
  'sidebar.downloadPlan': 'Baixar plano',
  'sidebar.planPlaceholder': 'Execute o design para gerar migration-plan.json…',
  'sidebar.transformation': 'Resumo da transformação',
  'sidebar.transformationEmpty':
    'Execute o design para ver por que padrões e embeds foram ou não aplicados.',
  'sidebar.transformationRefresh': 'Atualizar resumo',
  'sidebar.transformationUpdating': 'Atualizando…',
  'sidebar.transformationProfile': 'Perfil {label} ({ratio}) · estatísticas de linhas: ',
  'sidebar.yes': 'sim',
  'sidebar.no': 'não',
  'sidebar.csvEnriched': ' · enriquecido com CSV',
  'sidebar.perCollection': 'Por coleção ({count})',
  'sidebar.schemaVersioningOnly': 'apenas versionamento de esquema',
  'sidebar.embedsPrefix': 'embeds: ',
  'sidebar.embedOverridesLink': 'Substituições de embed (Antes SQL)',
  'sidebar.sizingTitle': 'Projeção de custo de dimensionamento',
  'sidebar.sizingEmpty':
    'Importe um esquema de origem para estimar o dimensionamento Atlas e os custos mensais.',
  'sidebar.sizingIntro':
    'Dimensionamento heurístico a partir do DDL e do perfil de carga — não é uma cotação formal da Atlas.',
  'sidebar.datasetScale': 'Escala do dataset — dados brutos:',
  'sidebar.workloadType': 'Tipo de carga',
  'sidebar.workloadReadHeavy': 'Leitura intensa (80/20)',
  'sidebar.workloadReadHeavyHint': 'Blogs, vitrines, painéis analíticos',
  'sidebar.workloadBalanced': 'Equilibrado (50/50)',
  'sidebar.workloadBalancedHint': 'Cargas transacionais e de relatórios mistas',
  'sidebar.workloadWriteHeavy': 'Escrita intensa (20/80)',
  'sidebar.workloadWriteHeavyHint': 'Logs IoT, chat, livros financeiros',
  'sidebar.dataGrowth': 'Crescimento esperado de dados:',
  'sidebar.yoy': 'a.a.',
  'sidebar.sliderNote':
    'O controle é por partes: 1 GB–{mid} usa a metade esquerda; tamanhos maiores sobem mais rápido até {max} (4 TB no centro).',
  'sidebar.schemaStatsNote': 'Estatísticas do esquema estimam a forma; ~{rows} documentos.',
  'sidebar.rawRecommendedAria': '{size} dados brutos · recomendado {tier}',
  'sidebar.archiveByCollection': 'Padrão de arquivo por coleção',
  'sidebar.eligibleCollections': '{count} coleções elegíveis',
  'sidebar.eligibleCollection': '{count} coleção elegível',
  'sidebar.archiveRetainHint':
    'Mantenha dados recentes no cluster Atlas quente e envie documentos datados mais antigos para o Online Archive.',
  'sidebar.recommended': 'Recomendado',
  'sidebar.available': 'Disponível',
  'sidebar.dateField': 'campo de data',
  'sidebar.hotRetention': 'Retenção a quente',
  'sidebar.years': 'anos',
  'sidebar.archivePartitionHint':
    'Partição: {fields}. Use a connection string unificada do Atlas Data Federation para consultas quentes + arquivadas.',
  'sidebar.recommendedTier': 'Nível recomendado',
  'sidebar.targetWorkloadProfile': 'Perfil de carga alvo',
  'sidebar.recommendedTierLabel': 'Nível recomendado',
  'sidebar.maxConnections': 'Máx. de conexões',
  'sidebar.datasetSizeEst': 'Tamanho do dataset (est.)',
  'sidebar.planningStorage': 'Armazenamento de planejamento (12 meses)',
  'sidebar.exceedsReplicaSet':
    ' · excede o disco de um único replica set — sharding recomendado',
  'sidebar.inclGrowth': ' incl. {percent}% de crescimento a.a.',
  'sidebar.targetRam': 'RAM alvo (est.)',
  'sidebar.avgDocSize': 'Tamanho médio do documento',
  'sidebar.workingSetFits':
    '{percent}% do índice + working set ativo cabe no cache do WiredTiger',
  'sidebar.atlasTierReference':
    'Referência de níveis Atlas (vCPU, RAM, escala de armazenamento, máx. conexões)',
  'sidebar.tierCol': 'Nível',
  'sidebar.vcpuCol': 'vCPU',
  'sidebar.ramCol': 'RAM',
  'sidebar.storageScaleCol': 'Escala de armazenamento padrão',
  'sidebar.maxConnCol': 'Máx. conexões',
  'sidebar.shardingTitle': 'Sharding recomendado',
  'sidebar.shardingCollections': '{count} coleções',
  'sidebar.shardingHeader': 'Sharding recomendado (dataset {threshold}+)',
  'sidebar.shardingIntro':
    'Nesta escala, planeje um cluster fragmentado com shard keys que distribuam leituras e escritas de forma uniforme.',
  'sidebar.shardingDocs': 'Documentação de sharding',
  'sidebar.shardingBestPractices': 'Práticas recomendadas de desempenho',
  'sidebar.collectionCol': 'Coleção',
  'sidebar.hotStorageCol': 'Armazenamento quente',
  'sidebar.shardKeyCol': 'Shard key',
  'sidebar.strategyCol': 'Estratégia',
  'sidebar.supportingIndexCol': 'Índice de suporte',
  'sidebar.mongoCollections': 'Coleções MongoDB',
  'sidebar.shareDiagram': 'Compartilhar diagrama',
  'sidebar.shareSqlHint': 'Exporte ou importe o layout e as posições das tabelas SQL.',
  'sidebar.shareMongoHint': 'Exporte ou importe layout das coleções MongoDB, plano de migração e posições.',
  'sidebar.exportDiagram': 'Exportar diagrama',
  'sidebar.importDiagram': 'Importar diagrama',
  'sidebar.pipelineHistory': 'Histórico do pipeline',
  'sidebar.session': 'Sessão',
  'sidebar.sessionHint':
    'Seu trabalho é salvo nesta aba. Atualizar mantém esquema, layout e artefatos de migração.',
  'sidebar.clearSession': 'Limpar sessão',
  'header.signOut': 'Sair',
  'header.terms': 'Termos',
};

const es: MessageCatalog = {
  ...en,
  'nav.primary': 'Principal',
  'nav.database': 'Base de datos',
  'nav.schema': 'Esquema',
  'nav.sizing': 'Dimensionamiento',
  'nav.shell': 'Shell',
  'nav.aggregation': 'Agregar',
  'nav.copilot': 'Copiloto',
  'nav.roles': 'Roles',
  'nav.settings': 'Configuración',
  'aggregation.title': 'Agregación',
  'aggregation.stages': 'Etapas del pipeline',
  'aggregation.pipeline': 'Pipeline de agregación',
  'aggregation.stageCount': 'etapas',
  'aggregation.searchStages': 'Buscar etapas…',
  'aggregation.catFilter': 'Filtro',
  'aggregation.catTransform': 'Transformación',
  'aggregation.catJoins': 'Joins',
  'aggregation.addHint': '+ Clic, doble clic o suelte etapas.',
  'aggregation.form': 'Formulario',
  'aggregation.json': 'Json',
  'aggregation.jsonOnlyHint': 'Esta etapa se edita como JSON.',
  'aggregation.selectStage': 'Seleccione una etapa para inspeccionar.',
  'aggregation.tabResults': 'Resultados de agregación',
  'aggregation.tabPreview': 'Vista previa de agregación',
  'aggregation.tabCode': 'Código de consulta',
  'aggregation.input': 'Entrada',
  'aggregation.output': 'Salida',
  'aggregation.run': 'Ejecutar',
  'aggregation.runHint': 'Ejecute para compilar el pipeline con documentos de ejemplo.',
  'language.label': 'Idioma',
  'common.cancel': 'Cancelar',
  'common.close': 'Cerrar',
  'common.save': 'Guardar',
  'common.loading': 'Cargando…',
  'common.error': 'Algo salió mal.',
  'common.signIn': 'Iniciar sesión',
  'common.signOut': 'Cerrar sesión',
  'common.signInAgain': 'Iniciar sesión de nuevo',
  'auth.loadingTitle': 'Cargando hvyMETL Studio…',
  'auth.loadingBody': 'Comprobando tu sesión.',
  'auth.expiredTitle': 'Sesión caducada',
  'auth.welcomeTitle': 'Bienvenido a hvyMETL Studio',
  'auth.welcomeBody':
    'Inicia sesión en hvymetl.studio con Google, Facebook o la cuenta de tu organización para acceder al diseño de migración, la revisión del manager y el pipeline.',
  'auth.pendingTitle': 'Acceso pendiente',
  'auth.pendingBody':
    'Tu cuenta ha iniciado sesión, pero aún no tiene el rol de admin, desarrollador o manager.',
  'auth.terms': 'Términos y Condiciones',
  'consent.bannerTitle': 'Cookies y almacenamiento local',
  'consent.bannerBody':
    'Usamos almacenamiento local para la sesión y cookies opcionales para preferencias, análisis y marketing.',
  'consent.acceptAll': 'Aceptar todo',
  'consent.rejectOptional': 'Rechazar opcionales',
  'consent.customize': 'Personalizar',
  'consent.prefsTitle': 'Preferencias de privacidad',
  'consent.regimeOptIn':
    'Tu navegador parece estar en una región que requiere consentimiento; las categorías opcionales permanecen desactivadas hasta que aceptes.',
  'consent.regimeOptOut':
    'Tu navegador parece estar en una región de EE. UU. Puedes optar por no recibir análisis y marketing en cualquier momento.',
  'consent.necessaryTitle': 'Estrictamente necesarias',
  'consent.necessaryDetail': 'Conserva la sesión del studio y esta elección de consentimiento. Siempre activas.',
  'consent.functionalTitle': 'Funcionales',
  'consent.functionalDetail': 'Recuerda las preferencias del studio en este navegador.',
  'consent.analyticsTitle': 'Análisis',
  'consent.analyticsDetail': 'Telemetría sobre el uso del studio.',
  'consent.marketingTitle': 'Marketing',
  'consent.marketingDetail': 'Medición para contactarte sobre hvyMETL. Desactivado con Global Privacy Control.',
  'consent.savePrefs': 'Guardar preferencias',
  'consent.prefsLink': 'Preferencias de cookies',
  'schema.title': 'Importar esquema',
  'schema.pasteHint': 'Pega DDL, JSON Schema, DynamoDB o MongoDB JSON. Suelta CSV, SQLite o archivos de esquema aquí.',
  'schema.pastePlaceholder': 'Soltar/Pegar…',
  'schema.import': 'Importar esquema',
  'schema.loadExample': 'Cargar ejemplo',
  'schema.dropHint': 'Suelta archivos para importar',
  'schema.detected': 'Detectado',
  'schema.liveTitle': 'Base en vivo',
  'schema.modalTitle': 'Empiece importando el esquema',
  'schema.modalSubtitle':
    'Pegue un esquema, suba un archivo o conéctese a una base en vivo. hvyMETL construye el modelo de origen antes del diseño, coste o ETL.',
  'schema.modalClose': 'Cerrar el diálogo de importación de esquema',
  'live.agentHint':
    'hvymetl.studio no puede abrir una base en tu equipo. Descarga el agente, copia el comando y pégalo en una terminal del equipo con la base. El agente abre un WebSocket de salida, lee el esquema y puede transmitir una extracción completa. En Windows, usa PowerShell.',
  'live.agentPlatform': 'Agente para este equipo',
  'live.chooseComputer': 'Elige tu equipo…',
  'live.download': 'Descargar',
  'live.engine': 'Tipo de base',
  'live.uri': 'URI de conexión',
  'live.database': 'Base de datos',
  'live.copyCommand': 'Copiar comando',
  'live.importLive': 'Importar datos en vivo',
  'live.reading': 'Leyendo…',
  'pipeline.title': 'Pipeline',
  'pipeline.run': 'Ejecutar pipeline',
  'pipeline.csv': 'Origen CSV',
  'manager.title': 'Manager',
  'shell.title': 'Shell de MongoDB',
  'copilot.title': 'Copiloto',
  'copilot.open': 'Abrir Copiloto',
  'status.ready': 'Listo',
  'footer.apiConnected': 'API conectada',
  'footer.apiDisconnected': 'API desconectada',
  'workflow.aria': 'Flujo de migración',
  'workflow.importDdl': 'Importar DDL',
  'workflow.beforeSql': 'Antes · SQL',
  'workflow.afterMongo': 'Después · MongoDB',
  'workflow.afterTitleReady': 'Colecciones MongoDB del plan de migración',
  'workflow.afterTitleNeedPlan': 'Genere primero un plan de migración',
  'workflow.export': 'Exportar migración',
  'workflow.exporting': 'Exportando…',
  'workflow.runPipeline': 'Ejecutar pipeline',
  'phase.aria': 'Fase del esquema',
  'view.aria': 'Vista del diagrama',
  'view.label': 'Vista',
  'view.stacked': 'División apilada',
  'view.stackedTitle': 'SQL arriba, MongoDB abajo',
  'view.sideBySide': 'División lado a lado',
  'view.sideBySideTitle': 'SQL a la izquierda, MongoDB a la derecha',
  'view.relTitle': 'Antes · SQL (esquema relacional de origen)',
  'view.mdbTitle': 'Después · MongoDB (plan de migración)',
  'sidebar.schemaImport': 'Importación instantánea de esquema',
  'sidebar.embedOverrides': 'Anulaciones de embed',
  'sidebar.timeSeries': 'Anulaciones de series temporales',
  'sidebar.sqlTables': 'Tablas SQL',
  'sidebar.snapToGrid': 'Ajustar a la cuadrícula (mantén Mayús para mover libremente)',
  'sidebar.mongoTarget': 'Esquema destino MongoDB',
  'sidebar.mongoTargetHint':
    'Plan de migración AI/RAG — colecciones, embeds, índices y decisiones de patrón antes de importar a Atlas.',
  'sidebar.mongoCsvHint':
    'Exporte datos de tablas SQL como CSV para que los recuentos y la cardinalidad impulsen embed, subset y bucket. Los imports SQLite .db ya incluyen estadísticas.',
  'sidebar.chooseCsvs': 'Elegir CSV',
  'sidebar.refreshDesign': 'Actualizar diseño',
  'sidebar.designing': 'Diseñando…',
  'sidebar.downloadPlan': 'Descargar plan',
  'sidebar.planPlaceholder': 'Ejecute el diseño para generar migration-plan.json…',
  'sidebar.transformation': 'Resumen de transformación',
  'sidebar.transformationEmpty':
    'Ejecute el diseño para ver por qué se aplicaron o no patrones y embeds.',
  'sidebar.transformationRefresh': 'Actualizar resumen',
  'sidebar.transformationUpdating': 'Actualizando…',
  'sidebar.transformationProfile': 'Perfil {label} ({ratio}) · estadísticas de filas: ',
  'sidebar.yes': 'sí',
  'sidebar.no': 'no',
  'sidebar.csvEnriched': ' · enriquecido con CSV',
  'sidebar.perCollection': 'Por colección ({count})',
  'sidebar.schemaVersioningOnly': 'solo versionado de esquema',
  'sidebar.embedsPrefix': 'embeds: ',
  'sidebar.embedOverridesLink': 'Anulaciones de embed (Antes SQL)',
  'sidebar.sizingTitle': 'Proyección de coste de dimensionamiento',
  'sidebar.sizingEmpty':
    'Importe un esquema de origen para estimar el dimensionamiento de Atlas y los costes mensuales.',
  'sidebar.sizingIntro':
    'Dimensionamiento heurístico a partir del DDL y del perfil de carga — no es una cotización formal de Atlas.',
  'sidebar.datasetScale': 'Escala del dataset — datos en bruto:',
  'sidebar.workloadType': 'Tipo de carga',
  'sidebar.workloadReadHeavy': 'Lectura intensiva (80/20)',
  'sidebar.workloadReadHeavyHint': 'Blogs, tiendas, paneles analíticos',
  'sidebar.workloadBalanced': 'Equilibrado (50/50)',
  'sidebar.workloadBalancedHint': 'Cargas transaccionales e informes mixtas',
  'sidebar.workloadWriteHeavy': 'Escritura intensiva (20/80)',
  'sidebar.workloadWriteHeavyHint': 'Registros IoT, chat, libros financieros',
  'sidebar.dataGrowth': 'Crecimiento esperado de datos:',
  'sidebar.yoy': 'interanual',
  'sidebar.sliderNote':
    'El control es por tramos: 1 GB–{mid} usa la mitad izquierda; tamaños mayores escalan más rápido hasta {max} (4 TB en el centro).',
  'sidebar.schemaStatsNote': 'Las estadísticas del esquema estiman la forma; ~{rows} documentos.',
  'sidebar.rawRecommendedAria': '{size} datos en bruto · recomendado {tier}',
  'sidebar.archiveByCollection': 'Patrón de archivo por colección',
  'sidebar.eligibleCollections': '{count} colecciones elegibles',
  'sidebar.eligibleCollection': '{count} colección elegible',
  'sidebar.archiveRetainHint':
    'Conserve datos recientes en el clúster Atlas en caliente y envíe documentos fechados más antiguos a Online Archive.',
  'sidebar.recommended': 'Recomendado',
  'sidebar.available': 'Disponible',
  'sidebar.dateField': 'campo de fecha',
  'sidebar.hotRetention': 'Retención en caliente',
  'sidebar.years': 'años',
  'sidebar.archivePartitionHint':
    'Partición: {fields}. Use la connection string unificada de Atlas Data Federation para consultas en caliente + archivadas.',
  'sidebar.recommendedTier': 'Nivel recomendado',
  'sidebar.targetWorkloadProfile': 'Perfil de carga objetivo',
  'sidebar.recommendedTierLabel': 'Nivel recomendado',
  'sidebar.maxConnections': 'Máx. conexiones',
  'sidebar.datasetSizeEst': 'Tamaño del dataset (est.)',
  'sidebar.planningStorage': 'Almacenamiento de planificación (12 meses)',
  'sidebar.exceedsReplicaSet':
    ' · supera el disco de un único conjunto de réplicas — se recomienda sharding',
  'sidebar.inclGrowth': ' incl. {percent}% de crecimiento interanual',
  'sidebar.targetRam': 'RAM objetivo (est.)',
  'sidebar.avgDocSize': 'Tamaño medio del documento',
  'sidebar.workingSetFits':
    '{percent}% del índice + working set activo cabe en la caché de WiredTiger',
  'sidebar.atlasTierReference':
    'Referencia de niveles Atlas (vCPU, RAM, escala de almacenamiento, máx. conexiones)',
  'sidebar.tierCol': 'Nivel',
  'sidebar.vcpuCol': 'vCPU',
  'sidebar.ramCol': 'RAM',
  'sidebar.storageScaleCol': 'Escala de almacenamiento estándar',
  'sidebar.maxConnCol': 'Máx. conexiones',
  'sidebar.shardingTitle': 'Sharding recomendado',
  'sidebar.shardingCollections': '{count} colecciones',
  'sidebar.shardingHeader': 'Sharding recomendado (dataset {threshold}+)',
  'sidebar.shardingIntro':
    'A esta escala, planifique un clúster fragmentado con shard keys que distribuyan lecturas y escrituras de forma uniforme.',
  'sidebar.shardingDocs': 'Documentación de sharding',
  'sidebar.shardingBestPractices': 'Prácticas recomendadas de rendimiento',
  'sidebar.collectionCol': 'Colección',
  'sidebar.hotStorageCol': 'Almacenamiento en caliente',
  'sidebar.shardKeyCol': 'Shard key',
  'sidebar.strategyCol': 'Estrategia',
  'sidebar.supportingIndexCol': 'Índice de soporte',
  'sidebar.mongoCollections': 'Colecciones MongoDB',
  'sidebar.shareDiagram': 'Compartir diagrama',
  'sidebar.shareSqlHint': 'Exporte o importe el diseño y las posiciones de las tablas SQL.',
  'sidebar.shareMongoHint': 'Exporte o importe el diseño de colecciones MongoDB, el plan y las posiciones.',
  'sidebar.exportDiagram': 'Exportar diagrama',
  'sidebar.importDiagram': 'Importar diagrama',
  'sidebar.pipelineHistory': 'Historial del pipeline',
  'sidebar.session': 'Sesión',
  'sidebar.sessionHint':
    'Su trabajo se guarda en esta pestaña. Al actualizar se conservan esquema, diseño y artefactos.',
  'sidebar.clearSession': 'Borrar sesión',
  'header.signOut': 'Cerrar sesión',
  'header.terms': 'Términos',
};

const zhCN: MessageCatalog = {
  ...en,
  'nav.primary': '主导航',
  'nav.database': '数据库',
  'nav.schema': '架构',
  'nav.sizing': '容量规划',
  'nav.shell': 'Shell',
  'nav.aggregation': '聚合',
  'nav.copilot': '助手',
  'nav.roles': '角色',
  'nav.settings': '设置',
  'aggregation.title': '聚合',
  'aggregation.stages': '管道阶段',
  'aggregation.pipeline': '聚合管道',
  'aggregation.stageCount': '阶段',
  'aggregation.searchStages': '搜索阶段…',
  'aggregation.catFilter': '筛选',
  'aggregation.catTransform': '转换',
  'aggregation.catJoins': '连接',
  'aggregation.addHint': '+ 单击、双击或拖放阶段。',
  'aggregation.form': '表单',
  'aggregation.json': 'Json',
  'aggregation.jsonOnlyHint': '此阶段以 JSON 编辑。',
  'aggregation.selectStage': '选择要检查的阶段。',
  'aggregation.tabResults': '聚合结果',
  'aggregation.tabPreview': '聚合预览',
  'aggregation.tabCode': '查询代码',
  'aggregation.input': '输入',
  'aggregation.output': '输出',
  'aggregation.run': '运行',
  'aggregation.runHint': '运行以在示例文档上编译管道。',
  'language.label': '语言',
  'common.cancel': '取消',
  'common.close': '关闭',
  'common.save': '保存',
  'common.loading': '加载中…',
  'common.error': '出错了。',
  'common.signIn': '登录',
  'common.signOut': '退出',
  'common.signInAgain': '重新登录',
  'auth.loadingTitle': '正在加载 hvyMETL Studio…',
  'auth.loadingBody': '正在检查登录会话。',
  'auth.expiredTitle': '会话已过期',
  'auth.welcomeTitle': '欢迎使用 hvyMETL Studio',
  'auth.welcomeBody':
    '请通过 hvymetl.studio 使用 Google、Facebook 或组织账号登录，以使用迁移设计、管理员审阅和流水线工具。',
  'auth.pendingTitle': '等待授权',
  'auth.pendingBody': '您已登录，但尚未获得管理员、开发者或经理角色。',
  'auth.terms': '条款与条件',
  'consent.bannerTitle': 'Cookie 与本地存储',
  'consent.bannerBody': '我们使用本地存储保存会话，并使用可选 Cookie 处理偏好、分析与营销。',
  'consent.acceptAll': '全部接受',
  'consent.rejectOptional': '拒绝可选',
  'consent.customize': '自定义',
  'consent.prefsTitle': '隐私偏好',
  'consent.regimeOptIn': '您的浏览器似乎位于需要事先同意的地区，可选类别将保持关闭直至您接受。',
  'consent.regimeOptOut': '您的浏览器似乎位于美国地区。您可随时退出分析与营销。',
  'consent.necessaryTitle': '必要',
  'consent.necessaryDetail': '用于工作室会话与本同意选择。始终开启。',
  'consent.functionalTitle': '功能',
  'consent.functionalDetail': '在此浏览器记住工作室偏好。',
  'consent.analyticsTitle': '分析',
  'consent.analyticsDetail': '关于工作室使用情况的平台遥测。',
  'consent.marketingTitle': '营销',
  'consent.marketingDetail': '用于联系您了解 hvyMETL。开启全球隐私控制时关闭。',
  'consent.savePrefs': '保存偏好',
  'consent.prefsLink': 'Cookie 偏好',
  'schema.title': '导入架构',
  'schema.pasteHint': '粘贴 DDL、JSON Schema、DynamoDB 或 MongoDB JSON。也可将 CSV、SQLite 或架构文件拖放到此处。',
  'schema.pastePlaceholder': '拖放/粘贴…',
  'schema.import': '导入架构',
  'schema.loadExample': '加载示例',
  'schema.dropHint': '拖放文件以导入',
  'schema.detected': '已检测',
  'schema.liveTitle': '实时数据库',
  'schema.modalTitle': '从架构导入开始',
  'schema.modalSubtitle':
    '粘贴架构、上传文件或连接实时数据库。hvyMETL 会在设计、成本或 ETL 之前构建源模型。',
  'schema.modalClose': '关闭架构导入对话框',
  'live.agentHint':
    'hvymetl.studio 无法打开您计算机上的数据库。请下载代理，复制命令，并在存有数据库的计算机终端中粘贴运行。代理会建立出站 WebSocket，读取架构，并可流式传输完整抽取。Windows 请使用 PowerShell。',
  'live.agentPlatform': '此计算机的代理',
  'live.chooseComputer': '选择您的计算机…',
  'live.download': '下载',
  'live.engine': '数据库类型',
  'live.uri': '连接 URI',
  'live.database': '数据库',
  'live.copyCommand': '复制命令',
  'live.importLive': '导入实时数据',
  'live.reading': '读取中…',
  'pipeline.title': '流水线',
  'pipeline.run': '运行流水线',
  'pipeline.csv': 'CSV 来源',
  'manager.title': '管理员',
  'shell.title': 'MongoDB Shell',
  'copilot.title': '助手',
  'copilot.open': '打开助手',
  'status.ready': '就绪',
  'footer.apiConnected': 'API 已连接',
  'footer.apiDisconnected': 'API 未连接',
  'workflow.aria': '迁移工作流',
  'workflow.importDdl': '导入 DDL',
  'workflow.beforeSql': '之前 · SQL',
  'workflow.afterMongo': '之后 · MongoDB',
  'workflow.afterTitleReady': '来自迁移计划的 MongoDB 集合',
  'workflow.afterTitleNeedPlan': '请先生成迁移计划',
  'workflow.export': '导出迁移',
  'workflow.exporting': '正在导出…',
  'workflow.runPipeline': '运行流水线',
  'phase.aria': '架构阶段',
  'view.aria': '图视图',
  'view.label': '视图',
  'view.stacked': '上下分屏',
  'view.stackedTitle': '上方 SQL，下方 MongoDB',
  'view.sideBySide': '左右分屏',
  'view.sideBySideTitle': '左侧 SQL，右侧 MongoDB',
  'view.relTitle': '之前 · SQL（关系源架构）',
  'view.mdbTitle': '之后 · MongoDB（迁移计划）',
  'sidebar.schemaImport': '即时架构导入',
  'sidebar.embedOverrides': '嵌入覆盖',
  'sidebar.timeSeries': '时序覆盖',
  'sidebar.sqlTables': 'SQL 表',
  'sidebar.snapToGrid': '对齐网格（按住 Shift 自由移动）',
  'sidebar.mongoTarget': 'MongoDB 目标架构',
  'sidebar.mongoTargetHint': 'AI/RAG 迁移计划 — 集合、嵌入、索引以及导入 Atlas 前的模式决策。',
  'sidebar.mongoCsvHint':
    '将 SQL 表导出为 CSV，以便行数与关系基数驱动 embed、subset 与 bucket。SQLite .db 导入会自动包含统计信息。',
  'sidebar.chooseCsvs': '选择 CSV',
  'sidebar.refreshDesign': '刷新设计',
  'sidebar.designing': '设计中…',
  'sidebar.downloadPlan': '下载计划',
  'sidebar.planPlaceholder': '运行设计以生成 migration-plan.json…',
  'sidebar.transformation': '转换摘要',
  'sidebar.transformationEmpty': '运行设计以了解为何应用或未应用模式与嵌入。',
  'sidebar.transformationRefresh': '刷新摘要',
  'sidebar.transformationUpdating': '更新中…',
  'sidebar.transformationProfile': '配置 {label} ({ratio}) · 行统计：',
  'sidebar.yes': '是',
  'sidebar.no': '否',
  'sidebar.csvEnriched': ' · 已用 CSV 丰富',
  'sidebar.perCollection': '按集合 ({count})',
  'sidebar.schemaVersioningOnly': '仅架构版本控制',
  'sidebar.embedsPrefix': '嵌入：',
  'sidebar.embedOverridesLink': '嵌入覆盖（之前 · SQL）',
  'sidebar.sizingTitle': '容量与成本估算',
  'sidebar.sizingEmpty': '导入源架构以估算 Atlas 容量与月度运行成本。',
  'sidebar.sizingIntro': '根据 DDL 与负载配置的启发式估算 — 非正式 Atlas 报价。',
  'sidebar.datasetScale': '数据集规模 — 原始数据：',
  'sidebar.workloadType': '负载类型',
  'sidebar.workloadReadHeavy': '读多写少 (80/20)',
  'sidebar.workloadReadHeavyHint': '博客、店面、分析仪表盘',
  'sidebar.workloadBalanced': '均衡 (50/50)',
  'sidebar.workloadBalancedHint': '事务与报表混合负载',
  'sidebar.workloadWriteHeavy': '写多读少 (20/80)',
  'sidebar.workloadWriteHeavyHint': '物联网日志、聊天、金融账本',
  'sidebar.dataGrowth': '预期数据增长：',
  'sidebar.yoy': '同比',
  'sidebar.sliderNote':
    '滑块分段：1 GB–{mid} 占用左半段；更大容量更快升到 {max}（中心为 4 TB）。',
  'sidebar.schemaStatsNote': '架构统计用于估算形状；约 {rows} 个文档。',
  'sidebar.rawRecommendedAria': '{size} 原始数据 · 推荐 {tier}',
  'sidebar.archiveByCollection': '按集合的归档模式',
  'sidebar.eligibleCollections': '{count} 个符合条件的集合',
  'sidebar.eligibleCollection': '{count} 个符合条件的集合',
  'sidebar.archiveRetainHint': '在热 Atlas 集群保留近期数据，将较旧的带日期文档路由到 Online Archive。',
  'sidebar.recommended': '推荐',
  'sidebar.available': '可用',
  'sidebar.dateField': '日期字段',
  'sidebar.hotRetention': '热数据保留',
  'sidebar.years': '年',
  'sidebar.archivePartitionHint':
    '分区：{fields}。使用 Atlas Data Federation 统一连接字符串查询热数据与归档数据。',
  'sidebar.recommendedTier': '推荐层级',
  'sidebar.targetWorkloadProfile': '目标负载配置',
  'sidebar.recommendedTierLabel': '推荐层级',
  'sidebar.maxConnections': '最大连接数',
  'sidebar.datasetSizeEst': '数据集大小（估）',
  'sidebar.planningStorage': '规划存储（12 个月）',
  'sidebar.exceedsReplicaSet': ' · 超过单副本集磁盘 — 建议分片',
  'sidebar.inclGrowth': ' 含 {percent}% 同比增长',
  'sidebar.targetRam': '目标 RAM（估）',
  'sidebar.avgDocSize': '平均文档大小',
  'sidebar.workingSetFits': '{percent}% 的索引 + 活动工作集可放入 WiredTiger 缓存',
  'sidebar.atlasTierReference': 'Atlas 层级参考（vCPU、RAM、存储规模、最大连接数）',
  'sidebar.tierCol': '层级',
  'sidebar.vcpuCol': 'vCPU',
  'sidebar.ramCol': 'RAM',
  'sidebar.storageScaleCol': '标准存储规模',
  'sidebar.maxConnCol': '最大连接数',
  'sidebar.shardingTitle': '建议分片',
  'sidebar.shardingCollections': '{count} 个集合',
  'sidebar.shardingHeader': '建议分片（数据集 {threshold}+）',
  'sidebar.shardingIntro': '在此规模下，请规划分片集群，并使用能均匀分布读写的分片键。',
  'sidebar.shardingDocs': '分片文档',
  'sidebar.shardingBestPractices': '性能最佳实践',
  'sidebar.collectionCol': '集合',
  'sidebar.hotStorageCol': '热存储',
  'sidebar.shardKeyCol': '分片键',
  'sidebar.strategyCol': '策略',
  'sidebar.supportingIndexCol': '支撑索引',
  'sidebar.mongoCollections': 'MongoDB 集合',
  'sidebar.shareDiagram': '共享图',
  'sidebar.shareSqlHint': '导出或导入 SQL 表布局与位置。',
  'sidebar.shareMongoHint': '导出或导入 MongoDB 集合布局、迁移计划与画布位置。',
  'sidebar.exportDiagram': '导出图',
  'sidebar.importDiagram': '导入图',
  'sidebar.pipelineHistory': '流水线历史',
  'sidebar.session': '会话',
  'sidebar.sessionHint': '工作保存在此浏览器标签页。刷新会保留架构、布局与迁移产物。',
  'sidebar.clearSession': '清除会话',
  'header.signOut': '退出',
  'header.terms': '条款',
};

const hi: MessageCatalog = {
  ...en,
  'nav.primary': 'मुख्य',
  'nav.database': 'डेटाबेस',
  'nav.schema': 'स्कीमा',
  'nav.sizing': 'साइज़िंग',
  'nav.shell': 'शेल',
  'nav.aggregation': 'एग्रीगेट',
  'nav.copilot': 'कोपायलट',
  'nav.roles': 'भूमिकाएँ',
  'nav.settings': 'सेटिंग्स',
  'aggregation.title': 'एग्रीगेशन',
  'aggregation.stages': 'पाइपलाइन स्टेज',
  'aggregation.pipeline': 'एग्रीगेशन पाइपलाइन',
  'aggregation.stageCount': 'स्टेज',
  'aggregation.searchStages': 'स्टेज खोजें…',
  'aggregation.catFilter': 'फ़िल्टर',
  'aggregation.catTransform': 'रूपांतरण',
  'aggregation.catJoins': 'जॉइन',
  'aggregation.addHint': '+ क्लिक, डबल-क्लिक, या स्टेज छोड़ें।',
  'aggregation.form': 'फ़ॉर्म',
  'aggregation.json': 'Json',
  'aggregation.jsonOnlyHint': 'यह स्टेज JSON के रूप में संपादित होता है।',
  'aggregation.selectStage': 'निरीक्षण के लिए एक स्टेज चुनें।',
  'aggregation.tabResults': 'एग्रीगेशन परिणाम',
  'aggregation.tabPreview': 'एग्रीगेशन पूर्वावलोकन',
  'aggregation.tabCode': 'क्वेरी कोड',
  'aggregation.input': 'इनपुट',
  'aggregation.output': 'आउटपुट',
  'aggregation.run': 'चलाएँ',
  'aggregation.runHint': 'नमूना दस्तावेज़ों पर पाइपलाइन संकलित करने के लिए चलाएँ।',
  'language.label': 'भाषा',
  'common.cancel': 'रद्द करें',
  'common.close': 'बंद करें',
  'common.save': 'सहेजें',
  'common.loading': 'लोड हो रहा है…',
  'common.error': 'कुछ गलत हो गया।',
  'common.signIn': 'साइन इन',
  'common.signOut': 'साइन आउट',
  'common.signInAgain': 'फिर से साइन इन करें',
  'auth.loadingTitle': 'hvyMETL Studio लोड हो रहा है…',
  'auth.loadingBody': 'आपका साइन-इन सत्र जाँचा जा रहा है।',
  'auth.expiredTitle': 'सत्र समाप्त',
  'auth.welcomeTitle': 'hvyMETL Studio में आपका स्वागत है',
  'auth.welcomeBody':
    'माइग्रेशन डिज़ाइन, मैनेजर समीक्षा और पाइपलाइन टूल के लिए hvymetl.studio पर Google, Facebook या अपने संगठन खाते से साइन इन करें।',
  'auth.pendingTitle': 'पहुँच लंबित',
  'auth.pendingBody':
    'आपका खाता साइन इन है, लेकिन अभी तक एडमिन, डेवलपर या मैनेजर भूमिका नहीं मिली है।',
  'auth.terms': 'नियम और शर्तें',
  'consent.bannerTitle': 'कुकीज़ और स्थानीय संग्रहण',
  'consent.bannerBody':
    'हम सत्र के लिए स्थानीय संग्रहण और प्राथमिकताएँ, विश्लेषण व मार्केटिंग के लिए वैकल्पिक कुकीज़ उपयोग करते हैं।',
  'consent.acceptAll': 'सभी स्वीकार करें',
  'consent.rejectOptional': 'वैकल्पिक अस्वीकार करें',
  'consent.customize': 'अनुकूलित करें',
  'consent.prefsTitle': 'गोपनीयता प्राथमिकताएँ',
  'consent.regimeOptIn':
    'आपका ब्राउज़र ऐसी क्षेत्र जैसा लगता है जहाँ सहमति आवश्यक है, इसलिए वैकल्पिक श्रेणियाँ स्वीकार करने तक बंद रहती हैं।',
  'consent.regimeOptOut':
    'आपका ब्राउज़र अमेरिकी क्षेत्र जैसा लगता है। आप किसी भी समय विश्लेषण और मार्केटिंग बंद कर सकते हैं।',
  'consent.necessaryTitle': 'अनिवार्य',
  'consent.necessaryDetail': 'स्टूडियो सत्र और यह सहमति विकल्प रखता है। हमेशा चालू।',
  'consent.functionalTitle': 'कार्यात्मक',
  'consent.functionalDetail': 'इस ब्राउज़र पर स्टूडियो प्राथमिकताएँ याद रखता है।',
  'consent.analyticsTitle': 'विश्लेषण',
  'consent.analyticsDetail': 'स्टूडियो उपयोग के बारे में प्लेटफ़ॉर्म टेलीमेट्री।',
  'consent.marketingTitle': 'मार्केटिंग',
  'consent.marketingDetail': 'hvyMETL के बारे में संपर्क के लिए माप। Global Privacy Control चालू होने पर बंद।',
  'consent.savePrefs': 'प्राथमिकताएँ सहेजें',
  'consent.prefsLink': 'कुकी प्राथमिकताएँ',
  'schema.title': 'स्कीमा आयात',
  'schema.pasteHint': 'DDL, JSON Schema, DynamoDB या MongoDB JSON चिपकाएँ। CSV, SQLite या स्कीमा फ़ाइलें यहाँ छोड़ें।',
  'schema.pastePlaceholder': 'छोड़ें/चिपकाएँ…',
  'schema.import': 'स्कीमा आयात करें',
  'schema.loadExample': 'उदाहरण लोड करें',
  'schema.dropHint': 'आयात के लिए फ़ाइलें छोड़ें',
  'schema.detected': 'पहचाना गया',
  'schema.liveTitle': 'लाइव डेटाबेस',
  'schema.modalTitle': 'स्कीमा आयात से शुरू करें',
  'schema.modalSubtitle':
    'स्कीमा चिपकाएँ, फ़ाइल अपलोड करें, या लाइव डेटाबेस से कनेक्ट करें। hvyMETL डिज़ाइन, लागत या ETL से पहले स्रोत मॉडल बनाता है।',
  'schema.modalClose': 'स्कीमा आयात संवाद बंद करें',
  'live.agentHint':
    'hvymetl.studio आपके कंप्यूटर पर डेटाबेस नहीं खोल सकता। एजेंट डाउनलोड करें, कमांड कॉपी करें, और डेटाबेस वाले कंप्यूटर के टर्मिनल में चिपकाएँ। एजेंट आउटबाउंड WebSocket खोलता है, स्कीमा पढ़ता है, और पूर्ण निष्कर्षण स्ट्रीम कर सकता है। Windows पर PowerShell उपयोग करें।',
  'live.agentPlatform': 'इस कंप्यूटर के लिए एजेंट',
  'live.chooseComputer': 'अपना कंप्यूटर चुनें…',
  'live.download': 'डाउनलोड',
  'live.engine': 'डेटाबेस प्रकार',
  'live.uri': 'कनेक्शन URI',
  'live.database': 'डेटाबेस',
  'live.copyCommand': 'कमांड कॉपी करें',
  'live.importLive': 'लाइव डेटा आयात करें',
  'live.reading': 'पढ़ रहा है…',
  'pipeline.title': 'पाइपलाइन',
  'pipeline.run': 'पाइपलाइन चलाएँ',
  'pipeline.csv': 'CSV स्रोत',
  'manager.title': 'मैनेजर',
  'shell.title': 'MongoDB शेल',
  'copilot.title': 'कोपायलट',
  'copilot.open': 'कोपायलट खोलें',
  'status.ready': 'तैयार',
  'footer.apiConnected': 'API कनेक्टेड',
  'footer.apiDisconnected': 'API डिस्कनेक्टेड',
  'workflow.aria': 'माइग्रेशन वर्कफ़्लो',
  'workflow.importDdl': 'DDL आयात',
  'workflow.beforeSql': 'पहले · SQL',
  'workflow.afterMongo': 'बाद · MongoDB',
  'workflow.afterTitleReady': 'माइग्रेशन प्लान से MongoDB संग्रह',
  'workflow.afterTitleNeedPlan': 'पहले माइग्रेशन प्लान बनाएँ',
  'workflow.export': 'माइग्रेशन निर्यात',
  'workflow.exporting': 'निर्यात हो रहा है…',
  'workflow.runPipeline': 'पाइपलाइन चलाएँ',
  'phase.aria': 'स्कीमा चरण',
  'view.aria': 'आरेख दृश्य',
  'view.label': 'दृश्य',
  'view.stacked': 'ऊपर-नीचे विभाजन',
  'view.stackedTitle': 'ऊपर SQL, नीचे MongoDB',
  'view.sideBySide': 'साइड-बाय-साइड विभाजन',
  'view.sideBySideTitle': 'बाएँ SQL, दाएँ MongoDB',
  'view.relTitle': 'पहले · SQL (स्रोत रिलेशनल स्कीमा)',
  'view.mdbTitle': 'बाद · MongoDB (माइग्रेशन प्लान)',
  'sidebar.schemaImport': 'तत्काल स्कीमा आयात',
  'sidebar.embedOverrides': 'एम्बेड ओवरराइड',
  'sidebar.timeSeries': 'टाइम सीरीज़ ओवरराइड',
  'sidebar.sqlTables': 'SQL टेबल',
  'sidebar.snapToGrid': 'ग्रिड पर स्नैप (मुक्त मूव के लिए Shift दबाएँ)',
  'sidebar.mongoTarget': 'MongoDB लक्ष्य स्कीमा',
  'sidebar.mongoTargetHint':
    'AI/RAG माइग्रेशन प्लान — Atlas आयात से पहले संग्रह, एम्बेड, इंडेक्स और पैटर्न निर्णय।',
  'sidebar.mongoCsvHint':
    'पंक्ति संख्या और संबंध कार्डिनैलिटी के लिए SQL टेबल डेटा CSV के रूप में निर्यात करें। SQLite .db आयात में आँकड़े स्वतः शामिल होते हैं।',
  'sidebar.chooseCsvs': 'CSV चुनें',
  'sidebar.refreshDesign': 'डिज़ाइन ताज़ा करें',
  'sidebar.designing': 'डिज़ाइन हो रहा है…',
  'sidebar.downloadPlan': 'प्लान डाउनलोड',
  'sidebar.planPlaceholder': 'migration-plan.json बनाने के लिए डिज़ाइन चलाएँ…',
  'sidebar.transformation': 'रूपांतरण सारांश',
  'sidebar.transformationEmpty':
    'पैटर्न और एम्बेड लागू हुए या नहीं, यह देखने के लिए डिज़ाइन चलाएँ।',
  'sidebar.transformationRefresh': 'सारांश ताज़ा करें',
  'sidebar.transformationUpdating': 'अपडेट हो रहा है…',
  'sidebar.transformationProfile': 'प्रोफ़ाइल {label} ({ratio}) · पंक्ति आँकड़े: ',
  'sidebar.yes': 'हाँ',
  'sidebar.no': 'नहीं',
  'sidebar.csvEnriched': ' · CSV-समृद्ध',
  'sidebar.perCollection': 'प्रति संग्रह ({count})',
  'sidebar.schemaVersioningOnly': 'केवल स्कीमा-संस्करण',
  'sidebar.embedsPrefix': 'एम्बेड: ',
  'sidebar.embedOverridesLink': 'एम्बेड ओवरराइड (पहले SQL)',
  'sidebar.sizingTitle': 'साइज़िंग लागत अनुमान',
  'sidebar.sizingEmpty':
    'Atlas साइज़िंग और मासिक रन लागत का अनुमान लगाने के लिए स्रोत स्कीमा आयात करें।',
  'sidebar.sizingIntro':
    'आपके DDL और वर्कलोड प्रोफ़ाइल से अनुमानित साइज़िंग — औपचारिक Atlas कोट नहीं।',
  'sidebar.datasetScale': 'डेटासेट स्केल — कच्चा डेटा:',
  'sidebar.workloadType': 'वर्कलोड प्रकार',
  'sidebar.workloadReadHeavy': 'पठन-प्रधान (80/20)',
  'sidebar.workloadReadHeavyHint': 'ब्लॉग, स्टोरफ़्रंट, एनालिटिक्स डैशबोर्ड',
  'sidebar.workloadBalanced': 'संतुलित (50/50)',
  'sidebar.workloadBalancedHint': 'मिश्रित ट्रांज़ैक्शनल और रिपोर्टिंग वर्कलोड',
  'sidebar.workloadWriteHeavy': 'लेखन-प्रधान (20/80)',
  'sidebar.workloadWriteHeavyHint': 'IoT लॉगिंग, चैट, वित्तीय लेजर',
  'sidebar.dataGrowth': 'अपेक्षित डेटा वृद्धि:',
  'sidebar.yoy': 'वर्ष-दर-वर्ष',
  'sidebar.sliderNote':
    'स्लाइडर खंडित है: 1 GB–{mid} बाईं आधी हिस्से में; बड़े आकार तेज़ी से {max} तक (केंद्र पर 4 TB)।',
  'sidebar.schemaStatsNote': 'स्कीमा आँकड़े आकार का अनुमान देते हैं; ~{rows} दस्तावेज़।',
  'sidebar.rawRecommendedAria': '{size} कच्चा डेटा · अनुशंसित {tier}',
  'sidebar.archiveByCollection': 'संग्रह के अनुसार आर्काइव पैटर्न',
  'sidebar.eligibleCollections': '{count} पात्र संग्रह',
  'sidebar.eligibleCollection': '{count} पात्र संग्रह',
  'sidebar.archiveRetainHint':
    'हॉट Atlas क्लस्टर पर हाल का डेटा रखें, फिर पुराने दिनांकित दस्तावेज़ Online Archive पर भेजें।',
  'sidebar.recommended': 'अनुशंसित',
  'sidebar.available': 'उपलब्ध',
  'sidebar.dateField': 'दिनांक फ़ील्ड',
  'sidebar.hotRetention': 'हॉट रिटेंशन',
  'sidebar.years': 'वर्ष',
  'sidebar.archivePartitionHint':
    'पार्टीशन: {fields}। हॉट + आर्काइव क्वेरी के लिए Atlas Data Federation की एकीकृत connection string उपयोग करें।',
  'sidebar.recommendedTier': 'अनुशंसित टियर',
  'sidebar.targetWorkloadProfile': 'लक्ष्य वर्कलोड प्रोफ़ाइल',
  'sidebar.recommendedTierLabel': 'अनुशंसित टियर',
  'sidebar.maxConnections': 'अधिकतम कनेक्शन',
  'sidebar.datasetSizeEst': 'डेटासेट आकार (अनु.)',
  'sidebar.planningStorage': 'योजना स्टोरेज (12 माह)',
  'sidebar.exceedsReplicaSet':
    ' · एकल रेप्लिका सेट डिस्क से अधिक — शार्डिंग अनुशंसित',
  'sidebar.inclGrowth': ' सहित {percent}% वर्ष-दर-वर्ष वृद्धि',
  'sidebar.targetRam': 'लक्ष्य RAM (अनु.)',
  'sidebar.avgDocSize': 'औसत दस्तावेज़ आकार',
  'sidebar.workingSetFits':
    'इंडेक्स + सक्रिय वर्किंग सेट का {percent}% WiredTiger कैश में समाता है',
  'sidebar.atlasTierReference':
    'Atlas टियर संदर्भ (vCPU, RAM, स्टोरेज स्केल, अधिकतम कनेक्शन)',
  'sidebar.tierCol': 'टियर',
  'sidebar.vcpuCol': 'vCPU',
  'sidebar.ramCol': 'RAM',
  'sidebar.storageScaleCol': 'मानक स्टोरेज स्केल',
  'sidebar.maxConnCol': 'अधिकतम कनेक्शन',
  'sidebar.shardingTitle': 'शार्डिंग अनुशंसित',
  'sidebar.shardingCollections': '{count} संग्रह',
  'sidebar.shardingHeader': 'शार्डिंग अनुशंसित ({threshold}+ डेटासेट)',
  'sidebar.shardingIntro':
    'इस पैमाने पर, समान रूप से रीड/राइट वितरित करने वाली shard keys के साथ शार्डिड क्लस्टर की योजना बनाएँ।',
  'sidebar.shardingDocs': 'शार्डिंग दस्तावेज़ीकरण',
  'sidebar.shardingBestPractices': 'प्रदर्शन सर्वोत्तम अभ्यास',
  'sidebar.collectionCol': 'संग्रह',
  'sidebar.hotStorageCol': 'हॉट स्टोरेज',
  'sidebar.shardKeyCol': 'Shard key',
  'sidebar.strategyCol': 'रणनीति',
  'sidebar.supportingIndexCol': 'सहायक इंडेक्स',
  'sidebar.mongoCollections': 'MongoDB संग्रह',
  'sidebar.shareDiagram': 'आरेख साझा करें',
  'sidebar.shareSqlHint': 'SQL टेबल लेआउट और स्थितियाँ निर्यात या आयात करें।',
  'sidebar.shareMongoHint': 'MongoDB संग्रह लेआउट, माइग्रेशन प्लान और कैनवास स्थितियाँ निर्यात/आयात करें।',
  'sidebar.exportDiagram': 'आरेख निर्यात',
  'sidebar.importDiagram': 'आरेख आयात',
  'sidebar.pipelineHistory': 'पाइपलाइन इतिहास',
  'sidebar.session': 'सत्र',
  'sidebar.sessionHint':
    'आपका काम इस ब्राउज़र टैब में सहेजा जाता है। रीफ़्रेश पर स्कीमा, लेआउट और माइग्रेशन आर्टिफ़ैक्ट बने रहते हैं।',
  'sidebar.clearSession': 'सत्र साफ़ करें',
  'header.signOut': 'साइन आउट',
  'header.terms': 'नियम',
};

export const CATALOGS: Record<LocaleId, MessageCatalog> = {
  en,
  pt,
  es,
  'zh-CN': zhCN,
  hi,
};

export function translate(locale: LocaleId, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = CATALOGS[locale][key] ?? CATALOGS.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
