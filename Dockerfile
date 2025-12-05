FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY .mastra ./mastra

WORKDIR /app/mastra/output

# RUN npm run migrate:up
# CMD ["npx", "trigger.dev", "deploy"]


CMD ["node", "--env-file=.env", "--import=./instrumentation.mjs", "index.mjs"]