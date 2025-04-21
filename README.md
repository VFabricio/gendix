# Gendix

Whatsapp message automation for small and medium businesses.

## Technology Stack

- Node.js v22
- TypeScript
- Hono (Web Framework)
- Kysely (SQL Query Builder)
- PostgreSQL
- Docker & Docker Compose

## Architecture

This application follows a hexagonal architecture:

- `src/core/` - Business logic and domain models
- `src/adapters/` - Interface definitions for external services
- `src/ports/` - Concrete implementations of adapter interfaces

## Development

### Prerequisites

- Node.js v22+
- npm
- Docker and Docker Compose (for running PostgreSQL)

### Setup

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

### Development Commands

- `npm run dev` - Start development server with hot reloading
- `npm run build` - Build the project
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm test` - Run tests

## Docker

```bash
# Build and start the application with PostgreSQL
docker-compose up -d

# View logs
docker-compose logs -f app
```