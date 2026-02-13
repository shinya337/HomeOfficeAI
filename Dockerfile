# =============================================================================
# HomeOffice.ai - Multi-stage Docker Build
# =============================================================================
# Stage 1: Frontend build (Vite)
# Stage 2: Backend build (TypeScript compile)
# Stage 3: Production runtime
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Frontend Build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# Copy frontend package files and install dependencies
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Backend Build (TypeScript compile)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS backend-build

WORKDIR /app/backend

# Copy backend package files and install dependencies
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci

# Copy packages and install their dependencies
COPY backend/packages/ ./packages/
RUN for dir in packages/*/; do \
      if [ -f "$dir/package.json" ]; then \
        (cd "$dir" && npm ci) || true; \
      fi; \
    done

# Copy backend source
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src/ ./src/

# Run TypeScript build
RUN npx tsc -p tsconfig.build.json || true

# ---------------------------------------------------------------------------
# Stage 3: Production Runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS production

WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Copy backend package files and install production dependencies only
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

# Copy packages and install production dependencies
COPY backend/packages/ ./packages/
RUN for dir in packages/*/; do \
      if [ -f "$dir/package.json" ]; then \
        (cd "$dir" && npm ci --omit=dev) || true; \
      fi; \
    done

# Copy compiled backend from Stage 2
COPY --from=backend-build /app/backend/dist/ ./dist/

# Copy packages node_modules into dist/packages for runtime module resolution
# Compiled code in dist/packages/*/src/ needs access to each package's dependencies
RUN for dir in packages/*/; do \
      pkg_name=$(basename "$dir"); \
      if [ -d "$dir/node_modules" ]; then \
        cp -r "$dir/node_modules" "dist/packages/$pkg_name/node_modules"; \
      fi; \
    done

# Copy frontend build output from Stage 1
# server.js resolves: path.resolve(dirname(server.js), '..', 'frontend-dist')
# At runtime: /app/dist/src/server.js -> /app/dist/frontend-dist/
COPY --from=frontend-build /app/frontend/dist/ ./dist/frontend-dist/

# Expose port
EXPOSE 8080

# Start the server
ENTRYPOINT ["node", "dist/src/server.js"]
