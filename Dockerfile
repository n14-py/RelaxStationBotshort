FROM node:18-slim

# 1. Instalar FFmpeg y herramientas de compilación
RUN apt-get update && \
    apt-get install -y ffmpeg python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 2. Configurar directorio
WORKDIR /usr/src/app

# 3. Copiar dependencias e instalar
COPY package*.json ./
RUN npm install --production

# 4. Copiar el resto del código
COPY . .

# 5. Exponer puerto
EXPOSE 8080
CMD [ "npm", "start" ]