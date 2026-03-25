FROM node:20-alpine AS base
WORKDIR /app

FROM base AS dev
COPY . .
RUN npm install
CMD ["npm", "run", "dev"]

FROM base AS prod
COPY . .
RUN npm install
RUN npm run build -w @tt/core && npm run build -w api
ENV NODE_ENV=production
# Run migrations then start — migrate.js is idempotent (all IF NOT EXISTS / safe UPDATEs)
CMD ["sh", "-c", "node api/src/db/migrate.js && node api/dist/index.js"]
