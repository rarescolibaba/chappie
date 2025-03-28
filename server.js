const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const he = require('he'); // For HTML entity encoding (sanitization)
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:${PORT}`; 
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`; 
const MAX_MESSAGE_LENGTH = 500;
const BAN_THRESHOLD = 6; // Number of rate limit violations before a ban
const BAN_DURATION_MS = 2 * 60 * 1000; // 2 minutes
const FORGIVENESS_DELAY_MS = 20 * 1000; // 20 seconds

const allowedOrigins = [
    FRONTEND_URL,
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`CORS rejected origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST"]
};

const connectedClients = new Map();
const bannedIPs = new Map();

// Express setup
const app = express();
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/config', (req, res) => {
    console.log(`Sending config: BACKEND_URL = ${BACKEND_URL}`); // Log what's sent
    res.json({
        BACKEND_URL: BACKEND_URL 
    });
});

// Route handling
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// HTTP server creation
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
    cors: corsOptions,
    maxHttpBufferSize: 10240 // 10KB message size limit
});

// Rate limiter for Socket.IO
const RATE_LIMIT = {
    windowMs: 5 * 1000, // 5 seconds
    maxMessages: 10      // max messages per window
};

function checkRateLimit(clientId) {
    const now = Date.now();
    const clientData = connectedClients.get(clientId) || {
        messages: [],
        violationCount: 0,
        lastViolationTime: 0,
        lastReset: now
    };

    if (clientData.violationCount > 0 &&
        clientData.lastViolationTime > 0 &&
        (now - clientData.lastViolationTime > FORGIVENESS_DELAY_MS))
    {
        clientData.violationCount--;
        clientData.lastViolationTime = now; 
        console.log(`Forgave 1 violation for ${clientId}. New count: ${clientData.violationCount}`);
    }

    // Clean up old messages and check rate limit
    clientData.messages = clientData.messages.filter(time => now - time < RATE_LIMIT.windowMs);
    const isCurrentlyLimited = clientData.messages.length >= RATE_LIMIT.maxMessages;
    
    if (isCurrentlyLimited) {
        clientData.violationCount++;
        clientData.lastViolationTime = now;
        console.warn(`Rate limit violation by ${clientId}. Count: ${clientData.violationCount}`);
        return { limited: true, clientData }; 
    }

    clientData.messages.push(now);
    return { limited: false, clientData };
}

function isIPBanned(ip) {
    const banExpiry = bannedIPs.get(ip);
    if (banExpiry && Date.now() < banExpiry) {
        return true; // Still banned
    }
    if (banExpiry) {
        bannedIPs.delete(ip); // Ban expired, remove entry
    }
    return false;
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, expiry] of bannedIPs.entries()) {
        if (now >= expiry) {
            console.log(`Ban expired for IP ${ip}`);
            bannedIPs.delete(ip);
        }
    }
}, 30 * 1000); // Run every 30 seconds

io.use((socket, next) => {
    const clientIP = socket.handshake.address
    if (isIPBanned(clientIP)) {
        console.warn(`Connection rejected: IP ${clientIP} is currently banned.`);
        // Create an error object to pass to the client's 'connect_error' handler
        const err = new Error("You have been temporarily banned due to excessive messaging.");
        err.data = { code: "TEMP_BANNED", reason: "Excessive rate limit violations. Please try again in a bit." };
        return next(err); // Reject connection
    }
    // Initialize rate limiting for this socket
    connectedClients.set(socket.id, {
        messages: [],
        violationCount: 0,
        lastViolationTime: 0,
        lastReset: Date.now()
    });
    console.log(`State initialized for ${socket.id}`);
    next();
});

io.on('connection', (socket) => {
    const clientIP = socket.handshake.address;
    console.log(`IP ${clientIP} connected as ${socket.id}`);

    socket.on('chat message', (msg) => {
        const { limited, clientData } = checkRateLimit(socket.id);
        // Rate limiting check
        if (limited) {
            console.warn(`Rate limit exceeded for socket: ${socket.id}`);

            if (clientData.violationCount >= BAN_THRESHOLD) {
                console.error(`!!! Banning IP: ${clientIP} for ${BAN_DURATION_MS / 1000} seconds due to repeated rate limit violations. Socket: ${socket.id}`);
                bannedIPs.set(clientIP, Date.now() + BAN_DURATION_MS);
                socket.emit('error', {
                    code: 'TEMP_BANNED',
                    message: `You have been temporarily banned due to excessive messaging.`
                });
                socket.disconnect(true);
            } else {
                socket.emit('error', {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Rate limit exceeded. Please wait before sending more messages.'
                });
            }
            return; // Stop processing
        }

        // Message validation
        if (typeof msg !== 'string' || msg.trim() === '') {
            console.log(`Invalid message received from ${socket.id}:`, msg);
            return;
        }

        if (msg.length > MAX_MESSAGE_LENGTH) {
            console.log(`Message too long from ${socket.id}. Length: ${msg.length}`);
            socket.emit('error', { message: 'Message too long.' });
            return;
        }

        // Process valid message
        const trimmedMsg = msg.trim();
        const sanitizedMsg = he.encode(trimmedMsg);

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
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server vibing on port ${PORT}`);
    console.log(`Allowing CORS origin: ${FRONTEND_URL}`);
    console.log(`Backend URL for client config: ${BACKEND_URL}`);
});
