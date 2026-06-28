FROM node:20-slim

# Instalar Java (necessário para xsd-schema-validator do nfewizard-io)
RUN apt-get update && apt-get install -y \
    default-jdk \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
