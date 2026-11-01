FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1 DIDBAN_API_URL=http://api:8000
RUN pnpm --dir apps/web build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
COPY --from=build --chown=node:node /app /app
USER node
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DIDBAN_API_URL=http://api:8000
EXPOSE 3010
CMD ["pnpm", "--dir", "apps/web", "start"]
