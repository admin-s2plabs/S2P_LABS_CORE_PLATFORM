# ---------- build stage ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
# Native build dependencies for canvas / argon2 / sharp
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# CHANGED: pin Puppeteer's Chrome download to a path we control so it
# survives into the runtime stage (default is /root/.cache/puppeteer,
# which never gets copied)
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Install ALL deps (including dev) for the build step
# Using npm install instead of npm ci to re-resolve native deps on Linux
COPY package*.json ./
RUN npm install

# Copy full source and build
COPY . .
RUN npm run build

# Reinstall production-only deps cleanly (faster than prune)
# puppeteer is a prod dep, so it stays; postinstall sees Chrome already
# cached at PUPPETEER_CACHE_DIR and skips re-download
RUN npm install --omit=dev

# ---------- runtime stage ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# CHANGED: runtime must look in the same cache dir we populated above
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Runtime libraries for all native modules:
# - canvas / argon2      → cairo, pango, jpeg, gif, rsvg
# - sharp                → libvips
# - poppler-utils        → pdftoppm binary
# - postgresql-client-17 → pg_dump/pg_restore matching server PG 17.x
#   NOTE: must use PGDG repo — Debian default gives pg_dump 15
# - CHANGED puppeteer    → headless Chrome needs nss/atk/cups/drm/gbm/
#                          xkb/x11/asound/atspi + fonts to actually launch
# - CHANGED pdf2pic      → graphicsmagick + ghostscript (PDF → image)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
       | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] \
       https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libvips42 \
    poppler-utils \
    postgresql-client-17 \
    graphicsmagick \
    ghostscript \
    fonts-liberation \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxext6 \
    libxcb1 \
    libx11-6 \
    libxshmfence1 \
    libasound2 \
    libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# AI knowledge layer assets (prompts, skills, knowledge, suggestions). These are read
# from disk at runtime and are NOT bundled into dist/, so they must ship explicitly —
# without this the server fails its boot-time assertAssetsPresent() check.
COPY --from=builder /app/ai ./ai
# CHANGED: bring Puppeteer's downloaded Chrome across from the builder
COPY --from=builder /app/.cache/puppeteer ./.cache/puppeteer

EXPOSE 5000
CMD ["node", "dist/index.cjs"]