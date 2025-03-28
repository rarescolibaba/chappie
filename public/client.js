// DOM element references
let form = null;
let input = null;
let messages = null;
let statusElement = null;

async function initializeSocket() {
    form = document.getElementById('form');
    input = document.getElementById('input');
    messages = document.getElementById('messages');
    statusElement = document.getElementById('connection-status');

    if (!form || !input || !messages || !statusElement) {
        console.error('Required DOM elements not found!');
        updateStatus('Error: Missing page elements. Maybe your adblocker filtered something?', 'status-disconnected');
        return;
    }

    updateStatus('Fetching config...', 'status-connecting');
    let serverUrl = null;

    try {
        const response = await fetch('/config');
        if (!response.ok) {
            throw new Error(`Config fetch failed: ${response.statusText}`);
        }
        const config = await response.json();
        serverUrl = config.BACKEND_URL;

        if (!serverUrl) {
            throw new Error('Backend URL not found in config');
        }

        console.log('Chat client connecting to:', serverUrl);
        updateStatus('Connecting...', 'status-connecting');

        const socket = io(serverUrl, {
            reconnectionAttempts: 5,
            transports: ['websocket'],
        });

        initializeSocketEvents(socket);
        initializeFormHandler(socket);
    } catch (error) {
        console.error('Failed to initialize chat:', error);
        updateStatus(`Initialization Error: ${error.message}`, 'status-disconnected');
    }
}

/**
 * Initializes the message input form handler
 */
function initializeFormHandler(socket) {
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
 * Initializes all Socket.IO event listeners
 */
function initializeSocketEvents(socket) {
    // Chat message event
    socket.on('chat message', (msg) => addMessage(msg));

    // Connection events
    socket.on('connect', () => {
        updateStatus('Connected', 'status-connected');
        addSystemMessage('--- Connected to server ---', 'success');
    });

    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        let displayReason = err.message;
        if (err.data && err.data.code === "TEMP_BANNED") {
            displayReason = err.data.reason || err.message;
        }
        updateStatus(`Connection Failed: ${displayReason}`, 'status-disconnected');
        addSystemMessage(`Connection Error: ${displayReason}`, 'error');
    });

    socket.on('disconnect', (reason) => {
        updateStatus('Disconnected', 'status-disconnected');
        addSystemMessage('--- Disconnected from server ---', 'info');
    });

    // Error handling
    socket.on('error', (errorMessage) => {
        console.error('Error:', errorMessage);
        const errorText = typeof errorMessage === 'object' ? errorMessage.message : errorMessage;
        addSystemMessage(`Error: ${errorText}`, 'error');
    });
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
    item.textContent = decodeHTMLEntities(msg);

    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
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
 * Updates the connection status display
 * @param {string} text - Status text to display
 * @param {string} className - CSS class for styling
 */
function updateStatus(text, className) {
    if (statusElement) {
        statusElement.className = className;
        statusElement.textContent = text;
    } else {
        console.warn("Status element not found when trying to update status.");
    }
}

document.addEventListener('DOMContentLoaded', (event) => {
    console.log('Chat client initialized, connecting.');
    initializeSocket();
});
