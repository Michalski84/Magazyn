FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p logs && chown -R node:node /app

COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node server ./server
COPY --chown=node:node src ./src
COPY --chown=node:node index.htm sw.js server.js ./

USER node
EXPOSE 3000

CMD ["node", "server.js"]
