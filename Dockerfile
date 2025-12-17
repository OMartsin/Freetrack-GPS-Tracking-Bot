# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci

# Copy migration config, migrations, tsconfig and source files
COPY .pgmigrate.json ./
COPY migrations ./migrations
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Verify build output
RUN ls -la dist/

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (we need devDependencies for migrations)
RUN npm ci

# Copy built application, migrations, and config
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/.pgmigrate.json ./

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

CMD ["./docker-entrypoint.sh"]

