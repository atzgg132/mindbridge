# MindBridge Setup Guide

## Prerequisites

- **Node.js** v20+ ([Download](https://nodejs.org/))
- **Go** v1.21+ ([Download](https://go.dev/dl/))
- **Docker & Docker Compose** ([Download](https://www.docker.com/))
- **pnpm** (Install: `npm install -g pnpm`)

## Initial Setup

### 1. Database Setup

Start the PostgreSQL database using Docker:

```bash
docker-compose up -d
```

Verify the database is running:

```bash
docker ps
```

### 2. Backend Setup

Navigate to the backend directory:

```bash
cd backend
```

Install Go dependencies:

```bash
go mod download
```

Push the Prisma schema to the database:

```bash
go run github.com/steebchen/prisma-client-go db push
```

Copy environment variables:

```bash
cp .env.example .env
```

Start the backend server:

```bash
go run main.go
```

The backend will be available at `http://localhost:8080`

### 3. Frontend Setup

Navigate to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
pnpm install

# optional: point the frontend directly at your backend instead of Vite's proxy
cp .env.example .env
```

Start the development server:

```bash
pnpm dev
```

The frontend will be available at `http://localhost:5173`

## Quick Start

After initial setup, use these commands from the project root:

```bash
# Start database
docker-compose up -d

# Start backend (in one terminal)
cd backend && go run main.go

# Start frontend (in another terminal)
cd frontend && pnpm dev
```

## Available Scripts

### Root Level

- `pnpm docker:up` - Start PostgreSQL database
- `pnpm docker:down` - Stop PostgreSQL database
- `pnpm docker:logs` - View database logs
- `pnpm dev:frontend` - Start frontend dev server
- `pnpm dev:backend` - Start backend server
- `pnpm build:frontend` - Build frontend for production
- `pnpm db:push` - Push Prisma schema to database
- `pnpm db:generate` - Generate Prisma client
- `pnpm db:studio` - Open Prisma Studio (database GUI)

### Frontend

```bash
cd frontend
pnpm dev          # Start dev server
pnpm build        # Build for production
pnpm preview      # Preview production build
pnpm lint         # Run ESLint
```

### Backend

```bash
cd backend
go run main.go    # Start server
go test ./...     # Run tests
go build          # Build binary
```

## Environment Variables

### Backend (.env)

```env
PORT=8080
GIN_MODE=debug
DATABASE_URL=postgresql://mindbridge:mindbridge_password@localhost:5432/mindbridge?schema=public
JWT_SECRET=dev-secret-key-change-in-production
APP_ENV=development
```

### Frontend (.env)

```env
# Defaults to '/api' via Vite proxy. Override when serving the frontend without the dev server.
VITE_API_BASE_URL=http://localhost:8080/api
```

## Project Structure

```
MindBridge/
├── frontend/              # React + Vite + TypeScript + Tailwind v4
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Page components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── store/        # Zustand state management
│   │   ├── lib/          # Utility libraries (API client, etc.)
│   │   ├── types/        # TypeScript type definitions
│   │   └── api/          # API integration
│   └── ...
│
├── backend/              # Go + Gin Framework
│   ├── handlers/         # HTTP request handlers
│   ├── models/           # Data models
│   ├── middleware/       # Gin middleware
│   ├── config/           # Configuration
│   ├── utils/            # Utility functions
│   ├── prisma/           # Prisma schema and client
│   └── main.go           # Application entry point
│
├── docker/               # Docker configurations
└── docker-compose.yml    # PostgreSQL setup
```

## Troubleshooting

### Database Connection Issues

1. Ensure Docker is running
2. Check if PostgreSQL container is up: `docker ps`
3. Restart container: `docker-compose restart`

### Frontend Build Issues

1. Clear node_modules: `rm -rf node_modules && pnpm install`
2. Clear Vite cache: `rm -rf node_modules/.vite`

### Backend Build Issues

1. Tidy Go modules: `go mod tidy`
2. Regenerate Prisma client: `go run github.com/steebchen/prisma-client-go generate`

## Next Steps

1. Implement authentication system
2. Create user registration and login flows
3. Design peer circle creation and management
4. Implement structured prompt system
5. Add safety guardrails (content masking, email escalation)

## Tech Stack

- **Frontend**: React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4, Zustand 5
- **Backend**: Go 1.21+, Gin Web Framework
- **Database**: PostgreSQL 16, Prisma ORM
- **Deployment**: Docker, Docker Compose

## Resources

- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vite.dev/)
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/)
- [Gin Documentation](https://gin-gonic.com/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
