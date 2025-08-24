/** @jsx figma.widget.h */

import { on, once, showUI } from '@create-figma-plugin/utilities'

const { widget } = figma
const { AutoLayout, Text, useSyncedState, usePropertyMenu, Rectangle } = widget

type DirNode = {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: DirNode[]
}

type Comment = {
  id: string
  file: string
  line: number
  text: string
  createdAt: string
}

type DiagramNode = {
  id: string
  label: string
  kind: 'class' | 'module' | 'function' | 'table'
  file: string
  symbol?: string
}

type DiagramEdge = {
  id: string
  source: string
  target: string
  type: 'import' | 'extends' | 'calls' | 'belongsTo' | 'references'
}

export default function () {
  widget.register(DirectoryTreeWidget)
  widget.register(DiagramWidget)
  widget.register(CodeReviewWidget)
  widget.register(CommentLogWidget)
}

function DirectoryTreeWidget() {
  const [directory, setDirectory] = useSyncedState<DirNode | null>('directory', null)
  const [selectedFile, setSelectedFile] = useSyncedState('selectedFile', '')
  const [isConnected, setIsConnected] = useSyncedState('isConnected', false)
  
  const connectToIDE = () => {
    setDirectory({
      name: 'src',
      path: '/src',
      kind: 'dir',
      children: [
        {
          name: 'components',
          path: '/src/components',
          kind: 'dir',
          children: [
            { name: 'Button.tsx', path: '/src/components/Button.tsx', kind: 'file' },
            { name: 'Modal.tsx', path: '/src/components/Modal.tsx', kind: 'file' },
            { name: 'UserProfile.tsx', path: '/src/components/UserProfile.tsx', kind: 'file' }
          ]
        },
        {
          name: 'utils',
          path: '/src/utils',
          kind: 'dir',
          children: [
            { name: 'helpers.ts', path: '/src/utils/helpers.ts', kind: 'file' },
            { name: 'api.ts', path: '/src/utils/api.ts', kind: 'file' }
          ]
        },
        { name: 'index.ts', path: '/src/index.ts', kind: 'file' },
        { name: 'App.tsx', path: '/src/App.tsx', kind: 'file' }
      ]
    })
    setIsConnected(true)
    setSelectedFile('/src/components/UserProfile.tsx') // Set default selection
  }

  const items: Array<WidgetPropertyMenuItem> = [
    {
      itemType: 'action',
      propertyName: 'refresh',
      tooltip: 'Refresh Directory'
    }
  ]

  async function onChange({ propertyName }: WidgetPropertyEvent): Promise<void> {
    if (propertyName === 'refresh') {
      // TODO: Implement WebSocket call to refresh directory
      console.log('Refresh directory requested')
    }
  }

  usePropertyMenu(items, onChange)

  const renderNode = (node: DirNode, depth = 0) => {
    const isSelected = selectedFile === node.path
    const indent = depth * 12
    
    return (
      <AutoLayout key={node.path} direction="vertical" spacing={2}>
        <AutoLayout
          direction="horizontal"
          spacing={4}
          padding={{ left: indent, right: 8, top: 2, bottom: 2 }}
          fill={isSelected ? '#E3F2FD' : 'transparent'}
          cornerRadius={4}
          onClick={() => {
            if (node.kind === 'file') {
              setSelectedFile(node.path)
              // TODO: Emit event to open file in code review panel
              console.log('File selected:', node.path)
            }
          }}
        >
          <Text
            fontSize={10}
            fill={node.kind === 'dir' ? '#666666' : '#333333'}
          >
            {node.kind === 'dir' ? '📁' : '📄'}
          </Text>
          <Text
            fontSize={11}
            fill={node.kind === 'dir' ? '#666666' : '#333333'}
            fontWeight={node.kind === 'dir' ? 'bold' : 'normal'}
          >
            {node.name}
          </Text>
        </AutoLayout>
        {node.children && node.children.map(child => renderNode(child, depth + 1))}
      </AutoLayout>
    )
  }

  return (
    <AutoLayout
      direction="vertical"
      fill="#FFFFFF"
      stroke="#DDDDDD"
      strokeWidth={1}
      cornerRadius={8}
      padding={12}
      width={280}
      height={400}
      spacing={8}
    >
      <Text fontSize={14} fontWeight="bold" fill="#333333">
        📂 Directory
      </Text>
      <Rectangle fill="#EEEEEE" width="fill-parent" height={1} />
      <AutoLayout
        direction="vertical"
        width="fill-parent"
        height="fill-parent"
        overflow="scroll"
      >
        {isConnected && directory ? (
          renderNode(directory)
        ) : (
          <AutoLayout
            direction="vertical"
            width="fill-parent"
            height="fill-parent"
            horizontalAlignItems="center"
            verticalAlignItems="center"
            spacing={12}
          >
            <Text fontSize={12} fill="#666666" horizontalAlignText="center">
              Connect to your IDE to explore the codebase
            </Text>
            <AutoLayout
              onClick={connectToIDE}
              fill="#0D99FF"
              cornerRadius={6}
              padding={{ horizontal: 16, vertical: 8 }}
            >
              <Text fontSize={12} fill="#FFFFFF" fontWeight="bold">
                Connect to IDE
              </Text>
            </AutoLayout>
          </AutoLayout>
        )}
      </AutoLayout>
    </AutoLayout>
  )
}

function DiagramWidget() {
  const [nodes, setNodes] = useSyncedState<DiagramNode[]>('diagramNodes', [])
  const [edges, setEdges] = useSyncedState<DiagramEdge[]>('diagramEdges', [])
  const [selectedFile, setSelectedFile] = useSyncedState('selectedFile', '')
  const [isConnected, setIsConnected] = useSyncedState('isConnected', false)
  
  const generateDiagram = () => {
    setNodes([
      { id: '1', label: 'UserService', kind: 'class', file: '/src/services/UserService.ts', symbol: 'class UserService' },
      { id: '2', label: 'AuthController', kind: 'class', file: '/src/controllers/AuthController.ts', symbol: 'class AuthController' },
      { id: '3', label: 'DatabaseHelper', kind: 'module', file: '/src/utils/database.ts', symbol: 'DatabaseHelper' },
      { id: '4', label: 'validateUser', kind: 'function', file: '/src/utils/validation.ts', symbol: 'function validateUser' },
      { id: '5', label: 'User', kind: 'table', file: '/src/models/User.ts', symbol: 'interface User' }
    ])
    setEdges([
      { id: 'e1', source: '2', target: '1', type: 'calls' },
      { id: 'e2', source: '1', target: '3', type: 'import' },
      { id: 'e3', source: '2', target: '4', type: 'calls' },
      { id: 'e4', source: '1', target: '5', type: 'references' }
    ])
    setIsConnected(true)
  }
  
  const items: Array<WidgetPropertyMenuItem> = [
    {
      itemType: 'action',
      propertyName: 'generate',
      tooltip: 'Generate Diagram'
    },
    {
      itemType: 'action',
      propertyName: 'refresh',
      tooltip: 'Refresh Diagram'
    }
  ]

  async function onChange({ propertyName }: WidgetPropertyEvent): Promise<void> {
    if (propertyName === 'generate') {
      generateDiagram()
    } else if (propertyName === 'refresh') {
      generateDiagram()
    }
  }

  usePropertyMenu(items, onChange)

  const renderDiagramNode = (node: DiagramNode, index: number) => {
    const isRelated = !selectedFile || node.file === selectedFile
    const opacity = isRelated ? 1 : 0.3
    
    const colors = {
      class: '#4CAF50',
      module: '#2196F3', 
      function: '#FF9800',
      table: '#9C27B0'
    }
    
    // Count connections for this node
    const connectionCount = edges.filter(edge => edge.source === node.id || edge.target === node.id).length

    return (
      <AutoLayout
        key={node.id}
        direction="vertical"
        fill={colors[node.kind]}
        stroke={isRelated ? '#333333' : '#CCCCCC'}
        strokeWidth={isRelated ? 2 : 1}
        cornerRadius={8}
        padding={8}
        spacing={4}
        opacity={opacity}
        onClick={() => {
          setSelectedFile(node.file)
          console.log('Diagram node clicked:', node.id, node.file)
        }}
        positioning="absolute"
        x={(index % 4) * 140 + 20}
        y={Math.floor(index / 4) * 80 + 20}
      >
        <Text fontSize={10} fill="#FFFFFF" fontWeight="bold">
          {node.kind.toUpperCase()}
        </Text>
        <Text fontSize={12} fill="#FFFFFF">
          {node.label}
        </Text>
        {node.symbol && (
          <Text fontSize={9} fill="#FFFFFF" opacity={0.8}>
            {node.symbol}
          </Text>
        )}
        {connectionCount > 0 && (
          <Text fontSize={8} fill="#FFFFFF" opacity={0.6}>
            {connectionCount} connection{connectionCount > 1 ? 's' : ''}
          </Text>
        )}
      </AutoLayout>
    )
  }

  return (
    <AutoLayout
      direction="vertical"
      fill="#FAFAFA"
      stroke="#DDDDDD"
      strokeWidth={1}
      cornerRadius={8}
      padding={12}
      width={600}
      height={400}
      spacing={8}
    >
      <Text fontSize={14} fontWeight="bold" fill="#333333">
        🔗 Architecture Diagram
      </Text>
      <Rectangle fill="#EEEEEE" width="fill-parent" height={1} />
      <AutoLayout
        direction="vertical"
        width="fill-parent"
        height="fill-parent"
        positioning="absolute"
      >
        {nodes.length > 0 ? (
          nodes.map((node, index) => renderDiagramNode(node, index))
        ) : (
          <AutoLayout
            direction="vertical"
            width="fill-parent"
            height="fill-parent"
            horizontalAlignItems="center"
            verticalAlignItems="center"
            spacing={12}
          >
            <Text fontSize={12} fill="#666666" horizontalAlignText="center">
              Generate a diagram to visualize your codebase architecture
            </Text>
            <AutoLayout
              onClick={generateDiagram}
              fill="#0D99FF"
              cornerRadius={6}
              padding={{ horizontal: 16, vertical: 8 }}
            >
              <Text fontSize={12} fill="#FFFFFF" fontWeight="bold">
                Generate Diagram
              </Text>
            </AutoLayout>
          </AutoLayout>
        )}
      </AutoLayout>
    </AutoLayout>
  )
}

function CodeReviewWidget() {
  const [comments, setComments] = useSyncedState<Comment[]>('comments', [])
  const [fileContent, setFileContent] = useSyncedState('fileContent', '')
  const [currentFile, setCurrentFile] = useSyncedState('currentFile', '')
  const [selectedFile] = useSyncedState('selectedFile', '')
  
  const loadFile = (filePath: string) => {
    const mockContent = `import React from 'react';
import { User } from '../types/User';

interface Props {
  user: User;
  onUpdate: (user: User) => void;
}

const UserProfile: React.FC<Props> = ({ user, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  
  const handleSave = () => {
    // Save user data
    onUpdate(user);
    setIsEditing(false);
  };
  
  return (
    <div className="user-profile">
      <h2>{user.name}</h2>
      <p>Email: {user.email}</p>
      {isEditing && (
        <button onClick={handleSave}>
          Save Changes
        </button>
      )}
    </div>
  );
};

export default UserProfile;`
    
    setFileContent(mockContent)
    setCurrentFile(filePath)
  }
  
  // Auto-load file when selectedFile changes from other widgets
  if (selectedFile && selectedFile !== currentFile) {
    loadFile(selectedFile)
  }
  const [selectedLines, setSelectedLines] = useSyncedState<number[]>('selectedLines', [])
  
  const items: Array<WidgetPropertyMenuItem> = [
    {
      itemType: 'action',
      propertyName: 'addComment',
      tooltip: 'Add Comment to Selection'
    },
    {
      itemType: 'action',
      propertyName: 'clearSelection',
      tooltip: 'Clear Selection'
    }
  ]

  async function onChange({ propertyName }: WidgetPropertyEvent): Promise<void> {
    if (propertyName === 'addComment') {
      if (selectedLines.length > 0) {
        once('ADD_COMMENT', (comment: Comment) => {
          setComments([...comments, comment])
        })
        
        showUI(
          { height: 200, width: 400, title: 'Add Comment' },
          { 
            file: currentFile,
            line: selectedLines[0],
            selectedLines: selectedLines
          }
        )
      }
    } else if (propertyName === 'clearSelection') {
      setSelectedLines([])
    }
  }

  usePropertyMenu(items, onChange)

  const renderCodeLines = () => {
    if (!fileContent) return null
    
    const lines = fileContent.split('\n')
    return lines.map((line, index) => {
      const lineNumber = index + 1
      const isSelected = selectedLines.includes(lineNumber)
      
      return (
        <AutoLayout
          key={lineNumber}
          direction="horizontal"
          spacing={8}
          padding={{ left: 8, right: 8, top: 1, bottom: 1 }}
          fill={isSelected ? '#FFF3E0' : 'transparent'}
          width="fill-parent"
          onClick={() => {
            // Toggle line selection
            if (isSelected) {
              setSelectedLines(selectedLines.filter(l => l !== lineNumber))
            } else {
              setSelectedLines([...selectedLines, lineNumber])
            }
          }}
        >
          <Text
            fontSize={10}
            fill="#999999"
            width={30}
            horizontalAlignText="right"
          >
            {lineNumber}
          </Text>
          <Text
            fontSize={10}
            fill={isSelected ? '#E65100' : '#333333'}
            fontFamily="monospace"
          >
            {line || ' '}
          </Text>
        </AutoLayout>
      )
    })
  }

  return (
    <AutoLayout
      direction="vertical"
      fill="#FFFFFF"
      stroke="#DDDDDD"
      strokeWidth={1}
      cornerRadius={8}
      padding={12}
      width={500}
      height={400}
      spacing={8}
    >
      <AutoLayout direction="horizontal" width="fill-parent" spacing={8}>
        <Text fontSize={14} fontWeight="bold" fill="#333333">
          📝 Code Review
        </Text>
        {currentFile && (
          <Text fontSize={11} fill="#666666">
            {currentFile}
          </Text>
        )}
      </AutoLayout>
      <Rectangle fill="#EEEEEE" width="fill-parent" height={1} />
      <AutoLayout
        direction="vertical"
        width="fill-parent"
        height="fill-parent"
        overflow="scroll"
      >
        {fileContent ? (
          renderCodeLines()
        ) : (
          <AutoLayout
            direction="vertical"
            width="fill-parent"
            height="fill-parent"
            horizontalAlignItems="center"
            verticalAlignItems="center"
            spacing={12}
          >
            <Text fontSize={12} fill="#666666" horizontalAlignText="center">
              Select a file from the directory to view its contents
            </Text>
          </AutoLayout>
        )}
      </AutoLayout>
      {selectedLines.length > 0 && (
        <AutoLayout
          direction="horizontal"
          spacing={8}
          padding={8}
          fill="#FFF3E0"
          cornerRadius={4}
        >
          <Text fontSize={11} fill="#E65100">
            {selectedLines.length} line{selectedLines.length > 1 ? 's' : ''} selected
          </Text>
        </AutoLayout>
      )}
    </AutoLayout>
  )
}

function CommentLogWidget() {
  const [comments, setComments] = useSyncedState<Comment[]>('comments', [])
  const [isConnected, setIsConnected] = useSyncedState('isConnected', false)
  
  const loadSampleComments = () => {
    setComments([
      {
        id: '1',
        file: '/src/components/UserProfile.tsx',
        line: 12,
        text: 'Consider adding error handling for the onUpdate callback',
        createdAt: '2024-01-15T10:30:00Z'
      },
      {
        id: '2',
        file: '/src/components/UserProfile.tsx', 
        line: 18,
        text: 'This div should have proper accessibility attributes',
        createdAt: '2024-01-15T10:32:00Z'
      },
      {
        id: '3',
        file: '/src/utils/helpers.ts',
        line: 5,
        text: 'Function could be optimized with memoization',
        createdAt: '2024-01-15T10:35:00Z'
      }
    ])
    setIsConnected(true)
  }
  
  const items: Array<WidgetPropertyMenuItem> = [
    {
      itemType: 'action',
      propertyName: 'export',
      tooltip: 'Export Comments'
    },
    {
      itemType: 'action',
      propertyName: 'clear',
      tooltip: 'Clear All Comments'
    }
  ]

  async function onChange({ propertyName }: WidgetPropertyEvent): Promise<void> {
    if (propertyName === 'export') {
      once('EXPORT_COPIED', (data) => {
        console.log('Comments exported:', data)
      })
      
      showUI(
        { height: 300, width: 500, title: 'Export Comments' },
        { comments }
      )
    } else if (propertyName === 'clear') {
      setComments([])
    }
  }

  usePropertyMenu(items, onChange)

  const renderComment = (comment: Comment, index: number) => {
    return (
      <AutoLayout
        key={comment.id}
        direction="vertical"
        spacing={4}
        padding={8}
        fill={index % 2 === 0 ? '#F9F9F9' : '#FFFFFF'}
        width="fill-parent"
      >
        <AutoLayout direction="horizontal" spacing={8} width="fill-parent">
          <Text fontSize={10} fill="#666666">
            #{index + 1}
          </Text>
          <Text fontSize={11} fill="#2196F3">
            {comment.file}:{comment.line}
          </Text>
          <Text fontSize={9} fill="#999999">
            {comment.createdAt}
          </Text>
        </AutoLayout>
        <Text fontSize={11} fill="#333333">
          {comment.text}
        </Text>
      </AutoLayout>
    )
  }

  return (
    <AutoLayout
      direction="vertical"
      fill="#FFFFFF"
      stroke="#DDDDDD"
      strokeWidth={1}
      cornerRadius={8}
      padding={12}
      width={800}
      height={200}
      spacing={8}
    >
      <AutoLayout direction="horizontal" width="fill-parent" spacing={8}>
        <Text fontSize={14} fontWeight="bold" fill="#333333">
          💬 Comments
        </Text>
        <Text fontSize={12} fill="#666666">
          ({comments.length})
        </Text>
      </AutoLayout>
      <Rectangle fill="#EEEEEE" width="fill-parent" height={1} />
      <AutoLayout
        direction="vertical"
        width="fill-parent"
        height="fill-parent"
        overflow="scroll"
      >
        {comments.length > 0 ? (
          comments.map((comment, index) => renderComment(comment, index))
        ) : (
          <AutoLayout
            direction="vertical"
            width="fill-parent"
            height="fill-parent"
            horizontalAlignItems="center"
            verticalAlignItems="center"
            spacing={12}
          >
            <Text fontSize={12} fill="#666666" horizontalAlignText="center">
              No comments yet. Select code lines and add comments to start reviewing.
            </Text>
            <AutoLayout
              onClick={loadSampleComments}
              fill="#0D99FF"
              cornerRadius={6}
              padding={{ horizontal: 16, vertical: 8 }}
            >
              <Text fontSize={12} fill="#FFFFFF" fontWeight="bold">
                Load Sample Comments
              </Text>
            </AutoLayout>
          </AutoLayout>
        )}
      </AutoLayout>
    </AutoLayout>
  )
}
