FROM node:22-slim

# Instalar Java, Python e ferramentas de build (necessários para nfewizard-io)
RUN apt-get update && apt-get install -y \
    default-jdk \
    python3 \
    python3-dev \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
