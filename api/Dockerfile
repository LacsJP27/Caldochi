# BUILD STAGE
FROM node:24-slim AS build
WORKDIR /app

# Dependency manifests only
COPY package.json package-lock.json ./
COPY api/package.json ./api/
COPY web/package.json ./web/
RUN npm ci --workspace @caldochi/api

# Source, then compile
COPY api/tsconfig.json ./api/
COPY api/src ./api/src
RUN npm run build --workspace @caldochi/api

#RUNTIME STAGE
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY api/package.json ./api/
COPY web/package.json ./web/
RUN npm ci --workspace @caldochi/api --omit=dev

COPY --from=build /app/api/dist ./api/dist

ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

USER node
CMD ["node", "api/dist/server.js"]
