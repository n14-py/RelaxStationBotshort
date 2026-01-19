# Usamos una imagen de Node.js 18 que tenga Alpine (base de Linux ligera)
FROM node:18-alpine

# 1. Instalar dependencias del sistema
# - ffmpeg: El transmisor de video (¡El motor!)
# - bash, tzdata: Utilidades estándar
RUN apk add --no-cache ffmpeg bash tzdata

# 2. Configurar zona horaria (Copiado de tu Dockerfile existente)
ENV TZ=America/Asuncion

# 3. Crear directorio de trabajo
WORKDIR /usr/src/app

# 4. Instalar dependencias de Node.js
COPY package*.json ./
# Instalamos solo dependencias de producción para ahorrar espacio
RUN npm install --omit=dev

# 5. Copiar el resto del código fuente
COPY . .

# 6. Crear un archivo de log para la estabilidad
RUN touch ffmpeg_log.txt

# 7. Exponer el puerto para health checks
EXPOSE 8080
ENV PORT=8080

# 8. Comando de inicio: Iniciar Node.js
CMD ["node", "server.js"]