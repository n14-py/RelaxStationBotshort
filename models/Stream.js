const mongoose = require('mongoose');

// Este esquema define cómo guardamos la info de cada directo en la base de datos
const StreamSchema = new mongoose.Schema({
    // Datos Creativos
    title: { type: String, required: true },
    description: { type: String, required: true },
    concept_reasoning: { type: String },
    image_prompt: { type: String },
    
    // Datos de Archivos (BunnyCDN)
    bunny_image_url: { type: String, required: true }, // URL pública
    bunny_file_path: { type: String, required: true }, // Ruta interna

    // Datos de YouTube
    youtube_broadcast_id: { type: String },
    youtube_stream_id: { type: String },
    youtube_rtmp_url: { type: String },

    // Estado del Proceso
    status: { 
        type: String, 
        enum: ['PREPARING', 'READY', 'LIVE', 'FINISHED', 'ERROR'], 
        default: 'PREPARING' 
    },

    // Tiempos
    scheduledDurationHours: { type: Number, default: 12 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Stream', StreamSchema);