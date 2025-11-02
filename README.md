# MindBridge

A peer support web app that forms small, psychologically safe peer circles with structured prompts and safety guardrails.

## Project Structure

```
MindBridge/
├── frontend/          # React + Vite + TypeScript + Tailwind v4 + Zustand
├── backend/           # Go + Gin Framework
└── docker/            # Docker configurations
```

## Tech Stack

### Frontend
- React with Vite
- TypeScript
- Tailwind CSS v4
- Zustand (state management)

### Backend
- Go (Golang)
- Gin Web Framework
- Prisma ORM

### Database
- PostgreSQL (Docker)

## Getting Started

### Prerequisites
- Node.js (v20+)
- Go (v1.21+)
- Docker & Docker Compose
- pnpm (recommended)

### Quick Setup

1. **Start PostgreSQL Database**
   ```bash
   docker-compose up -d
   ```

2. **Setup Backend**
   ```bash
   cd backend
   go mod download
   go run github.com/steebchen/prisma-client-go db push
   go run main.go
   ```

3. **Setup Frontend** (in a new terminal)
   ```bash
   cd frontend
   pnpm install
   cp .env.example .env # optional, configure API base URL
   pnpm dev
   ```

### Access Points

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8080
- **PostgreSQL**: localhost:5432
- **API Health Check**: http://localhost:8080/api/health

### Useful Commands

```bash
# View database GUI
cd backend && go run github.com/steebchen/prisma-client-go studio

# View database logs
docker-compose logs -f

# Stop database
docker-compose down
```

For detailed setup instructions, see [SETUP.md](./SETUP.md)

## License

MIT
