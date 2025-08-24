import {
  Button,
  Container,
  render,
  TextboxMultiline,
  useInitialFocus,
  VerticalSpace,
  Text,
  Tabs,
  TabsOption,
  Dropdown,
  DropdownOption
} from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { h } from 'preact'
import { useCallback, useState, useEffect } from 'preact/hooks'
// TODO: Re-enable when React/Preact compatibility is resolved
// import CodeMirror from '@uiw/react-codemirror'
// import { langs } from '@uiw/codemirror-extensions-langs'

type Comment = {
  id: string
  file: string
  line: number
  text: string
  createdAt: string
}

type AddCommentProps = {
  file: string
  line: number
  selectedLines: number[]
}

type ExportCommentsProps = {
  comments: Comment[]
}

type CodeReviewUIProps = {
  fileContent: string
  fileName: string
  selectedLines: number[]
}

// New CodeMirror-based code review UI
function CodeReviewUI(props: CodeReviewUIProps) {
  const [selectedLines, setSelectedLines] = useState<number[]>(props.selectedLines || [])
  const [commentText, setCommentText] = useState('')
  
  const handleAddComment = useCallback(
    function () {
      if (commentText.trim() && selectedLines.length > 0) {
        const comment: Comment = {
          id: Date.now().toString(),
          file: props.fileName,
          line: selectedLines[0],
          text: commentText.trim(),
          createdAt: new Date().toISOString()
        }
        emit('ADD_COMMENT', comment)
        setCommentText('')
        figma.closePlugin()
      }
    },
    [commentText, selectedLines, props.fileName]
  )

  // TODO: Re-enable when React/Preact compatibility is resolved
  // Determine file extension for syntax highlighting
  /*
  const getLanguageExtension = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'js':
      case 'jsx':
        return [langs.javascript()]
      case 'ts':
      case 'tsx':
        return [langs.typescript()]
      case 'html':
        return [langs.html()]
      case 'css':
        return [langs.css()]
      case 'json':
        return [langs.json()]
      case 'md':
        return [langs.markdown()]
      default:
        return [langs.javascript()] // Default to JS
    }
  }
  */
  
  return (
    <Container space="medium">
      <VerticalSpace space="medium" />
      <Text><strong>Code Review: {props.fileName}</strong></Text>
      <VerticalSpace space="medium" />
      
      {/* TODO: Re-enable CodeMirror when React/Preact compatibility is resolved */}
      <div style={{ border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden', padding: '12px', fontFamily: 'monospace', backgroundColor: '#f5f5f5' }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '12px' }}>
          {props.fileContent}
        </pre>
      </div>
      {/*
      <CodeMirror
        value={props.fileContent}
        height="400px"
        extensions={getLanguageExtension(props.fileName)}
        theme="light"
        editable={false}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          dropCursor: false,
          allowMultipleSelections: false,
          searchKeymap: false
        }}
      />
      */}
      
      <VerticalSpace space="medium" />
      
      {selectedLines.length > 0 && (
        <div>
          <Text>Selected lines: {selectedLines.join(', ')}</Text>
          <VerticalSpace space="small" />
          <TextboxMultiline
            {...useInitialFocus()}
            onValueInput={setCommentText}
            placeholder="Add your review comment..."
            rows={3}
            value={commentText}
          />
          <VerticalSpace space="medium" />
          <Button 
            fullWidth 
            onClick={handleAddComment}
            disabled={!commentText.trim()}
          >
            Add Comment
          </Button>
        </div>
      )}
      
      <VerticalSpace space="medium" />
      <Button fullWidth secondary onClick={() => figma.closePlugin()}>
        Close
      </Button>
      <VerticalSpace space="small" />
    </Container>
  )
}

function Plugin(props: { text: string } | AddCommentProps | ExportCommentsProps | CodeReviewUIProps) {
  // Handle comment addition
  if ('file' in props && 'line' in props) {
    const [commentText, setCommentText] = useState('')
    const [priority, setPriority] = useState('normal')
    
    const handleAddComment = useCallback(
      function () {
        if (commentText.trim()) {
          const comment: Comment = {
            id: Date.now().toString(),
            file: props.file,
            line: props.line,
            text: commentText.trim(),
            createdAt: new Date().toISOString()
          }
          emit('ADD_COMMENT', comment)
          figma.closePlugin()
        }
      },
      [commentText, props.file, props.line]
    )

    const priorityOptions: DropdownOption[] = [
      { value: 'low', text: 'Low Priority' },
      { value: 'normal', text: 'Normal' },
      { value: 'high', text: 'High Priority' },
      { value: 'critical', text: 'Critical' }
    ]

    return (
      <Container space="medium">
        <VerticalSpace space="medium" />
        <Text>Adding comment to:</Text>
        <Text>
          <strong>{props.file}</strong> at line {props.line}
          {props.selectedLines.length > 1 && (
            <span> ({props.selectedLines.length} lines selected)</span>
          )}
        </Text>
        <VerticalSpace space="medium" />
        
        <TextboxMultiline
          {...useInitialFocus()}
          onValueInput={setCommentText}
          placeholder="Enter your review comment..."
          rows={4}
          value={commentText}
        />
        <VerticalSpace space="medium" />
        
        <Dropdown
          onChange={(event) => setPriority(event.currentTarget.value)}
          options={priorityOptions}
          placeholder="Select priority"
          value={priority}
        />
        <VerticalSpace space="medium" />
        
        <Button 
          fullWidth 
          onClick={handleAddComment}
          disabled={!commentText.trim()}
        >
          Add Comment
        </Button>
        <VerticalSpace space="small" />
      </Container>
    )
  }
  
  // Handle CodeMirror code review
  if ('fileContent' in props && 'fileName' in props) {
    return <CodeReviewUI {...props} />
  }
  
  // Handle comment export
  if ('comments' in props) {
    const [exportFormat, setExportFormat] = useState('json')
    const [exportContent, setExportContent] = useState('')
    
    const formatOptions: TabsOption[] = [
      { value: 'json', children: 'JSON' },
      { value: 'csv', children: 'CSV' },
      { value: 'markdown', children: 'Markdown' }
    ]

    const generateExportContent = useCallback(
      function (format: string) {
        const comments = props.comments
        
        switch (format) {
          case 'json':
            return JSON.stringify({
              reviewDate: new Date().toISOString(),
              totalComments: comments.length,
              comments: comments
            }, null, 2)
          
          case 'csv':
            const csvHeader = 'File,Line,Comment,Created At\n'
            const csvRows = comments.map(c => 
              `"${c.file}",${c.line},"${c.text.replace(/"/g, '""')}","${c.createdAt}"`
            ).join('\n')
            return csvHeader + csvRows
          
          case 'markdown':
            let md = `# Code Review Comments\n\n`
            md += `**Review Date:** ${new Date().toISOString()}\n`
            md += `**Total Comments:** ${comments.length}\n\n`
            
            const fileGroups = comments.reduce((groups, comment) => {
              if (!groups[comment.file]) {
                groups[comment.file] = []
              }
              groups[comment.file].push(comment)
              return groups
            }, {} as Record<string, Comment[]>)
            
            Object.entries(fileGroups).forEach(([file, fileComments]) => {
              md += `## ${file}\n\n`
              fileComments.sort((a, b) => a.line - b.line).forEach(comment => {
                md += `**Line ${comment.line}:** ${comment.text}\n\n`
              })
            })
            
            return md
          
          default:
            return ''
        }
      },
      [props.comments]
    )

    const handleFormatChange = useCallback(
      function (event: any) {
        const newFormat = event.currentTarget.value
        setExportFormat(newFormat)
        setExportContent(generateExportContent(newFormat))
      },
      [generateExportContent]
    )

    const handleCopyToClipboard = useCallback(
      function () {
        navigator.clipboard.writeText(exportContent)
        emit('EXPORT_COPIED', { format: exportFormat, content: exportContent })
        figma.closePlugin()
      },
      [exportContent, exportFormat]
    )

    useEffect(() => {
      setExportContent(generateExportContent(exportFormat))
    }, [generateExportContent, exportFormat])

    return (
      <Container space="medium">
        <VerticalSpace space="medium" />
        <Text>Export {props.comments.length} comments</Text>
        <VerticalSpace space="medium" />
        
        <Tabs
          onChange={handleFormatChange}
          options={formatOptions}
          value={exportFormat}
        />
        <VerticalSpace space="medium" />
        
        <TextboxMultiline
          disabled
          rows={8}
          value={exportContent}
        />
        <VerticalSpace space="medium" />
        
        <Button fullWidth onClick={handleCopyToClipboard}>
          Copy to Clipboard
        </Button>
        <VerticalSpace space="small" />
      </Container>
    )
  }
  
  // Default: original text editor
  const [text, setText] = useState(props.text)
  const handleUpdateButtonClick = useCallback(
    function () {
      emit('UPDATE_TEXT', text)
    },
    [text]
  )
  return (
    <Container space="medium">
      <VerticalSpace space="large" />
      <TextboxMultiline
        {...useInitialFocus()}
        onValueInput={setText}
        value={text}
      />
      <VerticalSpace space="large" />
      <Button fullWidth onClick={handleUpdateButtonClick}>
        Update Text
      </Button>
      <VerticalSpace space="small" />
    </Container>
  )
}

export default render(Plugin)
