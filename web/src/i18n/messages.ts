import type { LocaleId } from './locales';

/** Studio UI strings. Deep panel copy can adopt these keys incrementally. */
export type MessageKey =
  | 'nav.primary'
  | 'nav.database'
  | 'nav.schema'
  | 'nav.sizing'
  | 'nav.shell'
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
  'nav.copilot': 'Copiloto',
  'nav.roles': 'Funções',
  'nav.settings': 'Configurações',
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
  'nav.copilot': 'Copiloto',
  'nav.roles': 'Roles',
  'nav.settings': 'Configuración',
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
  'nav.copilot': '助手',
  'nav.roles': '角色',
  'nav.settings': '设置',
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
  'nav.copilot': 'कोपायलट',
  'nav.roles': 'भूमिकाएँ',
  'nav.settings': 'सेटिंग्स',
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
