FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* tsconfig.json ./
RUN npm install

COPY src ./src

RUN npx tsc --noCheck -p tsconfig.json
RUN npm prune --production && npm cache clean --force

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
