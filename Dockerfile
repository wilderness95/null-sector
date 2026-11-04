FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5173
ENV STATIC_DIR=/app/dist

COPY --chown=node:node dist/ ./dist/
COPY --chown=node:node build/server.mjs ./server/index.mjs

USER node
EXPOSE 5173
CMD ["node", "server/index.mjs"]
