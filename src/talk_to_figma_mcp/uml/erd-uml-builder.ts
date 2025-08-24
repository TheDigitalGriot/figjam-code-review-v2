import { v4 as uuidv4 } from 'uuid';
import { UmlDiagram, UmlNode, UmlEdge, FileToUmlMap, CodeSymbol, AnalysisResult, UmlPayload, DirNode } from './types.js';

export class ErdUmlBuilder {
  private nodeIdMap = new Map<string, string>();
  private symbolToNodeMap = new Map<string, string>();

  buildUmlDiagram(analysisResult: AnalysisResult, directory: DirNode, rootPath: string): UmlPayload {
    const nodes: UmlNode[] = [];
    const edges: UmlEdge[] = [];
    const mapping: FileToUmlMap = {};

    // Clear previous mappings
    this.nodeIdMap.clear();
    this.symbolToNodeMap.clear();

    // Create nodes from symbols
    analysisResult.symbols.forEach(symbol => {
      const node = this.createNodeFromSymbol(symbol);
      nodes.push(node);
      
      // Update mapping
      if (!mapping[symbol.file]) {
        mapping[symbol.file] = { symbols: [], nodeIds: [] };
      }
      mapping[symbol.file].symbols.push(symbol.name);
      mapping[symbol.file].nodeIds.push(node.id);
    });

    // Create edges from dependencies
    analysisResult.dependencies.forEach(dep => {
      const edge = this.createEdgeFromDependency(dep, analysisResult.symbols);
      if (edge) {
        edges.push(edge);
      }
    });

    // Create module nodes for files without explicit symbols
    this.createModuleNodes(analysisResult, nodes, mapping);

    const diagram: UmlDiagram = { nodes, edges };
    
    const payload: UmlPayload = {
      diagram,
      mapping,
      directory,
      metadata: {
        generatedAt: new Date().toISOString(),
        totalFiles: analysisResult.files.length,
        totalSymbols: analysisResult.symbols.length,
        rootPath
      }
    };

    return payload;
  }

  private createNodeFromSymbol(symbol: CodeSymbol): UmlNode {
    const nodeId = uuidv4();
    const symbolKey = `${symbol.file}:${symbol.name}`;
    
    this.nodeIdMap.set(symbolKey, nodeId);
    this.symbolToNodeMap.set(symbol.name, nodeId);

    const node: UmlNode = {
      id: nodeId,
      label: symbol.name,
      kind: symbol.kind,
      file: symbol.file,
      symbol: symbol.name,
      line: symbol.line,
      properties: symbol.properties?.map(p => `${p.name}: ${p.type || 'unknown'}`),
      methods: symbol.methods?.map(m => 
        `${m.name}(${m.parameters?.join(', ') || ''}): ${m.returnType || 'void'}`
      ),
      imports: symbol.imports?.map(imp => `${imp.name} from ${imp.from}`),
      exports: symbol.exports
    };

    return node;
  }

  private createEdgeFromDependency(
    dep: { from: string; to: string; kind: string }, 
    symbols: CodeSymbol[]
  ): UmlEdge | null {
    const sourceSymbol = symbols.find(s => s.file === dep.from);
    const targetSymbol = symbols.find(s => s.name === dep.to || s.file === dep.to);

    if (!sourceSymbol && !targetSymbol) return null;

    const sourceNodeId = sourceSymbol ? 
      this.nodeIdMap.get(`${sourceSymbol.file}:${sourceSymbol.name}`) :
      this.getOrCreateFileNode(dep.from);

    const targetNodeId = targetSymbol ?
      this.nodeIdMap.get(`${targetSymbol.file}:${targetSymbol.name}`) ||
      this.symbolToNodeMap.get(dep.to) :
      this.getOrCreateFileNode(dep.to);

    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return null;

    const edge: UmlEdge = {
      id: uuidv4(),
      source: sourceNodeId,
      target: targetNodeId,
      type: dep.kind as UmlEdge['type'],
      label: this.getEdgeLabel(dep.kind, dep.to)
    };

    return edge;
  }

  private createModuleNodes(
    analysisResult: AnalysisResult, 
    nodes: UmlNode[], 
    mapping: FileToUmlMap
  ): void {
    // Create module nodes for files that don't have explicit symbols
    analysisResult.files.forEach(filePath => {
      if (!mapping[filePath] || mapping[filePath].symbols.length === 0) {
        const moduleNode = this.createModuleNode(filePath);
        nodes.push(moduleNode);
        
        if (!mapping[filePath]) {
          mapping[filePath] = { symbols: [], nodeIds: [] };
        }
        mapping[filePath].symbols.push(moduleNode.label);
        mapping[filePath].nodeIds.push(moduleNode.id);
      }
    });
  }

  private createModuleNode(filePath: string): UmlNode {
    const nodeId = uuidv4();
    const fileName = filePath.split('/').pop()?.replace(/\.(ts|tsx|js|jsx)$/, '') || 'unknown';
    
    const symbolKey = `${filePath}:module`;
    this.nodeIdMap.set(symbolKey, nodeId);

    return {
      id: nodeId,
      label: fileName,
      kind: 'module',
      file: filePath,
      symbol: 'module'
    };
  }

  private getOrCreateFileNode(filePath: string): string {
    const symbolKey = `${filePath}:module`;
    let nodeId = this.nodeIdMap.get(symbolKey);
    
    if (!nodeId) {
      nodeId = uuidv4();
      this.nodeIdMap.set(symbolKey, nodeId);
    }
    
    return nodeId;
  }

  private getEdgeLabel(kind: string, target: string): string {
    switch (kind) {
      case 'import': return 'imports';
      case 'extends': return 'extends';
      case 'implements': return 'implements';
      case 'calls': return 'calls';
      case 'references': return 'uses';
      default: return kind;
    }
  }

  // Helper method to filter diagram by file
  static filterDiagramByFile(payload: UmlPayload, filePath: string): UmlPayload {
    const mapping = payload.mapping[filePath];
    if (!mapping) return payload;

    const relevantNodeIds = new Set(mapping.nodeIds);
    const filteredNodes = payload.diagram.nodes.filter(node => 
      relevantNodeIds.has(node.id)
    );
    
    const filteredEdges = payload.diagram.edges.filter(edge => 
      relevantNodeIds.has(edge.source) || relevantNodeIds.has(edge.target)
    );

    return {
      ...payload,
      diagram: {
        nodes: filteredNodes,
        edges: filteredEdges
      }
    };
  }

  // Helper method to get connected nodes
  static getConnectedNodes(payload: UmlPayload, nodeId: string): string[] {
    const connectedIds = new Set<string>();
    
    payload.diagram.edges.forEach(edge => {
      if (edge.source === nodeId) {
        connectedIds.add(edge.target);
      }
      if (edge.target === nodeId) {
        connectedIds.add(edge.source);
      }
    });

    return Array.from(connectedIds);
  }

  // Helper method to find nodes by symbol name
  static findNodesBySymbol(payload: UmlPayload, symbolName: string): UmlNode[] {
    return payload.diagram.nodes.filter(node => 
      node.symbol === symbolName || node.label === symbolName
    );
  }
}