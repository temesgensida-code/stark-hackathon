# Next.js standalone build. EthioDeploy builds this automatically when it finds a Dockerfile.
# API_INTERNAL_URL and NEXT_PUBLIC_* are compiled into the build, so pass them as build arguments.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG API_INTERNAL_URL=http://api:8000
ARG NEXT_PUBLIC_VOXIDE_PUBLIC_KEY=
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_PUBLIC_VOXIDE_PUBLIC_KEY=$NEXT_PUBLIC_VOXIDE_PUBLIC_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
