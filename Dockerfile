FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Dépendances d'exécution seules : ni compilateur TypeScript, ni CLI Nest, ni
# types. Le CLI Prisma en fait partie, lui, parce que les migrations tournent au
# démarrage du conteneur.
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS build
WORKDIR /app
ENV DATABASE_URL=postgresql://git_web_review:git_web_review@localhost:5432/git_web_review
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run prisma:generate && npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache git
COPY package*.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
# Le client généré vient de l'étape de build : il n'existe pas dans prod-deps.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

# Le cache des dépôts git est écrit sous /tmp, accessible à un utilisateur non
# privilégié ; le reste de /app reste en lecture seule pour lui.
USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
