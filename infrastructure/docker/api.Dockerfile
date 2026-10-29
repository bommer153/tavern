# Build from repo root: docker build -f infrastructure/docker/api.Dockerfile -t tavern-api .
FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @tavern/shared build && pnpm --filter @tavern/api build && pnpm deploy --filter @tavern/api --prod /out

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out .
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
