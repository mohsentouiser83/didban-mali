FROM node:22.23.1-alpine AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json .npmrc ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages ./packages
RUN npm ci

FROM node:22.23.1-alpine AS builder
WORKDIR /workspace
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/apps/web/node_modules ./apps/web/node_modules
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm run build --workspace=@didban/web

FROM node:22.23.1-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/apps/web/node_modules ./apps/web/node_modules
COPY package.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY --from=builder /workspace/apps/web/.next ./apps/web/.next
COPY --from=builder /workspace/apps/web/public ./apps/web/public

USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=@didban/web"]
