const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const he = require('he'); // For HTML entity encoding (sanitization)

const PORT = process.env.PORT || 3000;

// Configuration
const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://your-vercel-app-name.vercel.app" // Replace with your actual frontend URL when deployed
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST"]
};

// Express setup
const app = express();
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Route handling
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// HTTP server creation
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
    cors: corsOptions,
    maxHttpBufferSize: 1e4 // 10KB message size limit
});

// Rate limiter for Socket.IO
const connectedClients = new Map();
const RATE_LIMIT = {
    windowMs: 5 * 1000, // 5 seconds
    maxMessages: 5      // max messages per window
};

function isRateLimited(clientId) {
    const now = Date.now();
    const clientData = connectedClients.get(clientId) || { messages: [], lastReset: now };
    
    // Clean up old messages and check rate limit
    clientData.messages = clientData.messages.filter(time => now - time < RATE_LIMIT.windowMs);
    const isLimited = clientData.messages.length >= RATE_LIMIT.maxMessages;
    
    if (!isLimited) {
        clientData.messages.push(now);
        connectedClients.set(clientId, clientData);
    }
    
    return isLimited;
}

io.use((socket, next) => {
    // Initialize rate limiting for this socket
    connectedClients.set(socket.id, {
        messages: [],
        lastReset: Date.now()
    });
    next();
});

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id} from IP: ${socket.handshake.address}`);

    socket.on('chat message', (msg) => {
        // Rate limiting check
        if (isRateLimited(socket.id)) {
            console.warn(`Rate limit exceeded for socket: ${socket.id}`);
            socket.emit('error', { 
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded. Please wait before sending more messages.' 
            });
            return;
        }
        
        // Message validation
        const maxLength = 500;
        if (typeof msg !== 'string' || msg.trim() === '') {
            console.log(`Invalid message received from ${socket.id}:`, msg);
            return;
        }
        
        if (msg.length > maxLength) {
            console.log(`Message too long from ${socket.id}. Length: ${msg.length}`);
            socket.emit('error', { message: 'Message too long.' });
            return;
        }

        // Process valid message
        const trimmedMsg = msg.trim();
        
        // Sanitize the message content with minimal processing
        // Just store special characters directly, but filter out html tags
        const sanitizedMsg = trimmedMsg
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        console.log(`Message from ${socket.id}: ${sanitizedMsg}`);
        io.emit('chat message', sanitizedMsg);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        connectedClients.delete(socket.id);
        console.log(`Client disconnected: ${socket.id}`);
    });

    // Error handling
    socket.on("error", (err) => {
        console.error(`Socket Error (${socket.id}): ${err.message}`);
        if (err?.data?.code === "RATE_LIMIT_EXCEEDED") {
            socket.emit("error", { message: "You are sending messages too fast. Please slow down." });
            socket.disconnect(true);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
