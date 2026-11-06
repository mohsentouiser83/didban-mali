FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=didban-pnpm12,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1 DIDBAN_API_URL=http://api:8000
RUN pnpm --dir apps/web build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
COPY --from=build --chown=node:node /app /app
WORKDIR /app/apps/web
USER node
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DIDBAN_API_URL=http://api:8000
EXPOSE 3010
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3010"]
