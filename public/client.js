// Configuration - Replace with your actual backend URL when deployed
const SERVER_URL = 'http://localhost:3000';

// Socket.IO initialization with optimized settings
const socket = io(SERVER_URL, {
    reconnectionAttempts: 5,
    transports: ['websocket'],
});

// DOM element references
let form, input, messages, statusElement;

// Initialize application when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    form = document.getElementById('form');
    input = document.getElementById('input');
    messages = document.getElementById('messages');
    statusElement = document.getElementById('connection-status');
    
    if (!form || !input || !messages || !statusElement) {
        console.error('Required DOM elements not found!');
        return;
    }
    
    // Initialize application components
    initializeSocketEvents();
    initializeFormHandler();
});

/**
 * Updates the connection status display
 * @param {string} text - Status text to display
 * @param {string} className - CSS class for styling
 */
function updateStatus(text, className) {
    statusElement.textContent = text;
    statusElement.className = '';
    statusElement.classList.add(className);
}

/**
 * Creates a DOM parser to decode HTML entities
 */
const parser = new DOMParser();

/**
 * Decodes HTML entities back to their original characters
 * @param {string} html - String with HTML entities
 * @returns {string} - Decoded string with original characters
 */
function decodeHTMLEntities(html) {
    if (!html) return '';
    
    // Parse the input as HTML and extract the text content
    // This is a bulletproof way to decode HTML entities
    const doc = parser.parseFromString(
        `<!DOCTYPE html><body>${html}</body>`, 
        'text/html'
    );
    
    return doc.body.textContent;
}

/**
 * Adds a message to the chat display
 * @param {string} msg - The message to display
 */
function addMessage(msg) {
    const item = document.createElement('li');
    
    // Decode HTML entities back to original characters
    // but use textContent for secure display (preventing HTML execution)
    const decodedMsg = decodeHTMLEntities(msg);
    item.textContent = decodedMsg;
    
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

/**
 * Initializes the message input form handler
 */
function initializeFormHandler() {
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const messageText = input.value.trim();
        if (messageText !== '') {
            socket.emit('chat message', messageText);
            input.value = '';
            input.focus();
        }
    });
}

/**
 * Adds a system message to the chat
 * @param {string} text - The system message text
 * @param {string} type - Message type (info, error, success)
 */
function addSystemMessage(text, type = 'info') {
    const item = document.createElement('li');
    item.textContent = text;
    item.classList.add('system-message', type);
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
}

/**
 * Initializes all Socket.IO event listeners
 */
function initializeSocketEvents() {
    // Chat message event
    socket.on('chat message', (msg) => {
        addMessage(msg);
    });

    // Connection events
    socket.on('connect', () => {
        updateStatus('Connected', 'status-connected');
        addSystemMessage('--- Connected to server ---', 'success');
    });

    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        updateStatus(`Connection Failed: ${err.message}`, 'status-disconnected');
        addSystemMessage(`Connection Error: ${err.message}`, 'error');
    });

    socket.on('disconnect', (reason) => {
        updateStatus('Disconnected', 'status-disconnected');
        addSystemMessage('--- You have been disconnected ---', 'info');
    });

    // Error handling
    socket.on('error', (errorMessage) => {
        const errorText = typeof errorMessage === 'object' ? errorMessage.message : errorMessage;
        addSystemMessage(`SYSTEM: ${errorText}`, 'error');
    });
}

// Log initialization message
console.log('Chat client initialized, connecting to:', SERVER_URL);
