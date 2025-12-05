# LiteAssistant Deployment Guide

## Overview

LiteAssistant is a lightweight home automation platform with a Python FastAPI backend and React frontend. This guide covers deployment using Docker.

## Prerequisites

- Docker (version 20.10 or higher)
- Docker Compose (version 2.0 or higher)
- An MQTT broker (e.g., Mosquitto) running separately
- Git (for cloning the repository)

## Quick Start with Docker

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd LiteAssistant
```

### 2. Configure Environment Variables

Copy the example environment file and customize it:

```bash
cp .env.example .env
```

Edit `.env` and set your values:

```env
# Generate a secure secret key
SECRET_KEY=$(openssl rand -hex 32)

# Database configuration (default values work with docker-compose)
DATABASE_URL=postgresql+asyncpg://liteassistant:liteassistant@postgres:5432/liteassistant
```

### 3. Build and Run

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

The application will be available at:
- **Web Interface**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

### 4. Create Initial User

```bash
# Access the running container
docker-compose exec app python -c "
import asyncio
from backend.database import AsyncSessionLocal
from backend.crud import create_user
from backend.schemas import UserCreate

async def create_admin():
    async with AsyncSessionLocal() as db:
        user = UserCreate(username='admin', password='admin')
        await create_user(db, user)
        print('Admin user created!')

asyncio.run(create_admin())
"
```

Or create a user via the API:

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "yourpassword"}'
```

### 5. Configure MQTT Connection

1. Log in to the web interface
2. Navigate to **Settings**
3. Enter your MQTT broker details:
   - **Host**: Your MQTT broker IP/hostname
   - **Port**: 1883 (default)
   - **Username**: (if required)
   - **Password**: (if required)
4. Click **Save** and **Test Connection**

### 6. Discover Tasmota Devices

After configuring MQTT:
1. Go to **Settings**
2. Click **Refresh Discovery**
3. Your Tasmota devices should appear in the **Dashboard**

## Docker Commands

### Start Services

```bash
docker-compose up -d
```

### Stop Services

```bash
docker-compose down
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f postgres
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart app
```

### Rebuild After Code Changes

```bash
# Rebuild and restart
docker-compose up -d --build

# Force rebuild without cache
docker-compose build --no-cache
docker-compose up -d
```

### Access Container Shell

```bash
# Access app container
docker-compose exec app sh

# Access database
docker-compose exec postgres psql -U liteassistant -d liteassistant
```

### Clean Up

```bash
# Stop and remove containers, networks
docker-compose down

# Also remove volumes (WARNING: deletes all data)
docker-compose down -v
```

## Manual Deployment (Without Docker)

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 15+
- MQTT Broker (Mosquitto)

### Backend Setup

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
cd backend
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql+asyncpg://user:password@localhost:5432/liteassistant"
export SECRET_KEY="your-secret-key"

# Run migrations
alembic upgrade head

# Start server
cd ..
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Setup

```bash
# Install dependencies
cd frontend
npm install

# Development mode
npm run dev

# Production build
npm run build
# Copy dist/ to backend/static/
cp -r dist ../backend/static
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://liteassistant:liteassistant@postgres:5432/liteassistant` |
| `SECRET_KEY` | JWT secret key for authentication | (required) |

### MQTT Configuration

MQTT settings are configured through the web interface:
1. Navigate to **Settings**
2. Enter your MQTT broker details
3. Save and test the connection

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Application Won't Start

```bash
# Check logs for errors
docker-compose logs app

# Verify database migrations
docker-compose exec app sh -c "cd backend && alembic current"

# Run migrations manually
docker-compose exec app sh -c "cd backend && alembic upgrade head"
```

### MQTT Connection Fails

1. Verify your MQTT broker is running and accessible
2. Check firewall rules
3. Verify credentials
4. Test connection from the container:

```bash
docker-compose exec app sh -c "apt-get update && apt-get install -y mosquitto-clients"
docker-compose exec app mosquitto_sub -h <mqtt-host> -p 1883 -t '#' -v
```

### Frontend Not Loading

```bash
# Rebuild with no cache
docker-compose build --no-cache app
docker-compose up -d app

# Check if static files exist
docker-compose exec app ls -la backend/static
```

## Backup and Restore

### Backup Database

```bash
# Create backup
docker-compose exec postgres pg_dump -U liteassistant liteassistant > backup.sql

# Or with docker
docker-compose exec -T postgres pg_dump -U liteassistant liteassistant > backup.sql
```

### Restore Database

```bash
# Restore from backup
docker-compose exec -T postgres psql -U liteassistant liteassistant < backup.sql
```

## Production Deployment

### Security Recommendations

1. **Change Default Passwords**:
   - Update PostgreSQL password in `docker-compose.yml`
   - Generate a strong `SECRET_KEY`

2. **Use HTTPS**:
   - Deploy behind a reverse proxy (Nginx, Traefik)
   - Obtain SSL certificates (Let's Encrypt)

3. **Firewall**:
   - Only expose necessary ports
   - Restrict database access to localhost

4. **Regular Backups**:
   - Set up automated database backups
   - Store backups securely off-site

### Example Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://localhost:8000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Monitoring

### Health Checks

```bash
# Check application health
curl http://localhost:8000/

# Check API
curl http://localhost:8000/docs
```

### Resource Usage

```bash
# View resource usage
docker stats

# View specific container
docker stats liteassistant-app
```

## Support

For issues and questions:
- Check the logs: `docker-compose logs -f`
- Review this documentation
- Check the API documentation at http://localhost:8000/docs
