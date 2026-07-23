/** OpenAI function definitions for studio migration workflow steps. */
export const COPILOT_WORKFLOW_OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'clearSession',
      description:
        'Clears the current hvyMETL session (schema, design, overrides) and opens the schema import dialog. Use as step 1 before importing fresh SQL.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'importSchemaDdl',
      description:
        'Imports SQL DDL into the canvas (step 1 after clearSession when the user supplied DDL). Parses tables and relationships and auto-detects workload profile when possible.',
      parameters: {
        type: 'object',
        required: ['ddl'],
        properties: {
          ddl: { type: 'string', description: 'Full SQL DDL script to import' },
          dialect: {
            type: 'string',
            description: 'Optional SQL dialect id (e.g. postgresql, oracle, sqlite). Uses the current UI dialect when omitted.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'importBuiltinExample',
      description:
        'Loads a bundled example schema by id (e.g. oracle, analytics, cms, oracle/oracle-hr.ddl). Use when the user wants a demo schema without pasting DDL.',
      parameters: {
        type: 'object',
        required: ['exampleId'],
        properties: {
          exampleId: { type: 'string', description: 'Built-in example id from GET /api/schema/builtin-examples' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'refreshDesign',
      description:
        'Runs Refresh design (ML/RAG MongoDB schema design) for the loaded SQL model. Step 2 after schema import. Requires an imported schema.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'runPipeline',
      description:
        'Opens the Run pipeline panel so the user can load CSV/SQLite data into MongoDB Atlas. Step 3 after Refresh design. Requires schema and typically a completed design.',
      parameters: { type: 'object', properties: {} },
    },
  },
] as const;

export type CopilotWorkflowToolName =
  | 'clearSession'
  | 'importSchemaDdl'
  | 'importBuiltinExample'
  | 'refreshDesign'
  | 'runPipeline';
