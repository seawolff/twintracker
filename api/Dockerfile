FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM base AS dev
COPY . .
CMD ["npm", "run", "dev"]

FROM base AS prod
ENV NODE_ENV=production
COPY . .
RUN npm run build -w @tt/core && npm run build -w api
# Run migrations then start — migrate.js is idempotent (all IF NOT EXISTS / safe UPDATEs)
CMD ["sh", "-c", "node api/src/db/migrate.js && node api/dist/index.js"]
