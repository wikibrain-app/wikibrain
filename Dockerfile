# WikiBrain self-hosting image. Multi-stage: build the web app and the server, then a slim runtime.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY web ./web
COPY templates ./templates
COPY migrations ./migrations
COPY scripts ./scripts
# APP_URL is needed at build time for the prerendered pages' canonical/hreflang/JSON-LD URLs (scripts/prerender-help.tsx).
# docker compose passes it automatically; otherwise use --build-arg APP_URL=... (some platforms pass their service variables as build args).
ARG APP_URL
ENV APP_URL=$APP_URL
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
# Short git hash for /healthz and the settings footer. compose passes GIT_COMMIT; the second arg picks up
# platforms that expose the deployed commit under their own name.
ARG GIT_COMMIT
ARG RAILWAY_GIT_COMMIT_SHA
# Headless Chromium for importing JavaScript-rendered pages (src/headless.ts). Adds ~300 MB; set IMPORT_HEADLESS=0 at runtime to disable.
ENV NODE_ENV=production PORT=3000 IMPORT_HEADLESS=1 GIT_COMMIT=${GIT_COMMIT:-$RAILWAY_GIT_COMMIT_SHA} PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx --yes playwright@1.62.1 install --with-deps chromium-headless-shell && rm -rf /var/lib/apt/lists/* /root/.npm
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/templates ./templates
COPY --from=build /app/migrations ./migrations
COPY package.json ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/server.js"]
