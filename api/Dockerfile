FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY api ./api
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
ENV NODE_ENV=production HOST=0.0.0.0 API_PORT=3001
EXPOSE 3001
CMD ["./node_modules/.bin/tsx", "api/server.ts"]
