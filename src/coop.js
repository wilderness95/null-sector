export class CoopConnection {
  constructor(onState, onError, onClose) {
    this.onState = onState;
    this.onError = onError;
    this.onClose = onClose;
    this.id = null;
    this.state = null;
  }

  connect(request) {
    this.socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/coop`);
    const timeout = setTimeout(() => this.socket.close(), 8000);
    this.socket.addEventListener('open', () => this.send(request));
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.type === 'welcome') { clearTimeout(timeout); this.id = message.id; }
      if (message.type === 'error') this.onError(message.message);
      if (message.type === 'state') { this.state = message; this.onState(message); }
    });
    this.socket.addEventListener('close', () => { clearTimeout(timeout); if (!this.closed) this.onClose(); });
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  close() { this.closed = true; this.socket?.close(); }
}
