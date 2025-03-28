// !IMPORTANT #TODO: Replace this with your ACTUAL Render backend URL when deployed !!
//    For local testing with server running on port 3000:
const SERVER_URL = 'http://localhost:3000';

const socket = io(SERVER_URL, {
    reconnectionAttempts: 5,
    transports: ['websocket'],
});

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const statusElement = document.getElementById('connection-status');

function updateStatus(text, className) {
    statusElement.textContent = text;
    statusElement.className = ''; // Clear previous classes
    statusElement.classList.add(className); // Add new class
}


form.addEventListener('submit', function(e) {
    e.preventDefault(); // Prevent default page reload on form submission
    if (input.value && input.value.trim() !== '') {
        // Send the message content to the server via 'chat message' event
        socket.emit('chat message', input.value.trim());
        input.value = ''; // Clear the input box
        input.focus(); // Keep focus on the input box
    }
});

// Listen for 'chat message' events coming FROM the server
socket.on('chat message', function(msg) {
    const item = document.createElement('li');
    // The message (msg) received from the server is already sanitized (HTML entities encoded)
    item.textContent = msg;
    messages.appendChild(item);

    // Scroll to the bottom of the messages list
    messages.scrollTop = messages.scrollHeight;
});

socket.on('connect', () => {
    console.log('Connected to server!', socket.id);
    // #TODO: Maybe display a subtle connection status indicator?
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    updateStatus('Disconnected', 'status-disconnected');
    const item = document.createElement('li');
    item.textContent = '--- You have been disconnected ---';
    item.style.fontStyle = 'italic';
    item.style.textAlign = 'center';
    item.style.color = '#888';
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
});

socket.on('error', (errorMessage) => {
    console.error('Server sent an error:', errorMessage);
    const item = document.createElement('li');
    item.textContent = `SYSTEM: ${errorMessage}`;
    item.style.fontStyle = 'italic';
    item.style.color = 'red';
    item.style.textAlign = 'center';
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
});

console.log('Chat client initialized, connecting to:', SERVER_URL);
