FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/restaurant/package.json apps/restaurant/
RUN npm ci --workspace apps/restaurant --include-workspace-root=false
COPY apps/restaurant apps/restaurant
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w apps/restaurant

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/restaurant/.next/standalone ./
COPY --from=build /repo/apps/restaurant/.next/static ./apps/restaurant/.next/static
EXPOSE 3001
CMD ["node", "apps/restaurant/server.js"]
