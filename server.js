const express = require('express');
const http = require('http');
const { Server } = require("socket.io"); // Import the Server class from socket.io
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const he = require('he'); // For HTML entity encoding (sanitization)

const PORT = process.env.PORT || 3000; // Use port from environment variable or default to 3000
// !IMPORTANT #TODO: Replace this with your actual Vercel frontend URL once deployed !!
//    For local testing, you might allow your local frontend server (e.g., http://localhost:5500 if using Live Server)
const allowedOrigins = [
    "http://localhost:5500", // Example for VS Code Live Server
    "http://127.0.0.1:5500",
    "https://your-vercel-app-name.vercel.app" // Placeholder for your frontend
];
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        // or if origin is in the allowedOrigins list
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST"] // Allow only necessary methods
};

const messageRateLimiter = rateLimit({
	windowMs: 15 * 1000, // 15 seconds
	max: 10, // Limit each IP to 10 messages per windowMs
	message: 'Too many messages sent from this IP, please try again after 15 seconds',
    // keyGenerator is needed for socket.io middleware context
    keyGenerator: (req, res) => req.ip // Use IP address for tracking
});

const app = express();
app.use(cors(corsOptions)); // Enable CORS for Express routes (good practice, though Socket.IO needs its own)
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Chat server is running!');
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: corsOptions, // Apply CORS options to Socket.IO
    maxHttpBufferSize: 1e4 // Limit message size (~10KB) - Adjust as needed
});

// Middleware for Socket.IO rate limiting (applied per connection attempt *and* per event)
// We need to adapt express-rate-limit slightly for Socket.IO context
const socketRateLimiter = rateLimit({
	windowMs: 15 * 1000, // 15 seconds
	max: 10, // Limit each IP to 10 events per windowMs
	message: 'Too many requests, please try again later.',
    // Use socket.handshake.address for IP in Socket.IO context
    keyGenerator: (req, res) => req.handshake.address
});

io.use((socket, next) => {
    // Wrap the express-rate-limit middleware for Socket.IO
    // Need to mock req/res objects slightly
    const mockReq = { ip: socket.handshake.address, // Get IP from socket handshake
                     headers: socket.request.headers };
    const mockRes = { /* Res object methods not really needed here */ };

    socketRateLimiter(mockReq, mockRes, (err) => {
        if (err) {
            console.warn(`Rate limit exceeded for IP: ${socket.handshake.address}`);
            return next(new Error('Rate limit exceeded')); // Send error to client
        }
        next(); // Proceed if not rate limited
    });
});


io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id} from IP: ${socket.handshake.address}`);

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });

    // Handle incoming chat messages
    socket.on('chat message', (msg) => {
        // Basic validation & sanitization
        if (typeof msg !== 'string' || msg.trim() === '') {
            console.log(`Invalid message received from ${socket.id}:`, msg);
            return; // Ignore empty or non-string messages
        }

        // Check length (Socket.IO maxHttpBufferSize offers primary protection)
        const maxLength = 500; // Define a reasonable max length
        if (msg.length > maxLength) {
            console.log(`Message too long from ${socket.id}. Length: ${msg.length}`);
            socket.emit('error', 'Message too long.');
            return; // Reject message
        }

        const sanitizedMsg = he.encode(msg.trim()); // Encode HTML entities
        console.log(`Message from ${socket.id}: ${sanitizedMsg}`);

        // Broadcast the sanitized message to ALL connected clients, including the sender
        io.emit('chat message', sanitizedMsg);
    });

     // Error handling for the specific socket
     socket.on("error", (err) => {
        console.error(`Socket Error (${socket.id}): ${err.message}`);
        if (err && err.message === "Rate limit exceeded") {
             socket.emit("error", "You are sending messages too fast. Please slow down.");
             socket.disconnect(true);
         }
    });
});

server.listen(PORT, () => {
    console.log(`Server vibing on port ${PORT}`);
});
