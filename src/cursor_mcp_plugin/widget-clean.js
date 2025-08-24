// Clean Figma Widget Implementation for Code Review Workspace
const { widget } = figma;
const { AutoLayout, Text, SVG, useSyncedState, usePropertyMenu, useEffect, waitForTask } = widget;

// Main Widget Component
function CodeReviewWidget() {
  const [status, setStatus] = useSyncedState('status', 'Ready');
  const [isConnected, setIsConnected] = useSyncedState('connected', false);
  const [serverPort, setServerPort] = useSyncedState('serverPort', 3055);
  const [lastActivity, setLastActivity] = useSyncedState('lastActivity', '');
  
  // Multi-pane state
  const [directoryTree, setDirectoryTree] = useSyncedState('directoryTree', null);
  const [currentFile, setCurrentFile] = useSyncedState('currentFile', null);
  const [fileContent, setFileContent] = useSyncedState('fileContent', '');
  const [comments, setComments] = useSyncedState('comments', []);
  const [diagramData, setDiagramData] = useSyncedState('diagramData', null);
  const [selectedView, setSelectedView] = useSyncedState('selectedView', 'overview');

  // WebSocket connection function using Plugin API in event handler
  const connectToWebSocket = () => {
    // Use Plugin API within event handler context
    waitForTask(new Promise((resolve, reject) => {
      try {
        setStatus('Connecting...');
        
        // Create WebSocket connection using Plugin API
        const ws = new WebSocket('ws://localhost:' + serverPort);
        
        ws.onopen = function() {
          setIsConnected(true);
          setStatus('Connected');
          setLastActivity('Connected to WebSocket');
          
          // Join channel
          ws.send(JSON.stringify({
            type: 'join',
            channel: 'code-review-widget',
            id: 'widget-' + Date.now()
          }));
          
          resolve(ws);
        };
        
        ws.onmessage = function(event) {
          try {
            const data = JSON.parse(event.data);
            setLastActivity('Received: ' + data.type);
            
            // Handle socket message types using Plugin API
            if (data.type === 'broadcast') {
              setStatus('Processing: ' + data.type);
              
              // Handle specific socket message types
              waitForTask(handleSocketMessage(data).then(function(result) {
                setStatus('Message handled: ' + data.type);
                setLastActivity('Processed: ' + data.type);
              }).catch(function(error) {
                setStatus('Error: ' + error.message);
                setLastActivity('Error: ' + error.message);
              }));
            }
          } catch (error) {
            setLastActivity('Parse error: ' + error.message);
          }
        };
        
        ws.onerror = function(error) {
          setIsConnected(false);
          setStatus('Connection error');
          setLastActivity('WebSocket error');
          reject(error);
        };
        
        ws.onclose = function() {
          setIsConnected(false);
          setStatus('Disconnected');
          setLastActivity('Connection closed');
        };
        
      } catch (error) {
        setStatus('Error: ' + error.message);
        setIsConnected(false);
        reject(error);
      }
    }));
  };

  // Disconnect function
  const disconnect = () => {
    setIsConnected(false);
    setStatus('Disconnected manually');
    setLastActivity('Disconnected by user');
  };

  // Property menu configuration
  usePropertyMenu([
    {
      tooltip: isConnected ? 'Disconnect' : 'Connect to WebSocket',
      propertyName: 'connection',
      itemType: 'action',
    },
    {
      tooltip: 'Switch View',
      propertyName: 'view',
      itemType: 'dropdown',
      options: [
        { option: 'overview', label: 'Overview' },
        { option: 'directory', label: 'Directory Tree' },
        { option: 'code', label: 'Code Review' },
        { option: 'comments', label: 'Comments' },
        { option: 'diagram', label: 'UML Diagram' }
      ],
      selectedOption: selectedView
    },
    {
      tooltip: 'Generate UML Diagram',
      propertyName: 'generateUML',
      itemType: 'action',
    },
    {
      tooltip: 'Change Server Port',
      propertyName: 'port',
      itemType: 'dropdown',
      options: [
        { option: '3055', label: 'Port 3055 (default)' },
        { option: '8080', label: 'Port 8080' },
        { option: '3000', label: 'Port 3000' }
      ],
      selectedOption: serverPort.toString()
    }
  ], ({ propertyName, propertyValue }) => {
    if (propertyName === 'connection') {
      if (isConnected) {
        disconnect();
      } else {
        connectToWebSocket();
      }
    } else if (propertyName === 'view' && propertyValue) {
      setSelectedView(propertyValue);
    } else if (propertyName === 'generateUML') {
      if (isConnected) {
        setStatus('Requesting UML generation...');
        // This will be handled by the WebSocket message handler
      } else {
        setStatus('Connect to WebSocket first');
      }
    } else if (propertyName === 'port' && propertyValue) {
      setServerPort(parseInt(propertyValue));
      setStatus('Port updated - reconnect to apply');
      if (isConnected) {
        disconnect();
      }
    }
  });

  // Auto-connect on mount
  useEffect(() => {
    if (!isConnected && reconnectAttempts === 0) {
      connectToWebSocket();
    }
  });

  // Helper function to render different views
  const renderViewContent = () => {
    switch (selectedView) {
      case 'directory':
        return renderDirectoryView();
      case 'code':
        return renderCodeView();
      case 'comments':
        return renderCommentsView();
      case 'diagram':
        return renderDiagramView();
      default:
        return renderOverviewView();
    }
  };

  // Widget UI with multi-view support
  return AutoLayout({
    direction: 'vertical',
    spacing: 12,
    padding: 16,
    cornerRadius: 8,
    fill: '#FFFFFF',
    stroke: isConnected ? '#00AA00' : '#CCCCCC',
    strokeWidth: 2,
    width: selectedView === 'overview' ? 350 : 600,
    height: selectedView === 'overview' ? 'hug-contents' : 400,
  }, [
    // Header
    AutoLayout({
      direction: 'horizontal',
      spacing: 8,
      width: 'fill-parent',
      verticalAlignItems: 'center',
    }, [
      SVG({
        src: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M13 3H6c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10l-7-7z" fill="' + (isConnected ? '#00AA00' : '#666666') + '"/><path d="M13 3v7h7" fill="none" stroke="' + (isConnected ? '#00AA00' : '#666666') + '" stroke-width="2"/></svg>',
        width: 24,
        height: 24,
      }),
      Text({
        text: 'Code Review Workspace - ' + selectedView.charAt(0).toUpperCase() + selectedView.slice(1),
        fontSize: 16,
        fontWeight: 'bold',
        fill: '#333333',
      }),
    ]),
    
    // Status bar
    AutoLayout({
      direction: 'horizontal',
      spacing: 12,
      width: 'fill-parent',
      verticalAlignItems: 'center',
    }, [
      Text({
        text: 'Status: ' + status,
        fontSize: 12,
        fill: '#666666',
      }),
      SVG({
        src: '<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="' + (isConnected ? '#00AA00' : '#FF0000') + '"/></svg>',
        width: 8,
        height: 8,
      }),
      Text({
        text: isConnected ? 'Connected' : 'Disconnected',
        fontSize: 12,
        fill: isConnected ? '#00AA00' : '#FF0000',
      }),
    ]),
    
    // Main content area
    renderViewContent()
  ]);
  // View rendering functions
  const renderOverviewView = () => {
    return AutoLayout({
      direction: 'vertical',
      spacing: 8,
      width: 'fill-parent',
    }, [
      Text({
        text: 'Welcome to Code Review Workspace',
        fontSize: 14,
        fontWeight: 'bold',
        fill: '#333333',
      }),
      Text({
        text: 'Use the property menu to:',
        fontSize: 12,
        fill: '#666666',
      }),
      Text({
        text: '• Connect to WebSocket server',
        fontSize: 11,
        fill: '#888888',
      }),
      Text({
        text: '• Switch between different views',
        fontSize: 11,
        fill: '#888888',
      }),
      Text({
        text: '• Generate UML diagrams',
        fontSize: 11,
        fill: '#888888',
      }),
      lastActivity ? Text({
        text: 'Last Activity: ' + lastActivity,
        fontSize: 10,
        fill: '#AAAAAA',
      }) : null
    ]);
  };

  const renderDirectoryView = () => {
    return AutoLayout({
      direction: 'vertical',
      spacing: 8,
      width: 'fill-parent',
      height: 300,
    }, [
      Text({
        text: 'Directory Tree',
        fontSize: 14,
        fontWeight: 'bold',
        fill: '#333333',
      }),
      AutoLayout({
        direction: 'vertical',
        spacing: 4,
        width: 'fill-parent',
        height: 250,
        padding: 8,
        fill: '#F8F8F8',
        cornerRadius: 4,
      }, directoryTree ? renderDirectoryItems(directoryTree) : [
        Text({
          text: 'No directory data available',
          fontSize: 12,
          fill: '#888888',
        }),
        Text({
          text: 'Connect and generate UML to load directory',
          fontSize: 11,
          fill: '#AAAAAA',
        })
      ])
    ]);
  };

  const renderCodeView = () => {
    return AutoLayout({
      direction: 'vertical',
      spacing: 8,
      width: 'fill-parent',
      height: 300,
    }, [
      Text({
        text: currentFile ? 'File: ' + currentFile : 'Code Review Panel',
        fontSize: 14,
        fontWeight: 'bold',
        fill: '#333333',
      }),
      AutoLayout({
        direction: 'vertical',
        spacing: 4,
        width: 'fill-parent',
        height: 250,
        padding: 8,
        fill: '#F8F8F8',
        cornerRadius: 4,
      }, fileContent ? [
        Text({
          text: fileContent.length > 500 ? fileContent.substring(0, 500) + '...' : fileContent,
          fontSize: 10,
          fill: '#333333',
          fontFamily: 'monospace',
        })
      ] : [
        Text({
          text: 'No file selected',
          fontSize: 12,
          fill: '#888888',
        }),
        Text({
          text: 'Click a file in directory view or use code:open message',
          fontSize: 11,
          fill: '#AAAAAA',
        })
      ])
    ]);
  };

  const renderCommentsView = () => {
    return AutoLayout({
      direction: 'vertical',
      spacing: 8,
      width: 'fill-parent',
      height: 300,
    }, [
      AutoLayout({
        direction: 'horizontal',
        spacing: 8,
        width: 'fill-parent',
        verticalAlignItems: 'center',
      }, [
        Text({
          text: 'Comments (' + comments.length + ')',
          fontSize: 14,
          fontWeight: 'bold',
          fill: '#333333',
        }),
        Text({
          text: 'Export: JSON/CSV/MD',
          fontSize: 10,
          fill: '#666666',
        })
      ]),
      AutoLayout({
        direction: 'vertical',
        spacing: 4,
        width: 'fill-parent',
        height: 250,
        padding: 8,
        fill: '#F8F8F8',
        cornerRadius: 4,
      }, comments.length > 0 ? comments.slice(0, 5).map(function(comment, index) {
        return AutoLayout({
          direction: 'vertical',
          spacing: 2,
          width: 'fill-parent',
          padding: 4,
          fill: '#FFFFFF',
          cornerRadius: 2,
        }, [
          Text({
            text: (comment.file || 'Unknown file') + ':' + (comment.line || '?'),
            fontSize: 10,
            fontWeight: 'bold',
            fill: '#666666',
          }),
          Text({
            text: comment.text || '',
            fontSize: 11,
            fill: '#333333',
          })
        ]);
      }) : [
        Text({
          text: 'No comments yet',
          fontSize: 12,
          fill: '#888888',
        }),
        Text({
          text: 'Highlight code and add comments via socket messages',
          fontSize: 11,
          fill: '#AAAAAA',
        })
      ])
    ]);
  };

  const renderDiagramView = () => {
    return AutoLayout({
      direction: 'vertical',
      spacing: 8,
      width: 'fill-parent',
      height: 300,
    }, [
      Text({
        text: 'UML Diagram',
        fontSize: 14,
        fontWeight: 'bold',
        fill: '#333333',
      }),
      AutoLayout({
        direction: 'vertical',
        spacing: 4,
        width: 'fill-parent',
        height: 250,
        padding: 8,
        fill: '#F8F8F8',
        cornerRadius: 4,
      }, diagramData ? [
        Text({
          text: 'Diagram loaded: ' + (diagramData.nodes ? diagramData.nodes.length + ' nodes' : 'Processing...'),
          fontSize: 12,
          fill: '#333333',
        }),
        Text({
          text: 'Interactive diagram rendering coming soon',
          fontSize: 11,
          fill: '#666666',
        })
      ] : [
        Text({
          text: 'No diagram data available',
          fontSize: 12,
          fill: '#888888',
        }),
        Text({
          text: 'Use "Generate UML Diagram" in property menu',
          fontSize: 11,
          fill: '#AAAAAA',
        })
      ])
    ]);
  };

  const renderDirectoryItems = (tree) => {
    if (!tree || !tree.children) return [];
    
    return tree.children.slice(0, 8).map(function(item) {
      return Text({
        text: (item.kind === 'dir' ? '📁 ' : '📄 ') + item.name,
        fontSize: 11,
        fill: item.kind === 'dir' ? '#666666' : '#333333',
      });
    });
  };
}

// Command handler using Plugin API
function handleSocketMessage(data) {
  return new Promise(function(resolve, reject) {
    try {
      // Handle socket.ts message types
      switch (data.type) {
        case 'uml:generate':
          if (data.payload && data.payload.rootPath) {
            // Create a text node showing UML generation started
            figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
              const textNode = figma.createText();
              textNode.characters = 'UML Generation: ' + data.payload.rootPath;
              textNode.x = 100;
              textNode.y = 100;
              figma.currentPage.appendChild(textNode);
              resolve({ success: true, message: 'UML generation initiated' });
            }).catch(function() {
              resolve({ success: true, message: 'UML generation initiated (no font)' });
            });
          } else {
            reject(new Error('UML generation requires rootPath'));
          }
          break;
          
        case 'uml:payload':
          if (data.payload) {
            // Update widget state with UML data
            setDiagramData(data.payload.diagram || data.payload);
            if (data.payload.directory) {
              setDirectoryTree(data.payload.directory);
            }
            setStatus('UML diagram loaded');
            setLastActivity('UML payload received');
            resolve({ success: true, message: 'UML data loaded into widget' });
          } else {
            reject(new Error('No UML payload provided'));
          }
          break;
          
        case 'code:open':
          if (data.payload && data.payload.file) {
            setCurrentFile(data.payload.file);
            if (data.payload.content) {
              setFileContent(data.payload.content);
            }
            setStatus('File opened: ' + data.payload.file);
            setLastActivity('Opened: ' + data.payload.file);
            resolve({ success: true, file: data.payload.file });
          } else {
            reject(new Error('Code open requires file path'));
          }
          break;
          
        case 'code:highlight':
          if (data.payload && data.payload.file) {
            const rect = figma.createRectangle();
            rect.name = 'Code Highlight: ' + data.payload.file;
            rect.x = 300;
            rect.y = 200;
            rect.resize(200, 50);
            rect.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 0 } }];
            figma.currentPage.appendChild(rect);
            resolve({ success: true, file: data.payload.file });
          } else {
            reject(new Error('Code highlight requires file'));
          }
          break;
          
        case 'comments:upsert':
          if (data.payload && data.payload.text) {
            const newComment = {
              id: data.payload.id || 'comment-' + Date.now(),
              file: data.payload.file || currentFile || 'unknown',
              line: data.payload.line || 0,
              text: data.payload.text,
              createdAt: data.payload.createdAt || new Date().toISOString()
            };
            
            // Add to comments array
            const updatedComments = [...comments, newComment];
            setComments(updatedComments);
            setStatus('Comment added');
            setLastActivity('Comment: ' + data.payload.text.substring(0, 30) + '...');
            resolve({ success: true, commentId: newComment.id });
          } else {
            reject(new Error('Comment requires text'));
          }
          break;
          
        case 'comments:export':
          const exportData = {
            comments: comments,
            reviewAt: new Date().toISOString(),
            file: currentFile,
            format: data.payload ? data.payload.format : 'json'
          };
          setStatus('Comments exported');
          setLastActivity('Exported ' + comments.length + ' comments');
          resolve({ 
            success: true, 
            format: exportData.format,
            count: comments.length,
            data: exportData
          });
          break;
          
        default:
          resolve({ success: true, message: 'Message type: ' + data.type });
      }
    } catch (error) {
      reject(new Error('Socket message handling failed: ' + error.message));
    }
  });
}

// Register the widget
widget.register(CodeReviewWidget);