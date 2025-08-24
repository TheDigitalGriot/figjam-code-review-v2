import { Server, ServerWebSocket } from "bun";

// Store clients by channel
const channels = new Map<string, Set<ServerWebSocket<any>>>();

// Message type definitions
interface BaseMessage {
  type: string;
  channel: string;
  id?: string;
}

interface UmlGenerateMessage extends BaseMessage {
  type: 'uml:generate';
  payload: {
    rootPath: string;
    maxFiles?: number;
    includePatterns?: string[];
    excludePatterns?: string[];
  };
}

interface UmlPayloadMessage extends BaseMessage {
  type: 'uml:payload';
  payload: any; // UmlPayload from types
}

interface CodeOpenMessage extends BaseMessage {
  type: 'code:open';
  payload: {
    file: string;
    line?: number;
    symbol?: string;
  };
}

interface CodeHighlightMessage extends BaseMessage {
  type: 'code:highlight';
  payload: {
    file: string;
    range: [number, number];
  };
}

interface CommentUpsertMessage extends BaseMessage {
  type: 'comments:upsert';
  payload: {
    id?: string;
    file: string;
    line: number;
    text: string;
    createdAt?: string;
  };
}

interface CommentExportMessage extends BaseMessage {
  type: 'comments:export';
  payload: {
    format: 'json' | 'csv' | 'markdown';
  };
}

interface SystemMessage extends BaseMessage {
  type: 'system';
  message: string | any;
}

type WebSocketMessage = UmlGenerateMessage | UmlPayloadMessage | CodeOpenMessage | 
                       CodeHighlightMessage | CommentUpsertMessage | CommentExportMessage | 
                       SystemMessage;

function handleConnection(ws: ServerWebSocket<any>) {
  // Don't add to clients immediately - wait for channel join
  console.log("New client connected");

  // Send welcome message to the new client
  ws.send(JSON.stringify({
    type: "system",
    message: "Please join a channel to start chatting",
  }));

  ws.close = () => {
    console.log("Client disconnected");

    // Remove client from their channel
    channels.forEach((clients, channelName) => {
      if (clients.has(ws)) {
        clients.delete(ws);

        // Notify other clients in same channel
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "system",
              message: "A user has left the channel",
              channel: channelName
            }));
          }
        });
      }
    });
  };
}

const server = Bun.serve({
  port: 3055,
  // uncomment this to allow connections in windows wsl
  // hostname: "0.0.0.0",
  fetch(req: Request, server: Server) {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Handle WebSocket upgrade
    const success = server.upgrade(req, {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });

    if (success) {
      return; // Upgraded to WebSocket
    }

    // Return response for non-WebSocket requests
    return new Response("WebSocket server running", {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
  websocket: {
    open: handleConnection,
    async message(ws: ServerWebSocket<any>, message: string | Buffer) {
      try {
        console.log("Received message from client:", message);
        const data = JSON.parse(message as string);

        if (data.type === "join") {
          const channelName = data.channel;
          if (!channelName || typeof channelName !== "string") {
            ws.send(JSON.stringify({
              type: "error",
              message: "Channel name is required"
            }));
            return;
          }

          // Create channel if it doesn't exist
          if (!channels.has(channelName)) {
            channels.set(channelName, new Set());
          }

          // Add client to channel
          const channelClients = channels.get(channelName)!;
          channelClients.add(ws);

          // Notify client they joined successfully
          ws.send(JSON.stringify({
            type: "system",
            message: `Joined channel: ${channelName}`,
            channel: channelName
          }));

          console.log("Sending message to client:", data.id);

          ws.send(JSON.stringify({
            type: "system",
            message: {
              id: data.id,
              result: "Connected to channel: " + channelName,
            },
            channel: channelName
          }));

          // Notify other clients in channel
          channelClients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "system",
                message: "A new user has joined the channel",
                channel: channelName
              }));
            }
          });
          return;
        }

        // Handle regular messages
        if (data.type === "message") {
          const channelName = data.channel;
          if (!channelName || typeof channelName !== "string") {
            ws.send(JSON.stringify({
              type: "error",
              message: "Channel name is required"
            }));
            return;
          }

          const channelClients = channels.get(channelName);
          if (!channelClients || !channelClients.has(ws)) {
            ws.send(JSON.stringify({
              type: "error",
              message: "You must join the channel first"
            }));
            return;
          }

          // Broadcast to all clients in the channel
          channelClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              console.log("Broadcasting message to client:", data.message);
              client.send(JSON.stringify({
                type: "broadcast",
                message: data.message,
                sender: client === ws ? "You" : "User",
                channel: channelName
              }));
            }
          });
          return;
        }

        // Handle UML and code review messages
        await handleSpecialMessage(ws, data);
      } catch (err) {
        console.error("Error handling message:", err);
      }
    },
    close(ws: ServerWebSocket<any>) {
      // Remove client from their channel
      channels.forEach((clients) => {
        clients.delete(ws);
      });
    }
  }
});

// Handler for special message types (UML, code review, etc.)
async function handleSpecialMessage(ws: ServerWebSocket<any>, data: any) {
  const channelName = data.channel;
  if (!channelName || typeof channelName !== "string") {
    ws.send(JSON.stringify({
      type: "error",
      message: "Channel name is required"
    }));
    return;
  }

  const channelClients = channels.get(channelName);
  if (!channelClients || !channelClients.has(ws)) {
    ws.send(JSON.stringify({
      type: "error", 
      message: "You must join the channel first"
    }));
    return;
  }

  try {
    switch (data.type) {
      case 'uml:generate':
        await handleUmlGenerate(channelClients, data as UmlGenerateMessage);
        break;
      
      case 'uml:payload':
        await handleUmlPayload(channelClients, data as UmlPayloadMessage);
        break;
        
      case 'code:open':
        await handleCodeOpen(channelClients, data as CodeOpenMessage);
        break;
        
      case 'code:highlight':
        await handleCodeHighlight(channelClients, data as CodeHighlightMessage);
        break;
        
      case 'comments:upsert':
        await handleCommentUpsert(channelClients, data as CommentUpsertMessage);
        break;
        
      case 'comments:export':
        await handleCommentExport(channelClients, data as CommentExportMessage);
        break;
        
      default:
        console.log(`Unknown message type: ${data.type}`);
        break;
    }
  } catch (error) {
    console.error(`Error handling ${data.type}:`, error);
    broadcastToChannel(channelClients, {
      type: 'error',
      message: `Failed to handle ${data.type}: ${error}`,
      channel: channelName
    });
  }
}

// Message handlers
async function handleUmlGenerate(
  clients: Set<ServerWebSocket<any>>, 
  message: UmlGenerateMessage
) {
  console.log('Handling UML generation request:', message.payload);
  
  // Broadcast to all clients that UML generation has started
  broadcastToChannel(clients, {
    type: 'uml:generate:started',
    message: 'UML generation started',
    payload: message.payload,
    channel: message.channel,
    id: message.id
  });
}

async function handleUmlPayload(
  clients: Set<ServerWebSocket<any>>, 
  message: UmlPayloadMessage
) {
  console.log('Broadcasting UML payload to clients');
  
  // Check payload size and chunk if necessary
  const payloadSize = JSON.stringify(message.payload).length;
  const maxSize = 1024 * 1024; // 1MB
  
  if (payloadSize > maxSize) {
    await broadcastLargePayload(clients, message);
  } else {
    broadcastToChannel(clients, {
      type: 'uml:payload',
      payload: message.payload,
      channel: message.channel,
      id: message.id
    });
  }
}

async function handleCodeOpen(
  clients: Set<ServerWebSocket<any>>, 
  message: CodeOpenMessage
) {
  console.log('Broadcasting code open request:', message.payload);
  
  broadcastToChannel(clients, {
    type: 'code:open',
    payload: message.payload,
    channel: message.channel,
    id: message.id
  });
}

async function handleCodeHighlight(
  clients: Set<ServerWebSocket<any>>, 
  message: CodeHighlightMessage
) {
  console.log('Broadcasting code highlight:', message.payload);
  
  broadcastToChannel(clients, {
    type: 'code:highlight',
    payload: message.payload,
    channel: message.channel,
    id: message.id
  });
}

async function handleCommentUpsert(
  clients: Set<ServerWebSocket<any>>, 
  message: CommentUpsertMessage
) {
  console.log('Broadcasting comment upsert:', message.payload);
  
  // Add timestamp if not provided
  if (!message.payload.createdAt) {
    message.payload.createdAt = new Date().toISOString();
  }
  
  // Generate ID if not provided
  if (!message.payload.id) {
    message.payload.id = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  broadcastToChannel(clients, {
    type: 'comments:upsert',
    payload: message.payload,
    channel: message.channel,
    id: message.id
  });
}

async function handleCommentExport(
  clients: Set<ServerWebSocket<any>>, 
  message: CommentExportMessage
) {
  console.log('Broadcasting comment export request:', message.payload);
  
  broadcastToChannel(clients, {
    type: 'comments:export',
    payload: message.payload,
    channel: message.channel,
    id: message.id
  });
}

// Utility functions
function broadcastToChannel(
  clients: Set<ServerWebSocket<any>>, 
  message: any
) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message to client:', error);
      }
    }
  });
}

async function broadcastLargePayload(
  clients: Set<ServerWebSocket<any>>, 
  message: UmlPayloadMessage
) {
  const chunkSize = 512 * 1024; // 512KB chunks
  const payloadStr = JSON.stringify(message.payload);
  const totalChunks = Math.ceil(payloadStr.length / chunkSize);
  
  console.log(`Chunking large payload: ${payloadStr.length} bytes into ${totalChunks} chunks`);
  
  // Send chunk info first
  broadcastToChannel(clients, {
    type: 'uml:payload:chunked:start',
    totalChunks,
    chunkSize: chunkSize,
    totalSize: payloadStr.length,
    channel: message.channel,
    id: message.id
  });
  
  // Send chunks
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, payloadStr.length);
    const chunk = payloadStr.slice(start, end);
    
    broadcastToChannel(clients, {
      type: 'uml:payload:chunk',
      chunkIndex: i,
      totalChunks,
      chunk,
      channel: message.channel,
      id: message.id
    });
    
    // Small delay between chunks to prevent overwhelming
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  // Send completion signal
  broadcastToChannel(clients, {
    type: 'uml:payload:chunked:complete',
    channel: message.channel,
    id: message.id
  });
}

console.log(`WebSocket server running on port ${server.port}`);
