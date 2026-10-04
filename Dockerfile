# ==============================================================================
# DocumentChaser - Production Dockerfile for Google Cloud Run
# Target: Google Artifact Registry & Google Cloud Run
# Architecture: Multi-stage, non-root, zero baked secrets, ADC compatible
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Frontend Assets
# ------------------------------------------------------------------------------
FROM node:22-slim AS builder

WORKDIR /app

# Copy dependency declarations
COPY package.json package-lock.json ./

# Install dependencies needed for Vite & Tailwind build
RUN npm ci

# Copy configuration and frontend source code
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src

# Compile production Vite distribution into /app/dist
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Container Runtime
# ------------------------------------------------------------------------------
FROM node:22-slim AS runner

WORKDIR /app

# Production environment configuration
ENV NODE_ENV=production
# Google Cloud Run injects PORT dynamically (default 8080)
ENV PORT=8080

# Install production dependencies only (omits Vite/Tailwind build tooling)
# tsx is installed as a production dependency for reliable runtime execution
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled frontend distribution from builder stage
COPY --from=builder /app/dist ./dist

# Copy backend TypeScript application files and SQL schemas
COPY server ./server
COPY server.ts ./server.ts
COPY tsconfig.json ./tsconfig.json

# Cloud Run security hardening: run container as non-root node user
USER node

# Expose Cloud Run HTTP container port
EXPOSE 8080

# Execute server process directly so SIGTERM is handled immediately by PID 1
CMD ["node", "node_modules/.bin/tsx", "server.ts"]
