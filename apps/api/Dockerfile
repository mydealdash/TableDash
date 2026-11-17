FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --workspace apps/api --include-workspace-root=false
COPY apps/api apps/api
RUN npm run build -w apps/api

FROM node:22-alpine
WORKDIR /repo
ENV NODE_ENV=production PORT=4000
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api ./apps/api
WORKDIR /repo/apps/api
EXPOSE 4000
# Apply database migrations, add the demo data only if the database is empty, then start the API.
CMD ["sh", "-c", "npx ts-node src/db/migrate.ts && SEED_IF_EMPTY=true npx ts-node src/db/seed.ts && node dist/main.js"]
