# syntax=docker/dockerfile:1.7-labs

FROM node:20.18.1-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential python3 \
  && apt-get clean

WORKDIR /src
RUN npm install -g bun@1.2.23 lerna@7.4.2
ENV PATH=/src/node_modules/.bin:$PATH

COPY . .
RUN bun pm cache rm \
  && bun install \
  && bun add ajv@8.12.0

ARG APP_CONFIG=config/substrate-railway.js
ARG PUBLIC_URL=/
ENV QUICK_BUILD=true
ENV PUBLIC_URL=${PUBLIC_URL}
RUN bun run build

FROM caddy:2.10.2-alpine
COPY --from=build /src/platform/app/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
