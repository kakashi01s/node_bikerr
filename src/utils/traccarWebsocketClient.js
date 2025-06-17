import WebSocket from 'ws';

class TraccarWebSocketClient {
    constructor(url, options = {}) {
        this.url = url;
        this.options = options;
        this.ws = null;
        this.isConnected = false;
        this.reconnectInterval = options.reconnectInterval || 5000; // Default reconnect interval: 5 seconds
        this.connect();
    }

    connect() {
        this.ws = new WebSocket(this.url, this.options);

        this.ws.on('open', () => {
            console.log(`[Traccar WebSocket] Connected to ${this.url}`);
            this.isConnected = true;
            // Optionally send an initial message to identify the client or subscribe to data
            // this.ws.send(JSON.stringify({ type: 'subscribe', ... }));
        });

        this.ws.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                this.handleData(data);
            } catch (error) {
                console.error('[Traccar WebSocket] Error parsing message:', error, message.toString());
            }
        });

        this.ws.on('close', (code, reason) => {
            console.log(`[Traccar WebSocket] Connection closed with code ${code} and reason: ${reason}`);
            this.isConnected = false;
            console.log(`[Traccar WebSocket] Attempting to reconnect in ${this.reconnectInterval / 1000} seconds...`);
            setTimeout(() => this.connect(), this.reconnectInterval);
        });

        this.ws.on('error', (error) => {
            console.error('[Traccar WebSocket] WebSocket error:', error);
            this.isConnected = false;
            // No need to manually reconnect here, the 'close' event will trigger it
        });
    }

    handleData(data) {
        // This is where you process the data received from the Traccar server
        console.log('[Traccar WebSocket] Received data:', data);
        // You can emit an event here to notify other parts of your application
        // For example:
        // EventEmitterInstance.emit('traccarData', data);
    }

    sendMessage(message) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('[Traccar WebSocket] Not connected. Cannot send message:', message);
        }
    }
}

// Example usage:
const traccarWsUrl = 'ws://your-traccar-server-ip:your-traccar-ws-port'; // Replace with your Traccar WebSocket URL
const traccarClient = new TraccarWebSocketClient(traccarWsUrl);

// You might want to export the client instance if other parts of your app need to interact with it
export default traccarClient;
// Or if you're using CommonJS:
// module.exports = traccarClient;