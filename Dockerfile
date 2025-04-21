FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm pkg delete scripts.prepare && npm ci

COPY . .

RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist

RUN npm pkg delete scripts.prepare && npm ci --omit=dev

CMD ["node", "dist/index.js"]
