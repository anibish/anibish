FROM node:22-alpine AS patched_base
# Apply the vendor's fixed library in every build/runtime stage.
RUN apk add --no-cache 'zlib>=1.4-r0'
FROM patched_base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
FROM patched_base AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ARG API_INTERNAL_URL=http://api:3001
ARG NEXT_PUBLIC_LAUNCH_MODE=public
ENV NEXT_PUBLIC_LAUNCH_MODE=$NEXT_PUBLIC_LAUNCH_MODE
ENV NEXT_PUBLIC_REVIEW_IMAGES_ENABLED=false
ENV NODE_OPTIONS=--max-old-space-size=1536
ENV API_INTERNAL_URL=$API_INTERNAL_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM patched_base AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
