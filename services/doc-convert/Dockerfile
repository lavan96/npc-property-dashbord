FROM node:20-bookworm-slim

# LibreOffice (headless) + a broad font set so converted docs look right.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-core libreoffice-writer libreoffice-impress libreoffice-calc \
      fonts-dejavu fonts-liberation fonts-noto-core fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY src ./src

# HOME must be writable for the per-request LibreOffice profile.
ENV PORT=8080 \
    NODE_ENV=production \
    HOME=/tmp
EXPOSE 8080

CMD ["node", "src/server.mjs"]
