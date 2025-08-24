import { DirectoryWidget, directoryWidgetStyles } from './widgets/directory';
import { CodeReviewWidget, codeReviewWidgetStyles } from './widgets/codeReview';
import { CommentLogWidget, commentLogWidgetStyles } from './widgets/commentLog';
import { DiagramWidget, diagramWidgetStyles } from './widgets/diagram';
import { store } from './store/store';
import { wsClient } from './utils/websocket';

export class CodeReviewApp {
  private container: HTMLElement;
  private widgets: {
    directory?: DirectoryWidget;
    codeReview?: CodeReviewWidget;
    commentLog?: CommentLogWidget;
    diagram?: DiagramWidget;
  } = {};
  
  private isInitialized = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async initialize(serverUrl = 'ws://localhost:3055', channelName = 'code-review') {
    if (this.isInitialized) return;

    this.setupStyles();
    this.createLayout();
    this.createWidgets();
    
    // Connect to WebSocket
    try {
      await wsClient.connect(serverUrl, channelName);
      console.log('Connected to WebSocket server');
    } catch (error) {
      console.error('Failed to connect to WebSocket server:', error);
      this.showConnectionError();
    }
    
    this.isInitialized = true;
  }

  private setupStyles() {
    // Inject CSS styles
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      ${this.getBaseStyles()}
      ${directoryWidgetStyles}
      ${codeReviewWidgetStyles}
      ${commentLogWidgetStyles}
      ${diagramWidgetStyles}
    `;
    document.head.appendChild(styleElement);
  }

  private createLayout() {
    this.container.className = 'code-review-app';
    this.container.innerHTML = `
      <div class="app-header">
        <h2>Code Review Workspace</h2>
        <div class="connection-status" id="connection-status">
          <span class="status-indicator"></span>
          <span class="status-text">Connecting...</span>
        </div>
      </div>
      
      <div class="app-body">
        <!-- Left Panel: Directory Tree -->
        <div class="panel left-panel" id="left-panel">
          <div class="panel-header">
            <span>Directory</span>
            <button class="panel-toggle" data-panel="left">−</button>
          </div>
          <div class="panel-content" id="directory-container"></div>
        </div>
        
        <!-- Center: UML Diagram -->
        <div class="panel center-panel" id="center-panel">
          <div class="panel-content" id="diagram-container"></div>
        </div>
        
        <!-- Right Panel: Code Review -->
        <div class="panel right-panel" id="right-panel">
          <div class="panel-header">
            <span>Code Review</span>
            <button class="panel-toggle" data-panel="right">−</button>
          </div>
          <div class="panel-content" id="code-review-container"></div>
        </div>
      </div>
      
      <!-- Bottom Panel: Comments -->
      <div class="panel bottom-panel" id="bottom-panel">
        <div class="panel-header">
          <span>Comments</span>
          <button class="panel-toggle" data-panel="bottom">−</button>
        </div>
        <div class="panel-content" id="comment-log-container"></div>
      </div>
      
      <!-- Quick Actions Toolbar -->
      <div class="quick-actions">
        <button id="generate-uml-btn" class="action-btn primary">
          ⚙️ Generate UML
        </button>
        <button id="export-comments-btn" class="action-btn">
          📤 Export Comments
        </button>
        <button id="reset-layout-btn" class="action-btn">
          🔄 Reset Layout
        </button>
      </div>
    `;

    this.setupLayoutEventListeners();
  }

  private createWidgets() {
    // Create widget instances
    const directoryContainer = document.getElementById('directory-container')!;
    const codeReviewContainer = document.getElementById('code-review-container')!;
    const commentLogContainer = document.getElementById('comment-log-container')!;
    const diagramContainer = document.getElementById('diagram-container')!;

    this.widgets.directory = new DirectoryWidget(directoryContainer);
    this.widgets.codeReview = new CodeReviewWidget(codeReviewContainer);
    this.widgets.commentLog = new CommentLogWidget(commentLogContainer);
    this.widgets.diagram = new DiagramWidget(diagramContainer);
  }

  private setupLayoutEventListeners() {
    // Panel toggle buttons
    document.querySelectorAll('.panel-toggle').forEach(button => {
      button.addEventListener('click', (e) => {
        const panelName = (e.target as HTMLElement).getAttribute('data-panel');
        if (panelName) {
          this.togglePanel(panelName as 'left' | 'right' | 'bottom');
        }
      });
    });

    // Quick action buttons
    const generateBtn = document.getElementById('generate-uml-btn');
    generateBtn?.addEventListener('click', () => this.showGenerateDialog());

    const exportBtn = document.getElementById('export-comments-btn');
    exportBtn?.addEventListener('click', () => this.showExportDialog());

    const resetBtn = document.getElementById('reset-layout-btn');
    resetBtn?.addEventListener('click', () => this.resetLayout());

    // Connection status updates
    store.subscribe((state) => {
      this.updateConnectionStatus(state.isConnected, state.channelName);
    });
  }

  private togglePanel(panel: 'left' | 'right' | 'bottom') {
    const panelElement = document.getElementById(`${panel}-panel`);
    const button = document.querySelector(`[data-panel="${panel}"]`);
    
    if (panelElement && button) {
      const isVisible = !panelElement.classList.contains('collapsed');
      
      if (isVisible) {
        panelElement.classList.add('collapsed');
        button.textContent = '+';
      } else {
        panelElement.classList.remove('collapsed');
        button.textContent = '−';
      }
      
      store.setPanelVisible(panel, !isVisible);
    }
  }

  private updateConnectionStatus(isConnected: boolean, channelName: string | null) {
    const statusElement = document.getElementById('connection-status');
    if (!statusElement) return;

    const indicator = statusElement.querySelector('.status-indicator') as HTMLElement;
    const text = statusElement.querySelector('.status-text') as HTMLElement;

    if (isConnected) {
      indicator.className = 'status-indicator connected';
      text.textContent = `Connected to ${channelName || 'channel'}`;
    } else {
      indicator.className = 'status-indicator disconnected';
      text.textContent = 'Disconnected';
    }
  }

  private showConnectionError() {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'connection-error';
    errorDiv.innerHTML = `
      <h3>⚠️ Connection Failed</h3>
      <p>Could not connect to the WebSocket server at localhost:3055</p>
      <p>Make sure the server is running with: <code>bun socket</code></p>
      <button id="retry-connection">Retry Connection</button>
    `;

    this.container.appendChild(errorDiv);

    const retryBtn = document.getElementById('retry-connection');
    retryBtn?.addEventListener('click', async () => {
      try {
        await wsClient.connect('ws://localhost:3055', 'code-review');
        errorDiv.remove();
      } catch (error) {
        console.error('Retry connection failed:', error);
      }
    });
  }

  private showGenerateDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <h3>Generate UML Diagram</h3>
        <div class="form-group">
          <label for="root-path">Root Path:</label>
          <input type="text" id="root-path" placeholder="/path/to/your/project" value="/tmp/test-project" />
        </div>
        <div class="form-group">
          <label for="max-files">Max Files:</label>
          <input type="number" id="max-files" value="500" min="10" max="2000" />
        </div>
        <div class="modal-actions">
          <button id="cancel-generate" class="secondary">Cancel</button>
          <button id="confirm-generate" class="primary">Generate</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const rootPathInput = dialog.querySelector('#root-path') as HTMLInputElement;
    const maxFilesInput = dialog.querySelector('#max-files') as HTMLInputElement;
    const cancelBtn = dialog.querySelector('#cancel-generate');
    const confirmBtn = dialog.querySelector('#confirm-generate');
    const backdrop = dialog.querySelector('.modal-backdrop');

    const closeDialog = () => dialog.remove();

    [cancelBtn, backdrop].forEach(element => {
      element?.addEventListener('click', closeDialog);
    });

    confirmBtn?.addEventListener('click', () => {
      const rootPath = rootPathInput.value.trim();
      const maxFiles = parseInt(maxFilesInput.value) || 500;

      if (rootPath) {
        wsClient.generateUml(rootPath, maxFiles);
        closeDialog();
      }
    });

    // Focus the input
    setTimeout(() => rootPathInput.focus(), 100);
  }

  private showExportDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <h3>Export Comments</h3>
        <p>Choose export format:</p>
        <div class="export-options">
          <button class="export-option" data-format="json">
            📄 JSON
            <small>Machine-readable format</small>
          </button>
          <button class="export-option" data-format="csv">
            📊 CSV
            <small>Spreadsheet format</small>
          </button>
          <button class="export-option" data-format="markdown">
            📝 Markdown
            <small>Human-readable format</small>
          </button>
        </div>
        <div class="modal-actions">
          <button id="cancel-export" class="secondary">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const cancelBtn = dialog.querySelector('#cancel-export');
    const backdrop = dialog.querySelector('.modal-backdrop');
    const exportOptions = dialog.querySelectorAll('.export-option');

    const closeDialog = () => dialog.remove();

    [cancelBtn, backdrop].forEach(element => {
      element?.addEventListener('click', closeDialog);
    });

    exportOptions.forEach(option => {
      option.addEventListener('click', (e) => {
        const format = (e.target as HTMLElement).closest('.export-option')?.getAttribute('data-format');
        if (format) {
          wsClient.exportComments(format as 'json' | 'csv' | 'markdown');
          closeDialog();
        }
      });
    });
  }

  private resetLayout() {
    // Reset all panels to visible
    ['left', 'right', 'bottom'].forEach(panel => {
      const panelElement = document.getElementById(`${panel}-panel`);
      const button = document.querySelector(`[data-panel="${panel}"]`);
      
      panelElement?.classList.remove('collapsed');
      if (button) button.textContent = '−';
    });

    // Update store
    store.setPanelVisible('left', true);
    store.setPanelVisible('right', true);
    store.setPanelVisible('bottom', true);
  }

  private getBaseStyles(): string {
    return `
      .code-review-app {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: #1e1e1e;
        color: #e0e0e0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .app-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #2d2d2d;
        border-bottom: 1px solid #555;
        flex-shrink: 0;
      }

      .app-header h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #fff;
      }

      .connection-status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
      }

      .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #666;
      }

      .status-indicator.connected {
        background: #4ade80;
      }

      .status-indicator.disconnected {
        background: #ef4444;
      }

      .app-body {
        display: grid;
        grid-template-columns: 300px 1fr 350px;
        flex: 1;
        overflow: hidden;
      }

      .panel {
        display: flex;
        flex-direction: column;
        border-right: 1px solid #555;
        overflow: hidden;
        transition: all 0.3s ease;
      }

      .panel:last-child {
        border-right: none;
      }

      .panel.collapsed {
        grid-template-columns: 0;
        min-width: 0;
        max-width: 0;
        border-right: none;
      }

      .left-panel.collapsed ~ .center-panel {
        grid-column: 1 / 3;
      }

      .right-panel.collapsed {
        display: none;
      }

      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #3d3d3d;
        border-bottom: 1px solid #555;
        font-size: 12px;
        font-weight: 600;
        flex-shrink: 0;
      }

      .panel-toggle {
        background: none;
        border: none;
        color: #e0e0e0;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 2px;
        font-size: 14px;
      }

      .panel-toggle:hover {
        background: #4d4d4d;
      }

      .panel-content {
        flex: 1;
        overflow: hidden;
      }

      .bottom-panel {
        grid-column: 1 / -1;
        height: 250px;
        border-top: 1px solid #555;
        border-right: none;
      }

      .bottom-panel.collapsed {
        height: 32px;
      }

      .quick-actions {
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: flex;
        gap: 8px;
        z-index: 1000;
      }

      .action-btn {
        padding: 8px 12px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        background: #3d3d3d;
        color: #e0e0e0;
        transition: background-color 0.2s;
      }

      .action-btn:hover {
        background: #4d4d4d;
      }

      .action-btn.primary {
        background: #18a0fb;
        color: white;
      }

      .action-btn.primary:hover {
        background: #0d8ee0;
      }

      .connection-error {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #2d2d2d;
        border: 1px solid #ef4444;
        border-radius: 8px;
        padding: 24px;
        text-align: center;
        max-width: 400px;
      }

      .connection-error h3 {
        margin: 0 0 12px 0;
        color: #ef4444;
      }

      .connection-error code {
        background: #1e1e1e;
        padding: 2px 4px;
        border-radius: 3px;
        font-family: Monaco, monospace;
      }

      /* Modal Styles */
      .modal-dialog {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }

      .modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        cursor: pointer;
      }

      .modal-content {
        position: relative;
        background: #2d2d2d;
        border-radius: 8px;
        padding: 20px;
        max-width: 400px;
        width: 90%;
        color: #e0e0e0;
      }

      .modal-content h3 {
        margin: 0 0 16px 0;
        color: #fff;
      }

      .form-group {
        margin-bottom: 16px;
      }

      .form-group label {
        display: block;
        margin-bottom: 4px;
        font-size: 14px;
        font-weight: 500;
      }

      .form-group input {
        width: 100%;
        padding: 6px 8px;
        background: #1e1e1e;
        border: 1px solid #555;
        border-radius: 4px;
        color: #e0e0e0;
        font-size: 14px;
      }

      .form-group input:focus {
        outline: none;
        border-color: #18a0fb;
      }

      .export-options {
        display: grid;
        gap: 8px;
        margin-bottom: 16px;
      }

      .export-option {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px;
        background: #1e1e1e;
        border: 1px solid #555;
        border-radius: 6px;
        cursor: pointer;
        transition: background-color 0.2s;
        text-align: center;
      }

      .export-option:hover {
        background: #3d3d3d;
      }

      .export-option small {
        color: #888;
        font-size: 11px;
        margin-top: 2px;
      }

      .modal-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .modal-actions button {
        padding: 6px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      }

      .modal-actions button.primary {
        background: #18a0fb;
        color: white;
      }

      .modal-actions button.secondary {
        background: #3d3d3d;
        color: #e0e0e0;
      }

      .modal-actions button:hover {
        opacity: 0.8;
      }

      @media (max-width: 768px) {
        .app-body {
          grid-template-columns: 1fr;
          grid-template-rows: 300px 1fr;
        }
        
        .right-panel {
          display: none;
        }
        
        .quick-actions {
          bottom: 10px;
          right: 10px;
        }
      }
    `;
  }

  destroy() {
    // Clean up widgets
    Object.values(this.widgets).forEach(widget => widget?.destroy());
    
    // Disconnect WebSocket
    wsClient.disconnect();
    
    this.isInitialized = false;
  }
}

// Export for global access
(window as any).CodeReviewApp = CodeReviewApp;