# docker build -t hvymetl . && docker run --rm -p 3847:3847 hvymetl
FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 rebuilds a native addon in postinstall
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json web/
RUN npm ci && npm ci --prefix web --include=dev
COPY . .
RUN npm run build:ui \
 && npm prune --omit=dev --ignore-scripts \
 && rm -rf web/node_modules

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
RUN chown node:node /app
USER node
EXPOSE 3847
CMD ["node", "dist/server/index.js"]
