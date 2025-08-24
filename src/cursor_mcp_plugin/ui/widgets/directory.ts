import { store } from '../store/store';
import { wsClient } from '../utils/websocket';
import { DirNode } from '../store/types';

export class DirectoryWidget {
  private container: HTMLElement;
  private unsubscribe: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.initialize();
  }

  private initialize() {
    this.container.className = 'directory-widget';
    this.container.innerHTML = `
      <div class="directory-header">
        <h3>Directory</h3>
        <div class="directory-actions">
          <button id="refresh-dir" class="icon-button" title="Refresh Directory">
            🔄
          </button>
          <button id="collapse-all" class="icon-button" title="Collapse All">
            📁
          </button>
        </div>
      </div>
      <div class="directory-tree" id="directory-tree">
        <div class="empty-state">No directory loaded</div>
      </div>
    `;

    this.setupEventListeners();
    this.subscribeToStore();
  }

  private setupEventListeners() {
    // Refresh button
    const refreshBtn = this.container.querySelector('#refresh-dir') as HTMLButtonElement;
    refreshBtn?.addEventListener('click', () => {
      // In a real implementation, this would trigger a directory refresh
      console.log('Directory refresh requested');
    });

    // Collapse all button
    const collapseBtn = this.container.querySelector('#collapse-all') as HTMLButtonElement;
    collapseBtn?.addEventListener('click', () => {
      this.collapseAllDirectories();
    });
  }

  private subscribeToStore() {
    this.unsubscribe = store.subscribe((state) => {
      this.renderDirectoryTree(state.directoryTree);
      this.updateSelectedFile(state.selectedFilePath);
    });
  }

  private renderDirectoryTree(tree: DirNode | null) {
    const treeContainer = this.container.querySelector('#directory-tree') as HTMLElement;
    
    if (!tree) {
      treeContainer.innerHTML = '<div class="empty-state">No directory loaded</div>';
      return;
    }

    treeContainer.innerHTML = '';
    this.renderNode(tree, treeContainer, 0);
  }

  private renderNode(node: DirNode, parent: HTMLElement, depth: number) {
    const nodeElement = document.createElement('div');
    nodeElement.className = 'directory-node';
    nodeElement.style.paddingLeft = `${depth * 16}px`;
    nodeElement.setAttribute('data-path', node.path);

    const isDirectory = node.kind === 'dir';
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = node.expanded !== false; // Default to expanded

    // Create node content
    const nodeContent = document.createElement('div');
    nodeContent.className = 'node-content';

    // Expand/collapse button for directories
    if (isDirectory && hasChildren) {
      const expandButton = document.createElement('span');
      expandButton.className = `expand-button ${isExpanded ? 'expanded' : 'collapsed'}`;
      expandButton.textContent = isExpanded ? '▼' : '▶';
      expandButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDirectory(node.path, !isExpanded);
      });
      nodeContent.appendChild(expandButton);
    } else {
      // Spacer for alignment
      const spacer = document.createElement('span');
      spacer.className = 'expand-spacer';
      nodeContent.appendChild(spacer);
    }

    // Icon
    const icon = document.createElement('span');
    icon.className = 'node-icon';
    icon.textContent = this.getNodeIcon(node);
    nodeContent.appendChild(icon);

    // Label
    const label = document.createElement('span');
    label.className = 'node-label';
    label.textContent = node.name;
    nodeContent.appendChild(label);

    nodeElement.appendChild(nodeContent);

    // Click handler for files
    if (!isDirectory) {
      nodeElement.addEventListener('click', () => {
        this.selectFile(node.path);
      });
      nodeElement.className += ' file-node';
    } else {
      nodeElement.className += ' directory-node';
    }

    parent.appendChild(nodeElement);

    // Render children if expanded
    if (isDirectory && hasChildren && isExpanded) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'node-children';
      
      node.children!.forEach(child => {
        this.renderNode(child, childrenContainer, depth + 1);
      });
      
      parent.appendChild(childrenContainer);
    }
  }

  private getNodeIcon(node: DirNode): string {
    if (node.kind === 'dir') {
      return node.expanded !== false ? '📂' : '📁';
    }
    
    // File icons based on extension
    const extension = node.name.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'ts':
      case 'tsx':
        return '📘';
      case 'js':
      case 'jsx':
        return '📒';
      case 'json':
        return '📋';
      case 'md':
        return '📝';
      case 'css':
      case 'scss':
        return '🎨';
      case 'html':
        return '🌐';
      default:
        return '📄';
    }
  }

  private selectFile(filePath: string) {
    store.selectFile(filePath);
    wsClient.openFile(filePath);
    
    // Add visual feedback
    this.updateSelectedFile(filePath);
  }

  private updateSelectedFile(selectedPath: string | null) {
    // Remove previous selection
    this.container.querySelectorAll('.node-selected').forEach(node => {
      node.classList.remove('node-selected');
    });

    // Add selection to current file
    if (selectedPath) {
      const selectedNode = this.container.querySelector(`[data-path="${selectedPath}"]`);
      selectedNode?.classList.add('node-selected');
    }
  }

  private toggleDirectory(path: string, expanded: boolean) {
    store.expandDirectory(path, expanded);
  }

  private collapseAllDirectories() {
    const state = store.getState();
    if (state.directoryTree) {
      this.collapseNodeRecursive(state.directoryTree);
    }
  }

  private collapseNodeRecursive(node: DirNode) {
    if (node.kind === 'dir') {
      store.expandDirectory(node.path, false);
    }
    if (node.children) {
      node.children.forEach(child => this.collapseNodeRecursive(child));
    }
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

// CSS styles (would normally be in a separate file)
export const directoryWidgetStyles = `
  .directory-widget {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #2d2d2d;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    border-radius: 8px;
    overflow: hidden;
  }

  .directory-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #3d3d3d;
    border-bottom: 1px solid #555;
  }

  .directory-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
  }

  .directory-actions {
    display: flex;
    gap: 4px;
  }

  .icon-button {
    background: none;
    border: none;
    color: #e0e0e0;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    font-size: 12px;
  }

  .icon-button:hover {
    background: #4d4d4d;
  }

  .directory-tree {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .empty-state {
    padding: 20px;
    text-align: center;
    color: #888;
    font-style: italic;
  }

  .directory-node {
    position: relative;
  }

  .node-content {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .file-node .node-content:hover {
    background: #4d4d4d;
  }

  .node-selected .node-content {
    background: #18a0fb !important;
    color: white;
  }

  .expand-button {
    width: 16px;
    text-align: center;
    cursor: pointer;
    font-size: 10px;
    margin-right: 4px;
  }

  .expand-spacer {
    width: 16px;
    margin-right: 4px;
  }

  .node-icon {
    margin-right: 6px;
    font-size: 12px;
  }

  .node-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .node-children {
    position: relative;
  }
`;