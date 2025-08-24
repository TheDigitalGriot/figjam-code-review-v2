export interface DirNode {
  name: string;
  path: string;
  kind: 'dir' | 'file';
  children?: DirNode[];
}

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

export interface FileToUmlMap {
  [filePath: string]: {
    symbols: string[];
    nodeIds: string[];
  };
}

export interface UmlDiagram {
  nodes: UmlNode[];
  edges: UmlEdge[];
}

export interface UmlPayload {
  diagram: UmlDiagram;
  mapping: FileToUmlMap;
  directory: DirNode;
  metadata: {
    generatedAt: string;
    totalFiles: number;
    totalSymbols: number;
    rootPath: string;
  };
}

export interface CodeSymbol {
  name: string;
  kind: 'class' | 'interface' | 'function' | 'variable' | 'type' | 'enum';
  file: string;
  line: number;
  column: number;
  properties?: Array<{name: string; type?: string; line: number}>;
  methods?: Array<{name: string; parameters?: string[]; returnType?: string; line: number}>;
  extends?: string;
  implements?: string[];
  imports?: Array<{name: string; from: string}>;
  exports?: string[];
}

export interface AnalysisResult {
  symbols: CodeSymbol[];
  dependencies: Array<{from: string; to: string; kind: string}>;
  files: string[];
  errors: Array<{file: string; message: string}>;
}