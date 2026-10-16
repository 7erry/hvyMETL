import { Router } from 'express';
import { inferWorkloadProfile } from '../profiles/inferProfile.js';
import {
  importLiveMongoDatabase,
  mongoDatabaseName,
  publicMongoError,
} from '../utilities/liveMongoImport.js';
import { isHostedStudioRequest } from './hosted.js';

const HOSTED_REFUSAL =
  'Live import from the hosted studio cannot reach a private database. Run the studio on the same machine as MongoDB.';

/** Import a sampled MongoDB schema. Hosted requests are refused so the server is not an open proxy. */
export function createLiveMongoImportRouter(): Router {
  const router = Router();

  router.post('/import-live', async (req, res) => {
    if (isHostedStudioRequest(req)) {
      res.status(400).json({ error: HOSTED_REFUSAL });
      return;
    }
    const uri = typeof req.body?.uri === 'string' ? req.body.uri : '';
    const requestedDatabase = typeof req.body?.database === 'string' ? req.body.database : undefined;
    try {
      const database = mongoDatabaseName(uri, requestedDatabase);
      const model = await importLiveMongoDatabase(uri, database);
      const inferred = inferWorkloadProfile(model);
      res.json({
        model,
        ddl: `// Live MongoDB database ${database}. Schema inferred from a sample of documents.\n`,
        dialect: 'mongodb-json',
        inferred,
      });
    } catch (error) {
      res.status(400).json({ error: publicMongoError(error) });
    }
  });

  return router;
}
