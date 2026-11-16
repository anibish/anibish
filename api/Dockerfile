FROM node:22-alpine
RUN apk add --no-cache 'zlib>=1.4-r0'
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY api ./api
COPY src/lib/data.ts ./src/lib/data.ts
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
ENV NODE_ENV=production HOST=0.0.0.0 API_PORT=3001
EXPOSE 3001
CMD ["./node_modules/.bin/tsx", "api/server.ts"]
