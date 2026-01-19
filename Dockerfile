# Usamos una imagen ligera de Node 18
FROM node:18-slim

# 1. INSTALAR FFMPEG Y DEPENDENCIAS DE SISTEMA
# Esto es vital. Sin esto, el bot fallará al intentar transmitir.
RUN apt-get update && \
    apt-get install -y ffmpeg python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 2. CONFIGURAR CARPETA DE TRABAJO
WORKDIR /usr/src/app

# 3. COPIAR ARCHIVOS DE DEPENDENCIAS
COPY package*.json ./

# 4. INSTALAR DEPENDENCIAS DE NODE
RUN npm install --production

# 5. COPIAR EL RESTO DEL CÓDIGO
COPY . .

# 6. EXPONER PUERTO Y COMANDO DE INICIO
EXPOSE 8080
CMD [ "npm", "start" ]