FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -s /run/secrets/build_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/build_ca npm ci --no-audit --no-fund; \
    else npm ci --no-audit --no-fund; fi
COPY client ./client
COPY server ./server
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -s /run/secrets/build_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/build_ca npm ci --omit=dev --no-audit --no-fund; \
    else npm ci --omit=dev --no-audit --no-fund; fi \
    && npm cache clean --force
COPY --chown=node:node --from=build /app/dist/server ./dist/server
COPY --chown=node:node --from=build /app/server/migrations ./server/migrations
COPY --chown=node:node --from=build /app/client/dist ./client/dist
USER node
EXPOSE 3001
CMD ["node", "dist/server/index.js"]
