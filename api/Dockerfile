FROM node:22-alpine
RUN apk add --no-cache 'zlib>=1.4-r0'
WORKDIR /app
COPY package.json package-lock.json ./
# Runtime commands use Node and the project's installed executables directly.
RUN npm ci --omit=dev \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY api ./api
COPY src/lib/data.ts ./src/lib/data.ts
COPY src/lib/retention-options.ts ./src/lib/retention-options.ts
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
ENV NODE_ENV=production HOST=0.0.0.0 API_PORT=3001
EXPOSE 3001
CMD ["./node_modules/.bin/tsx", "api/server.ts"]
