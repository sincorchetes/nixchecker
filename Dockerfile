FROM oven/bun:1 AS build
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server ./server
USER bun
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "server/serve.ts"]
