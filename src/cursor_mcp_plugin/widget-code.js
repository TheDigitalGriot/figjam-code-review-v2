// Mixed Widget/Plugin code for Code Review Workspace
// Supports both widget embedding in FigJam and plugin UI

// Plugin state
const state = {
  serverPort: 3055, // Default port
  isWidget: false,
  widgetNode: null,
  pluginUI: null,
};

// Helper function for progress updates
function sendProgressUpdate(
  commandId,
  commandType,
  status,
  progress,
  totalItems,
  processedItems,
  message,
  payload = null
) {
  const update = {
    type: "command_progress",
    commandId,
    commandType,
    status,
    progress,
    totalItems,
    processedItems,
    message,
    timestamp: Date.now(),
  };

  // Add optional chunk information if present
  if (payload) {
    if (
      payload.currentChunk !== undefined &&
      payload.totalChunks !== undefined
    ) {
      update.currentChunk = payload.currentChunk;
      update.totalChunks = payload.totalChunks;
      update.chunkSize = payload.chunkSize;
    }
    update.payload = payload;
  }

  // Send to UI or Widget
  if (state.isWidget && state.widgetNode) {
    // Widget mode - update widget display
    updateWidgetDisplay(update);
  } else if (state.pluginUI) {
    // Plugin mode - send to UI
    figma.ui.postMessage(update);
  }
  
  console.log(`Progress update: ${status} - ${progress}% - ${message}`);
  return update;
}

// Widget display update function
function updateWidgetDisplay(update) {
  if (!state.widgetNode) return;
  
  // Update widget text to show current status
  const statusText = `${update.commandType}: ${update.message}`;
  const progressText = update.progress ? ` (${update.progress}%)` : '';
  
  // Find or create status text node in widget
  const textNodes = state.widgetNode.findAll(n => n.type === 'TEXT');
  if (textNodes.length > 0) {
    textNodes[0].characters = statusText + progressText;
  }
}

// Initialize based on context
function initializeCodeReview() {
  // Check if we're running as a widget
  if (figma.widget) {
    state.isWidget = true;
    initializeWidget();
  } else {
    state.isWidget = false;
    initializePlugin();
  }
}

// Widget initialization
function initializeWidget() {
  const { widget } = figma;
  const { AutoLayout, Text, SVG, useSyncedState, usePropertyMenu, useEffect } = widget;

  function CodeReviewWidget() {
    const [status, setStatus] = useSyncedState('status', 'Ready');
    const [connectionStatus, setConnectionStatus] = useSyncedState('connected', false);
    
    // Property menu for widget settings
    usePropertyMenu([
      {
        tooltip: 'Connect to WebSocket',
        propertyName: 'connect',
        itemType: 'action',
      },
      {
        tooltip: 'Open Plugin UI',
        propertyName: 'openUI',
        itemType: 'action',
      }
    ], ({ propertyName }) => {
      if (propertyName === 'connect') {
        handleWidgetConnect();
      } else if (propertyName === 'openUI') {
        // Switch to plugin mode temporarily
        figma.showUI(__html__, { width: 1200, height: 800, themeColors: true });
        state.pluginUI = true;
      }
    });

    const handleWidgetConnect = async () => {
      setStatus('Connecting...');
      try {
        // Attempt WebSocket connection
        const connected = await connectToWebSocket();
        setConnectionStatus(connected);
        setStatus(connected ? 'Connected' : 'Connection Failed');
      } catch (error) {
        setStatus('Error: ' + error.message);
        setConnectionStatus(false);
      }
    };

    return (
      AutoLayout({
        direction: 'vertical',
        spacing: 12,
        padding: 16,
        cornerRadius: 8,
        fill: '#FFFFFF',
        stroke: connectionStatus ? '#00AA00' : '#CCCCCC',
        strokeWidth: 2,
        width: 320,
        height: 'hug-contents',
      }, [
        // Header
        AutoLayout({
          direction: 'horizontal',
          spacing: 8,
          width: 'fill-parent',
          verticalAlignItems: 'center',
        }, [
          SVG({
            src: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M13 3H6c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10l-7-7z" fill="${connectionStatus ? '#00AA00' : '#666666'}"/>
              <path d="M13 3v7h7" fill="none" stroke="${connectionStatus ? '#00AA00' : '#666666'}" stroke-width="2"/>
            </svg>`,
            width: 24,
            height: 24,
          }),
          Text({
            text: 'Code Review Workspace',
            fontSize: 16,
            fontWeight: 'bold',
            fill: '#333333',
          }),
        ]),
        
        // Status
        Text({
          text: `Status: ${status}`,
          fontSize: 14,
          fill: '#666666',
        }),
        
        // Connection indicator
        AutoLayout({
          direction: 'horizontal',
          spacing: 8,
          verticalAlignItems: 'center',
        }, [
          SVG({
            src: `<svg width="12" height="12" viewBox="0 0 12 12">
              <circle cx="6" cy="6" r="6" fill="${connectionStatus ? '#00AA00' : '#FF0000'}"/>
            </svg>`,
            width: 12,
            height: 12,
          }),
          Text({
            text: connectionStatus ? 'Connected to WebSocket' : 'Disconnected',
            fontSize: 12,
            fill: connectionStatus ? '#00AA00' : '#FF0000',
          }),
        ]),
      ])
    );
  }

  // Register widget
  widget.register(CodeReviewWidget);
}

// Plugin initialization  
function initializePlugin() {
  state.pluginUI = true;
  // Show UI - make it larger for code review
  figma.showUI(__html__, { width: 1200, height: 800, themeColors: true });
  
  // Plugin commands from UI
  figma.ui.onmessage = async (msg) => {
    switch (msg.type) {
      case "update-settings":
        updateSettings(msg);
        break;
      case "notify":
        figma.notify(msg.message);
        break;
      case "close-plugin":
        figma.closePlugin();
        break;
      case "switch-to-widget":
        // Close plugin UI and create widget
        figma.closePlugin();
        createCodeReviewWidget();
        break;
      case "execute-command":
        try {
          const result = await handleCommand(msg.command, msg.params);
          figma.ui.postMessage({
            type: "command-result",
            id: msg.id,
            result,
          });
        } catch (error) {
          figma.ui.postMessage({
            type: "command-error",
            id: msg.id,
            error: error.message || "Error executing command",
          });
        }
        break;
      
      // Code Review specific messages
      case "generate_uml":
        await handleGenerateUML(msg);
        break;
      case "get_file_contents":
        await handleGetFileContents(msg);
        break;
      case "websocket_connect":
        await handleWebSocketConnect(msg);
        break;
      case "websocket_message":
        await handleWebSocketMessage(msg);
        break;
      default:
        console.log("Unknown message type:", msg.type);
    }
  };
}

// Create widget programmatically from plugin
function createCodeReviewWidget() {
  const widget = figma.createWidget();
  widget.widgetName = 'Code Review Workspace';
  widget.x = figma.viewport.center.x - 160;
  widget.y = figma.viewport.center.y - 100;
  
  state.widgetNode = widget;
  state.isWidget = true;
}

// WebSocket connection function
async function connectToWebSocket() {
  // This would implement the actual WebSocket connection
  // For now, return a mock success
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, 1000);
  });
}

// Settings update function
function updateSettings(msg) {
  if (msg.serverPort) {
    state.serverPort = msg.serverPort;
  }
  console.log("Settings updated:", msg);
}

// Import the rest of the command handlers from the original code
// (This would include all the handleCommand, handleGenerateUML, etc. functions)

// Initialize the appropriate mode
initializeCodeReview();