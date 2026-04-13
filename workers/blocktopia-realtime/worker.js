export default {
  async fetch(request, env) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
};

const clients = new Set();

function handleSession(ws) {
  ws.accept();
  clients.add(ws);

  ws.addEventListener('message', (event) => {
    for (const client of clients) {
      if (client !== ws) {
        client.send(event.data);
      }
    }
  });

  ws.addEventListener('close', () => {
    clients.delete(ws);
  });
}
