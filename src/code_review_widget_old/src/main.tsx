/** @jsx figma.widget.h */
/** @jsxFrag figma.widget.Fragment */

const { widget } = figma
const { AutoLayout, Text, SVG, useSyncedState, usePropertyMenu, waitForTask, Fragment } = widget

export default function () {
  widget.register(CodeReviewWidget)
}

function CodeReviewWidget() {
  const [status, setStatus] = useSyncedState('status', 'Ready')
  const [isConnected, setIsConnected] = useSyncedState('connected', false)
  const [serverPort, setServerPort] = useSyncedState('serverPort', 3055)
  const [lastActivity, setLastActivity] = useSyncedState('lastActivity', '')
  
  // Multi-pane state
  const [directoryTree, setDirectoryTree] = useSyncedState('directoryTree', null)
  const [currentFile, setCurrentFile] = useSyncedState('currentFile', null)
  const [fileContent, setFileContent] = useSyncedState('fileContent', '')
  const [comments, setComments] = useSyncedState('comments', [])
  const [diagramData, setDiagramData] = useSyncedState('diagramData', null)
  const [selectedView, setSelectedView] = useSyncedState('selectedView', 'overview')

  // WebSocket connection function
  const connectToWebSocket = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      try {
        setStatus('Connecting...')
        
        // Create WebSocket connection
        const ws = new WebSocket('ws://localhost:' + serverPort)
        
        ws.onopen = function() {
          setIsConnected(true)
          setStatus('Connected')
          setLastActivity('Connected to WebSocket')
          
          // Join channel
          ws.send(JSON.stringify({
            type: 'join',
            channel: 'code-review-widget',
            id: 'widget-' + Date.now()
          }))
          
          resolve()
        }
        
        ws.onmessage = function(event) {
          try {
            const data = JSON.parse(event.data)
            setLastActivity('Received: ' + data.type)
            
            // Handle socket message types
            if (data.type === 'broadcast') {
              setStatus('Processing: ' + data.type)
              
              waitForTask(handleSocketMessage(data).then(function(_result) {
                setStatus('Message handled: ' + data.type)
                setLastActivity('Processed: ' + data.type)
              }).catch(function(error) {
                setStatus('Error: ' + error.message)
                setLastActivity('Error: ' + error.message)
              }))
            }
          } catch (error: any) {
            setLastActivity('Parse error: ' + error.message)
          }
        }
        
        ws.onerror = function(error) {
          setIsConnected(false)
          setStatus('Connection error')
          setLastActivity('WebSocket error')
          reject(error)
        }
        
        ws.onclose = function() {
          setIsConnected(false)
          setStatus('Disconnected')
          setLastActivity('Connection closed')
        }
        
      } catch (error: any) {
        setStatus('Error: ' + error.message)
        setIsConnected(false)
        reject(error)
      }
    })
  }

  // Disconnect function
  const disconnect = (): void => {
    setIsConnected(false)
    setStatus('Disconnected manually')
    setLastActivity('Disconnected by user')
  }

  // Property menu configuration
  const items: Array<WidgetPropertyMenuItem> = [
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
  ]

  async function onChange({ propertyName, propertyValue }: WidgetPropertyEvent): Promise<void> {
    if (propertyName === 'connection') {
      if (isConnected) {
        disconnect()
      } else {
        await connectToWebSocket()
      }
    } else if (propertyName === 'view' && propertyValue) {
      setSelectedView(propertyValue)
    } else if (propertyName === 'generateUML') {
      if (isConnected) {
        setStatus('Requesting UML generation...')
      } else {
        setStatus('Connect to WebSocket first')
      }
    } else if (propertyName === 'port' && propertyValue) {
      setServerPort(parseInt(propertyValue))
      setStatus('Port updated - reconnect to apply')
      if (isConnected) {
        disconnect()
      }
    }
  }

  usePropertyMenu(items, onChange)

  // Helper function to render different views
  const renderViewContent = () => {
    switch (selectedView) {
      case 'directory':
        return renderDirectoryView()
      case 'code':
        return renderCodeView()
      case 'comments':
        return renderCommentsView()
      case 'diagram':
        return renderDiagramView()
      default:
        return renderOverviewView()
    }
  }

  const renderOverviewView = () => {
    return (
      <AutoLayout direction="vertical" spacing={8} width="fill-parent">
        <Text fontSize={14} fontWeight="bold" fill="#333333">
          Welcome to Code Review Workspace
        </Text>
        <Text fontSize={12} fill="#666666">
          Use the property menu to:
        </Text>
        <Text fontSize={11} fill="#888888">
          • Connect to WebSocket server
        </Text>
        <Text fontSize={11} fill="#888888">
          • Switch between different views
        </Text>
        <Text fontSize={11} fill="#888888">
          • Generate UML diagrams
        </Text>
        {lastActivity && (
          <Text fontSize={10} fill="#AAAAAA">
            Last Activity: {lastActivity}
          </Text>
        )}
      </AutoLayout>
    )
  }

  const renderDirectoryView = () => {
    return (
      <AutoLayout direction="vertical" spacing={8} width="fill-parent" height={300}>
        <Text fontSize={14} fontWeight="bold" fill="#333333">
          Directory Tree
        </Text>
        <AutoLayout 
          direction="vertical" 
          spacing={4} 
          width="fill-parent" 
          height={250} 
          padding={8} 
          fill="#F8F8F8" 
          cornerRadius={4}
        >
          {directoryTree ? renderDirectoryItems(directoryTree) : (
            <Fragment>
              <Text fontSize={12} fill="#888888">
                No directory data available
              </Text>
              <Text fontSize={11} fill="#AAAAAA">
                Connect and generate UML to load directory
              </Text>
            </Fragment>
          )}
        </AutoLayout>
      </AutoLayout>
    )
  }

  const renderCodeView = () => {
    return (
      <AutoLayout direction="vertical" spacing={8} width="fill-parent" height={300}>
        <Text fontSize={14} fontWeight="bold" fill="#333333">
          {currentFile ? `File: ${currentFile}` : 'Code Review Panel'}
        </Text>
        <AutoLayout 
          direction="vertical" 
          spacing={4} 
          width="fill-parent" 
          height={250} 
          padding={8} 
          fill="#F8F8F8" 
          cornerRadius={4}
        >
          {fileContent ? (
            <Text 
              fontSize={10} 
              fill="#333333" 
              fontFamily="monospace"
            >
              {fileContent.length > 500 ? fileContent.substring(0, 500) + '...' : fileContent}
            </Text>
          ) : (
            <Fragment>
              <Text fontSize={12} fill="#888888">
                No file selected
              </Text>
              <Text fontSize={11} fill="#AAAAAA">
                Click a file in directory view or use code:open message
              </Text>
            </Fragment>
          )}
        </AutoLayout>
      </AutoLayout>
    )
  }

  const renderCommentsView = () => {
    return (
      <AutoLayout direction="vertical" spacing={8} width="fill-parent" height={300}>
        <AutoLayout direction="horizontal" spacing={8} width="fill-parent" verticalAlignItems="center">
          <Text fontSize={14} fontWeight="bold" fill="#333333">
            Comments ({comments.length})
          </Text>
          <Text fontSize={10} fill="#666666">
            Export: JSON/CSV/MD
          </Text>
        </AutoLayout>
        <AutoLayout 
          direction="vertical" 
          spacing={4} 
          width="fill-parent" 
          height={250} 
          padding={8} 
          fill="#F8F8F8" 
          cornerRadius={4}
        >
          {comments.length > 0 ? 
            comments.slice(0, 5).map((comment: any, index: number) => (
              <AutoLayout 
                key={index}
                direction="vertical" 
                spacing={2} 
                width="fill-parent" 
                padding={4} 
                fill="#FFFFFF" 
                cornerRadius={2}
              >
                <Text fontSize={10} fontWeight="bold" fill="#666666">
                  {(comment.file || 'Unknown file') + ':' + (comment.line || '?')}
                </Text>
                <Text fontSize={11} fill="#333333">
                  {comment.text || ''}
                </Text>
              </AutoLayout>
            )) : (
            <Fragment>
              <Text fontSize={12} fill="#888888">
                No comments yet
              </Text>
              <Text fontSize={11} fill="#AAAAAA">
                Highlight code and add comments via socket messages
              </Text>
            </Fragment>
          )}
        </AutoLayout>
      </AutoLayout>
    )
  }

  const renderDiagramView = () => {
    return (
      <AutoLayout direction="vertical" spacing={8} width="fill-parent" height={300}>
        <Text fontSize={14} fontWeight="bold" fill="#333333">
          UML Diagram
        </Text>
        <AutoLayout 
          direction="vertical" 
          spacing={4} 
          width="fill-parent" 
          height={250} 
          padding={8} 
          fill="#F8F8F8" 
          cornerRadius={4}
        >
          {diagramData ? (
            <Fragment>
              <Text fontSize={12} fill="#333333">
                Diagram loaded: {(diagramData as any)?.nodes ? (diagramData as any).nodes.length + ' nodes' : 'Processing...'}
              </Text>
              <Text fontSize={11} fill="#666666">
                Interactive diagram rendering coming soon
              </Text>
            </Fragment>
          ) : (
            <Fragment>
              <Text fontSize={12} fill="#888888">
                No diagram data available
              </Text>
              <Text fontSize={11} fill="#AAAAAA">
                Use "Generate UML Diagram" in property menu
              </Text>
            </Fragment>
          )}
        </AutoLayout>
      </AutoLayout>
    )
  }

  const renderDirectoryItems = (tree: any) => {
    if (!tree || !tree.children) return null
    
    return tree.children.slice(0, 8).map((item: any, index: number) => (
      <Text 
        key={index}
        fontSize={11} 
        fill={item.kind === 'dir' ? '#666666' : '#333333'}
      >
        {(item.kind === 'dir' ? '📁 ' : '📄 ') + item.name}
      </Text>
    ))
  }

  // Widget UI with multi-view support
  return (
    <AutoLayout
      direction="vertical"
      spacing={12}
      padding={16}
      cornerRadius={8}
      fill="#FFFFFF"
      stroke={isConnected ? '#00AA00' : '#CCCCCC'}
      strokeWidth={2}
      width={selectedView === 'overview' ? 350 : 600}
      height={selectedView === 'overview' ? 'hug-contents' : 400}
    >
      {/* Header */}
      <AutoLayout
        direction="horizontal"
        spacing={8}
        width="fill-parent"
        verticalAlignItems="center"
      >
        <SVG
          src={`<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M13 3H6c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10l-7-7z" fill="${isConnected ? '#00AA00' : '#666666'}"/><path d="M13 3v7h7" fill="none" stroke="${isConnected ? '#00AA00' : '#666666'}" stroke-width="2"/></svg>`}
          width={24}
          height={24}
        />
        <Text fontSize={16} fontWeight="bold" fill="#333333">
          Code Review Workspace - {selectedView.charAt(0).toUpperCase() + selectedView.slice(1)}
        </Text>
      </AutoLayout>
      
      {/* Status bar */}
      <AutoLayout
        direction="horizontal"
        spacing={12}
        width="fill-parent"
        verticalAlignItems="center"
      >
        <Text fontSize={12} fill="#666666">
          Status: {status}
        </Text>
        <SVG
          src={`<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="${isConnected ? '#00AA00' : '#FF0000'}"/></svg>`}
          width={8}
          height={8}
        />
        <Text fontSize={12} fill={isConnected ? '#00AA00' : '#FF0000'}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </Text>
      </AutoLayout>
      
      {/* Main content area */}
      {renderViewContent()}
    </AutoLayout>
  )
}

// Command handler using Plugin API
function handleSocketMessage(data: any): Promise<any> {
  return new Promise(function(resolve, reject) {
    try {
      // Handle socket.ts message types
      switch (data.type) {
        case 'uml:generate':
          if (data.payload && data.payload.rootPath) {
            // Create a text node showing UML generation started
            figma.loadFontAsync({ family: "Inter", style: "Regular" }).then(function() {
              const textNode = figma.createText()
              textNode.characters = 'UML Generation: ' + data.payload.rootPath
              textNode.x = 100
              textNode.y = 100
              figma.currentPage.appendChild(textNode)
              resolve({ success: true, message: 'UML generation initiated' })
            }).catch(function() {
              resolve({ success: true, message: 'UML generation initiated (no font)' })
            })
          } else {
            reject(new Error('UML generation requires rootPath'))
          }
          break
          
        case 'uml:payload':
          if (data.payload) {
            // This would update widget state - handled in WebSocket onmessage
            resolve({ success: true, message: 'UML data received' })
          } else {
            reject(new Error('No UML payload provided'))
          }
          break
          
        case 'code:open':
          if (data.payload && data.payload.file) {
            resolve({ success: true, file: data.payload.file })
          } else {
            reject(new Error('Code open requires file path'))
          }
          break
          
        case 'code:highlight':
          if (data.payload && data.payload.file) {
            const rect = figma.createRectangle()
            rect.name = 'Code Highlight: ' + data.payload.file
            rect.x = 300
            rect.y = 200
            rect.resize(200, 50)
            rect.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 0 } }]
            figma.currentPage.appendChild(rect)
            resolve({ success: true, file: data.payload.file })
          } else {
            reject(new Error('Code highlight requires file'))
          }
          break
          
        case 'comments:upsert':
          if (data.payload && data.payload.text) {
            resolve({ success: true, commentId: 'comment-' + Date.now() })
          } else {
            reject(new Error('Comment requires text'))
          }
          break
          
        case 'comments:export':
          resolve({ 
            success: true, 
            format: data.payload?.format || 'json',
            count: 0
          })
          break
          
        default:
          resolve({ success: true, message: 'Message type: ' + data.type })
      }
    } catch (error: any) {
      reject(new Error('Socket message handling failed: ' + error.message))
    }
  })
}