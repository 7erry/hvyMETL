# Contributing

## Setup

Node.js 20 or newer, plus npm and Git.

```bash
git clone https://github.com/7erry/hvyMETL.git
cd hvyMETL
npm install
cp .env.example .env
npm run dev:ui
```

Open http://localhost:3847. `.env` can stay empty for the UI. Atlas import needs `MONGODB_URI` and `CSV_TO_ATLAS_PATH` (a built [cvsToAtlas](https://github.com/7erry/cvsToAtlas) clone). Hybrid RAG needs `MONGODB_MODEL_KEY`. Details are in the [README](README.md).

## Tests

```bash
npm test
```

That suite is offline. These two need the credentials named above:

```bash
npm run validate-csv-to-atlas
npm run validate-hybrid-rag
```

## Pull requests

Open a pull request against `main`. Say what changed and how you tested it.
