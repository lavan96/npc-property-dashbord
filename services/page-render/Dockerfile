# Playwright's image ships Chromium + matching system deps for the pinned version.
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

# Install only production deps (browsers already in the base image).
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

ENV PORT=8080 \
    NODE_ENV=production
EXPOSE 8080

# Run as the non-root user provided by the Playwright image.
USER pwuser

CMD ["node", "src/server.mjs"]
