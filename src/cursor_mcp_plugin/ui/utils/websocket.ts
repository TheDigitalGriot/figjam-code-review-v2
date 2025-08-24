import { store } from '../store/store';
import { UmlDiagram, DirNode } from '../store/types';

interface WebSocketMessage {
  type: string;
  channel?: string;
  id?: string;
  payload?: any;
  message?: any;
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private channelName: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 1000;
  private messageQueue: WebSocketMessage[] = [];
  private chunkedMessages = new Map<string, { chunks: string[], received: number, total: number }>();

  connect(serverUrl: string, channel: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(serverUrl);
        this.channelName = channel;

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          store.setConnectionState(true, channel);
          
          // Join the channel
          this.send({
            type: 'join',
            channel: channel,
            id: this.generateId()
          });
          
          // Send any queued messages
          this.processMessageQueue();
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          store.setConnectionState(false);
          this.attemptReconnect();
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(message: WebSocketMessage) {
    console.log('Received message:', message.type, message);

    switch (message.type) {
      case 'system':
        this.handleSystemMessage(message);
        break;
        
      case 'uml:payload':
        this.handleUmlPayload(message);
        break;
        
      case 'uml:payload:chunked:start':
        this.handleChunkedStart(message);
        break;
        
      case 'uml:payload:chunk':
        this.handleChunk(message);
        break;
        
      case 'uml:payload:chunked:complete':
        this.handleChunkedComplete(message);
        break;
        
      case 'code:open':
        this.handleCodeOpen(message);
        break;
        
      case 'code:highlight':
        this.handleCodeHighlight(message);
        break;
        
      case 'comments:upsert':
        this.handleCommentUpsert(message);
        break;
        
      case 'error':
        console.error('Server error:', message.message);
        break;
        
      default:
        console.log('Unhandled message type:', message.type);
    }
  }

  private handleSystemMessage(message: WebSocketMessage) {
    console.log('System message:', message.message);
    // Handle system messages like connection confirmation
  }

  private handleUmlPayload(message: WebSocketMessage) {
    if (message.payload && message.payload.diagram) {
      store.setDiagram(message.payload.diagram);
      
      if (message.payload.directory) {
        store.setDirectoryTree(message.payload.directory);
      }
      
      console.log('UML diagram loaded:', {
        nodes: message.payload.diagram.nodes?.length || 0,
        edges: message.payload.diagram.edges?.length || 0,
        files: Object.keys(message.payload.mapping || {}).length
      });
    }
  }

  private handleChunkedStart(message: WebSocketMessage) {
    const messageId = message.id || 'default';
    this.chunkedMessages.set(messageId, {
      chunks: new Array(message.payload.totalChunks).fill(''),
      received: 0,
      total: message.payload.totalChunks
    });
    console.log(`Starting chunked message reception: ${message.payload.totalChunks} chunks`);
  }

  private handleChunk(message: WebSocketMessage) {
    const messageId = message.id || 'default';
    const chunkedMsg = this.chunkedMessages.get(messageId);
    
    if (chunkedMsg && message.payload) {
      chunkedMsg.chunks[message.payload.chunkIndex] = message.payload.chunk;
      chunkedMsg.received++;
      
      console.log(`Received chunk ${message.payload.chunkIndex + 1}/${chunkedMsg.total}`);
    }
  }

  private handleChunkedComplete(message: WebSocketMessage) {
    const messageId = message.id || 'default';
    const chunkedMsg = this.chunkedMessages.get(messageId);
    
    if (chunkedMsg) {
      const completePayload = chunkedMsg.chunks.join('');
      try {
        const parsedPayload = JSON.parse(completePayload);
        this.handleUmlPayload({ ...message, payload: parsedPayload });
      } catch (error) {
        console.error('Error parsing chunked payload:', error);
      }
      
      this.chunkedMessages.delete(messageId);
      console.log('Chunked message completed');
    }
  }

  private handleCodeOpen(message: WebSocketMessage) {
    const { file, line, symbol } = message.payload;
    console.log('Code open request:', { file, line, symbol });
    
    // Update store to show the file is being opened
    store.selectFile(file);
    
    // In a real implementation, this would fetch file contents
    // For now, we'll just log the request
  }

  private handleCodeHighlight(message: WebSocketMessage) {
    const { file, range } = message.payload;
    console.log('Code highlight request:', { file, range });
    
    if (store.getState().openFile?.path === file) {
      store.setSelectedRange(range);
    }
  }

  private handleCommentUpsert(message: WebSocketMessage) {
    const comment = message.payload;
    console.log('Comment upsert:', comment);
    
    // Find existing comment or add new one
    const existingIndex = store.getState().comments.findIndex(c => c.id === comment.id);
    if (existingIndex > -1) {
      store.updateComment(comment.id, comment);
    } else {
      store.addComment(comment);
    }
  }

  // Send messages
  send(message: WebSocketMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message for later
      this.messageQueue.push(message);
    }
  }

  // Public API methods
  generateUml(rootPath: string, maxFiles = 500) {
    this.send({
      type: 'uml:generate',
      channel: this.channelName!,
      id: this.generateId(),
      payload: { rootPath, maxFiles }
    });
  }

  openFile(file: string, line?: number, symbol?: string) {
    this.send({
      type: 'code:open',
      channel: this.channelName!,
      id: this.generateId(),
      payload: { file, line, symbol }
    });
  }

  highlightCode(file: string, range: [number, number]) {
    this.send({
      type: 'code:highlight',
      channel: this.channelName!,
      id: this.generateId(),
      payload: { file, range }
    });
  }

  upsertComment(file: string, line: number, text: string, commentId?: string) {
    this.send({
      type: 'comments:upsert',
      channel: this.channelName!,
      id: this.generateId(),
      payload: { id: commentId, file, line, text }
    });
  }

  exportComments(format: 'json' | 'csv' | 'markdown') {
    this.send({
      type: 'comments:export',
      channel: this.channelName!,
      id: this.generateId(),
      payload: { format }
    });
  }

  private processMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        if (this.channelName) {
          this.connect('ws://localhost:3055', this.channelName)
            .catch(error => {
              console.error('Reconnection failed:', error);
            });
        }
      }, this.reconnectInterval * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.channelName = null;
    store.setConnectionState(false);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WebSocketClient();