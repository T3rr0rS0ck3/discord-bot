# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV BOT_DATA_DIR=/data
ENV ADMIN_UI_HOST=0.0.0.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --build-from-source=sqlite3

COPY --from=builder /app/dist ./dist
RUN mkdir -p /data

EXPOSE 8787 3000
CMD ["node", "dist/index.js"]
