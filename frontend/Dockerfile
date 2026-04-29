# Stage 1: Build
FROM node:20 AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

COPY . .
RUN npm run build

# Stage 2: Serve
FROM node:20-slim

WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist

CMD ["serve", "-s", "dist", "-l", "3000"]
