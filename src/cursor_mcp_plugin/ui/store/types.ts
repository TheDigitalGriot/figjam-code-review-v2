// Store types for the UI widgets
export interface UmlNode {
  id: string;
  label: string;
  kind: 'class' | 'module' | 'function' | 'interface' | 'type' | 'enum';
  file: string;
  symbol?: string;
  line?: number;
  properties?: string[];
  methods?: string[];
  imports?: string[];
  exports?: string[];
}

export interface UmlEdge {
  id: string;
  source: string;
  target: string;
  type: 'import' | 'extends' | 'implements' | 'calls' | 'references' | 'contains';
  label?: string;
}

export interface UmlDiagram {
  nodes: UmlNode[];
  edges: UmlEdge[];
}

export interface DirNode {
  name: string;
  path: string;
  kind: 'dir' | 'file';
  children?: DirNode[];
  expanded?: boolean;
}

export interface CodeComment {
  id: string;
  file: string;
  line: number;
  text: string;
  createdAt: string;
  range?: [number, number];
}

export interface FileContent {
  path: string;
  content: string;
  highlightedLines?: Set<number>;
  selectedRange?: [number, number];
}

export interface AppState {
  // UML Diagram
  diagram: UmlDiagram | null;
  diagramVisible: boolean;
  selectedNodeIds: Set<string>;
  dimmedNodeIds: Set<string>;
  
  // Directory Tree
  directoryTree: DirNode | null;
  selectedFilePath: string | null;
  
  // Code Review
  openFile: FileContent | null;
  
  // Comments
  comments: CodeComment[];
  
  // UI State
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  bottomPanelVisible: boolean;
  
  // WebSocket
  isConnected: boolean;
  channelName: string | null;
}

export interface UIWidget {
  id: string;
  type: 'directory' | 'codeReview' | 'commentLog' | 'diagram';
  visible: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
}