import { AppState, DirNode, UmlDiagram, CodeComment, FileContent } from './types';

class Store {
  private state: AppState = {
    diagram: null,
    diagramVisible: true,
    selectedNodeIds: new Set(),
    dimmedNodeIds: new Set(),
    directoryTree: null,
    selectedFilePath: null,
    openFile: null,
    comments: [],
    leftPanelVisible: true,
    rightPanelVisible: true,
    bottomPanelVisible: true,
    isConnected: false,
    channelName: null
  };

  private listeners: Array<(state: AppState) => void> = [];

  // Subscribe to state changes
  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Notify listeners of state changes
  private notify() {
    this.listeners.forEach(listener => listener(this.getState()));
  }

  // Get current state
  getState(): AppState {
    return { 
      ...this.state,
      selectedNodeIds: new Set(this.state.selectedNodeIds),
      dimmedNodeIds: new Set(this.state.dimmedNodeIds),
      comments: [...this.state.comments]
    };
  }

  // WebSocket actions
  setConnectionState(isConnected: boolean, channelName?: string) {
    this.state.isConnected = isConnected;
    if (channelName) {
      this.state.channelName = channelName;
    }
    this.notify();
  }

  // Diagram actions
  setDiagram(diagram: UmlDiagram) {
    this.state.diagram = diagram;
    this.state.selectedNodeIds.clear();
    this.state.dimmedNodeIds.clear();
    this.notify();
  }

  selectNode(nodeId: string, addToSelection = false) {
    if (!addToSelection) {
      this.state.selectedNodeIds.clear();
    }
    this.state.selectedNodeIds.add(nodeId);
    this.notify();
  }

  deselectNode(nodeId: string) {
    this.state.selectedNodeIds.delete(nodeId);
    this.notify();
  }

  dimNodes(nodeIds: string[]) {
    this.state.dimmedNodeIds.clear();
    nodeIds.forEach(id => this.state.dimmedNodeIds.add(id));
    this.notify();
  }

  clearDimming() {
    this.state.dimmedNodeIds.clear();
    this.notify();
  }

  setDiagramVisible(visible: boolean) {
    this.state.diagramVisible = visible;
    this.notify();
  }

  // Directory actions
  setDirectoryTree(tree: DirNode) {
    this.state.directoryTree = tree;
    this.notify();
  }

  selectFile(filePath: string) {
    this.state.selectedFilePath = filePath;
    // Auto-dim unrelated nodes when file is selected
    if (this.state.diagram && filePath) {
      this.dimUnrelatedNodes(filePath);
    }
    this.notify();
  }

  expandDirectory(path: string, expanded: boolean) {
    if (this.state.directoryTree) {
      this.toggleDirectoryExpansion(this.state.directoryTree, path, expanded);
      this.notify();
    }
  }

  private toggleDirectoryExpansion(node: DirNode, targetPath: string, expanded: boolean) {
    if (node.path === targetPath) {
      node.expanded = expanded;
      return;
    }
    if (node.children) {
      node.children.forEach(child => 
        this.toggleDirectoryExpansion(child, targetPath, expanded)
      );
    }
  }

  // Code review actions
  setOpenFile(file: FileContent | null) {
    this.state.openFile = file;
    this.notify();
  }

  highlightLines(lines: number[]) {
    if (this.state.openFile) {
      if (!this.state.openFile.highlightedLines) {
        this.state.openFile.highlightedLines = new Set();
      }
      lines.forEach(line => this.state.openFile!.highlightedLines!.add(line));
      this.notify();
    }
  }

  clearHighlights() {
    if (this.state.openFile) {
      this.state.openFile.highlightedLines?.clear();
      this.notify();
    }
  }

  setSelectedRange(range: [number, number] | undefined) {
    if (this.state.openFile) {
      this.state.openFile.selectedRange = range;
      this.notify();
    }
  }

  // Comment actions
  addComment(comment: Omit<CodeComment, 'id' | 'createdAt'>) {
    const newComment: CodeComment = {
      ...comment,
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString()
    };
    this.state.comments.push(newComment);
    this.notify();
    return newComment;
  }

  updateComment(commentId: string, updates: Partial<CodeComment>) {
    const index = this.state.comments.findIndex(c => c.id === commentId);
    if (index > -1) {
      this.state.comments[index] = { ...this.state.comments[index], ...updates };
      this.notify();
    }
  }

  deleteComment(commentId: string) {
    this.state.comments = this.state.comments.filter(c => c.id !== commentId);
    this.notify();
  }

  getCommentsForFile(filePath: string): CodeComment[] {
    return this.state.comments.filter(c => c.file === filePath);
  }

  // UI panel actions
  setPanelVisible(panel: 'left' | 'right' | 'bottom', visible: boolean) {
    switch (panel) {
      case 'left':
        this.state.leftPanelVisible = visible;
        break;
      case 'right':
        this.state.rightPanelVisible = visible;
        break;
      case 'bottom':
        this.state.bottomPanelVisible = visible;
        break;
    }
    this.notify();
  }

  // Helper methods
  private dimUnrelatedNodes(filePath: string) {
    if (!this.state.diagram) return;
    
    // Find nodes related to the selected file
    const relatedNodes = this.state.diagram.nodes.filter(node => 
      node.file === filePath
    );
    const relatedNodeIds = new Set(relatedNodes.map(n => n.id));
    
    // Get connected nodes
    this.state.diagram.edges.forEach(edge => {
      if (relatedNodeIds.has(edge.source)) {
        relatedNodeIds.add(edge.target);
      }
      if (relatedNodeIds.has(edge.target)) {
        relatedNodeIds.add(edge.source);
      }
    });
    
    // Dim all other nodes
    const nodesToDim = this.state.diagram.nodes
      .filter(node => !relatedNodeIds.has(node.id))
      .map(node => node.id);
    
    this.dimNodes(nodesToDim);
  }

  // Export comments
  exportComments(format: 'json' | 'csv' | 'markdown'): string {
    const comments = this.state.comments;
    
    switch (format) {
      case 'json':
        return JSON.stringify({
          comments,
          exportedAt: new Date().toISOString(),
          totalCount: comments.length
        }, null, 2);
        
      case 'csv':
        const csvHeader = 'File,Line,Text,Created At\n';
        const csvRows = comments.map(c => 
          `"${c.file}",${c.line},"${c.text.replace(/"/g, '""')}","${c.createdAt}"`
        ).join('\n');
        return csvHeader + csvRows;
        
      case 'markdown':
        let md = '# Code Review Comments\n\n';
        md += `Generated: ${new Date().toISOString()}\n`;
        md += `Total Comments: ${comments.length}\n\n`;
        
        const fileGroups = comments.reduce((groups, comment) => {
          if (!groups[comment.file]) {
            groups[comment.file] = [];
          }
          groups[comment.file].push(comment);
          return groups;
        }, {} as Record<string, CodeComment[]>);
        
        Object.entries(fileGroups).forEach(([file, fileComments]) => {
          md += `## ${file}\n\n`;
          fileComments.forEach(comment => {
            md += `### Line ${comment.line}\n`;
            md += `${comment.text}\n`;
            md += `*${comment.createdAt}*\n\n`;
          });
        });
        
        return md;
        
      default:
        return '';
    }
  }
}

export const store = new Store();