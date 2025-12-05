# Multi-stage build for LiteAssistant

## Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy only package files first for caching
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy the rest of the frontend source and build
COPY frontend/ ./
RUN npm run build

## Stage 2: Python Backend
FROM python:3.11-slim

WORKDIR /app

# Install system build dependencies (gcc) and PostgreSQL client
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/ ./backend/

# Copy built frontend assets into the backend static directory
COPY --from=frontend-builder /app/frontend/dist ./backend/static

# Ensure alembic versions directory exists
RUN mkdir -p backend/alembic/versions

EXPOSE 8000

ENV PYTHONUNBUFFERED=1
# ENV DATABASE_URL is set via docker-compose

# Run migrations then start the FastAPI server
CMD ["sh", "-c", "cd backend && alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
