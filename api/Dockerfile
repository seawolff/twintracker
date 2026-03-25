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
RUN npm run build
# Run migrations then start — migrate.js is idempotent (all IF NOT EXISTS / safe UPDATEs)
CMD ["sh", "-c", "node src/db/migrate.js && node dist/index.js"]
