import { store } from '../store/store';
import { wsClient } from '../utils/websocket';
import { FileContent } from '../store/types';

export class CodeReviewWidget {
  private container: HTMLElement;
  private unsubscribe: (() => void) | null = null;
  private selectedRange: [number, number] | null = null;
  private commentModal: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.initialize();
  }

  private initialize() {
    this.container.className = 'code-review-widget';
    this.container.innerHTML = `
      <div class="code-review-header">
        <h3>Code Review</h3>
        <div class="code-review-actions">
          <button id="clear-highlights" class="icon-button" title="Clear Highlights">
            ✨
          </button>
          <button id="add-comment" class="icon-button" title="Add Comment" disabled>
            💬
          </button>
        </div>
      </div>
      <div class="code-content" id="code-content">
        <div class="empty-state">Select a file from the directory tree</div>
      </div>
    `;

    this.setupEventListeners();
    this.subscribeToStore();
    this.createCommentModal();
  }

  private setupEventListeners() {
    // Clear highlights button
    const clearBtn = this.container.querySelector('#clear-highlights') as HTMLButtonElement;
    clearBtn?.addEventListener('click', () => {
      store.clearHighlights();
      this.clearSelection();
    });

    // Add comment button
    const commentBtn = this.container.querySelector('#add-comment') as HTMLButtonElement;
    commentBtn?.addEventListener('click', () => {
      this.showCommentModal();
    });
  }

  private subscribeToStore() {
    this.unsubscribe = store.subscribe((state) => {
      this.renderCodeContent(state.openFile);
      this.updateCommentButton();
    });
  }

  private renderCodeContent(fileContent: FileContent | null) {
    const contentContainer = this.container.querySelector('#code-content') as HTMLElement;
    
    if (!fileContent) {
      contentContainer.innerHTML = '<div class="empty-state">Select a file from the directory tree</div>';
      return;
    }

    // Create file header
    const fileHeader = document.createElement('div');
    fileHeader.className = 'file-header';
    fileHeader.innerHTML = `
      <span class="file-path">${fileContent.path}</span>
      <span class="file-info">${fileContent.content.split('\\n').length} lines</span>
    `;

    // Create code container
    const codeContainer = document.createElement('div');
    codeContainer.className = 'code-container';

    // Split content into lines and render
    const lines = fileContent.content.split('\\n');
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const lineElement = this.createLineElement(lineNumber, line, fileContent);
      codeContainer.appendChild(lineElement);
    });

    contentContainer.innerHTML = '';
    contentContainer.appendChild(fileHeader);
    contentContainer.appendChild(codeContainer);

    // Setup selection handling
    this.setupSelectionHandling(codeContainer);
  }

  private createLineElement(lineNumber: number, content: string, fileContent: FileContent): HTMLElement {
    const lineElement = document.createElement('div');
    lineElement.className = 'code-line';
    lineElement.setAttribute('data-line', lineNumber.toString());

    // Check if line should be highlighted
    const isHighlighted = fileContent.highlightedLines?.has(lineNumber);
    const isInSelectedRange = this.isLineInSelectedRange(lineNumber, fileContent.selectedRange);
    
    if (isHighlighted) {
      lineElement.classList.add('highlighted');
    }
    if (isInSelectedRange) {
      lineElement.classList.add('selected');
    }

    // Line number
    const lineNumberElement = document.createElement('span');
    lineNumberElement.className = 'line-number';
    lineNumberElement.textContent = lineNumber.toString();

    // Line content
    const lineContentElement = document.createElement('span');
    lineContentElement.className = 'line-content';
    lineContentElement.textContent = content || ' '; // Empty line fallback

    lineElement.appendChild(lineNumberElement);
    lineElement.appendChild(lineContentElement);

    // Click handler for line selection
    lineElement.addEventListener('click', (e) => {
      this.handleLineClick(lineNumber, e);
    });

    return lineElement;
  }

  private setupSelectionHandling(container: HTMLElement) {
    let startLine: number | null = null;
    let isSelecting = false;

    container.addEventListener('mousedown', (e) => {
      const lineElement = (e.target as HTMLElement).closest('.code-line');
      if (lineElement) {
        startLine = parseInt(lineElement.getAttribute('data-line') || '0');
        isSelecting = true;
        this.clearSelection();
      }
    });

    container.addEventListener('mousemove', (e) => {
      if (!isSelecting || startLine === null) return;

      const lineElement = (e.target as HTMLElement).closest('.code-line');
      if (lineElement) {
        const currentLine = parseInt(lineElement.getAttribute('data-line') || '0');
        const start = Math.min(startLine, currentLine);
        const end = Math.max(startLine, currentLine);
        this.updateSelection([start, end]);
      }
    });

    container.addEventListener('mouseup', (e) => {
      if (isSelecting && startLine !== null) {
        const lineElement = (e.target as HTMLElement).closest('.code-line');
        if (lineElement) {
          const currentLine = parseInt(lineElement.getAttribute('data-line') || '0');
          const start = Math.min(startLine, currentLine);
          const end = Math.max(startLine, currentLine);
          this.finalizeSelection([start, end]);
        }
      }
      isSelecting = false;
      startLine = null;
    });
  }

  private handleLineClick(lineNumber: number, event: MouseEvent) {
    if (event.ctrlKey || event.metaKey) {
      // Toggle highlight for single line
      const state = store.getState();
      if (state.openFile?.highlightedLines?.has(lineNumber)) {
        // Remove highlight (would need a store method for this)
        console.log('Remove highlight for line', lineNumber);
      } else {
        store.highlightLines([lineNumber]);
      }
    }
  }

  private updateSelection(range: [number, number]) {
    this.selectedRange = range;
    
    // Update visual selection
    this.container.querySelectorAll('.code-line').forEach(line => {
      const lineNumber = parseInt(line.getAttribute('data-line') || '0');
      if (lineNumber >= range[0] && lineNumber <= range[1]) {
        line.classList.add('selecting');
      } else {
        line.classList.remove('selecting');
      }
    });
  }

  private finalizeSelection(range: [number, number]) {
    this.selectedRange = range;
    store.setSelectedRange(range);
    
    // Clear selecting class and add selected
    this.container.querySelectorAll('.code-line').forEach(line => {
      line.classList.remove('selecting');
      const lineNumber = parseInt(line.getAttribute('data-line') || '0');
      if (lineNumber >= range[0] && lineNumber <= range[1]) {
        line.classList.add('selected');
      }
    });

    // Enable comment button
    this.updateCommentButton();

    // Notify via WebSocket
    const state = store.getState();
    if (state.openFile) {
      wsClient.highlightCode(state.openFile.path, range);
    }
  }

  private clearSelection() {
    this.selectedRange = null;
    store.setSelectedRange(undefined);
    
    this.container.querySelectorAll('.code-line').forEach(line => {
      line.classList.remove('selected', 'selecting');
    });

    this.updateCommentButton();
  }

  private updateCommentButton() {
    const commentBtn = this.container.querySelector('#add-comment') as HTMLButtonElement;
    const hasSelection = this.selectedRange !== null;
    const hasOpenFile = store.getState().openFile !== null;
    
    commentBtn.disabled = !hasSelection && !hasOpenFile;
  }

  private isLineInSelectedRange(lineNumber: number, range?: [number, number]): boolean {
    if (!range) return false;
    return lineNumber >= range[0] && lineNumber <= range[1];
  }

  private createCommentModal() {
    this.commentModal = document.createElement('div');
    this.commentModal.className = 'comment-modal';
    this.commentModal.innerHTML = `
      <div class="comment-modal-backdrop"></div>
      <div class="comment-modal-content">
        <h4>Add Comment</h4>
        <textarea id="comment-text" placeholder="Enter your comment..."></textarea>
        <div class="comment-modal-actions">
          <button id="cancel-comment" class="secondary">Cancel</button>
          <button id="save-comment" class="primary">Save Comment</button>
        </div>
      </div>
    `;

    // Setup modal event listeners
    const backdrop = this.commentModal.querySelector('.comment-modal-backdrop');
    const cancelBtn = this.commentModal.querySelector('#cancel-comment');
    const saveBtn = this.commentModal.querySelector('#save-comment');
    const textarea = this.commentModal.querySelector('#comment-text') as HTMLTextAreaElement;

    [backdrop, cancelBtn].forEach(element => {
      element?.addEventListener('click', () => this.hideCommentModal());
    });

    saveBtn?.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (text) {
        this.saveComment(text);
        this.hideCommentModal();
      }
    });

    // ESC key to close
    this.commentModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideCommentModal();
      }
    });

    document.body.appendChild(this.commentModal);
  }

  private showCommentModal() {
    if (!this.commentModal) return;

    const state = store.getState();
    const range = this.selectedRange;
    const file = state.openFile;

    if (!file) return;

    // Set modal info
    const modal = this.commentModal.querySelector('.comment-modal-content');
    const title = modal?.querySelector('h4');
    if (title) {
      if (range) {
        title.textContent = `Add Comment (Lines ${range[0]}-${range[1]})`;
      } else {
        title.textContent = 'Add Comment';
      }
    }

    // Clear and focus textarea
    const textarea = this.commentModal.querySelector('#comment-text') as HTMLTextAreaElement;
    textarea.value = '';
    
    this.commentModal.classList.add('visible');
    setTimeout(() => textarea.focus(), 100);
  }

  private hideCommentModal() {
    if (!this.commentModal) return;
    this.commentModal.classList.remove('visible');
  }

  private saveComment(text: string) {
    const state = store.getState();
    const file = state.openFile;
    const range = this.selectedRange;

    if (!file) return;

    const line = range ? range[0] : 1;
    const comment = store.addComment({
      file: file.path,
      line,
      text,
      range: range || undefined
    });

    // Highlight the commented lines
    if (range) {
      const linesToHighlight = [];
      for (let i = range[0]; i <= range[1]; i++) {
        linesToHighlight.push(i);
      }
      store.highlightLines(linesToHighlight);
    } else {
      store.highlightLines([line]);
    }

    // Send to WebSocket
    wsClient.upsertComment(file.path, line, text, comment.id);

    console.log('Comment saved:', comment);
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    if (this.commentModal) {
      this.commentModal.remove();
    }
  }
}

// CSS styles
export const codeReviewWidgetStyles = `
  .code-review-widget {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1e1e1e;
    color: #e0e0e0;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 13px;
    border-radius: 8px;
    overflow: hidden;
  }

  .code-review-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #2d2d2d;
    border-bottom: 1px solid #555;
  }

  .code-review-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .code-review-actions {
    display: flex;
    gap: 4px;
  }

  .code-content {
    flex: 1;
    overflow: auto;
  }

  .file-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #2d2d2d;
    border-bottom: 1px solid #404040;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 12px;
  }

  .file-path {
    color: #18a0fb;
    font-weight: 500;
  }

  .file-info {
    color: #888;
  }

  .code-container {
    background: #1e1e1e;
  }

  .code-line {
    display: flex;
    line-height: 1.5;
    cursor: pointer;
    border-left: 3px solid transparent;
  }

  .code-line:hover {
    background: #2d2d2d;
  }

  .code-line.highlighted {
    background: #3d5016;
    border-left-color: #7cb342;
  }

  .code-line.selected {
    background: #264f78;
    border-left-color: #18a0fb;
  }

  .code-line.selecting {
    background: #264f78;
    border-left-color: #18a0fb;
  }

  .line-number {
    display: inline-block;
    width: 40px;
    padding: 0 8px;
    text-align: right;
    color: #6e7681;
    background: #262626;
    user-select: none;
    flex-shrink: 0;
  }

  .line-content {
    padding: 0 12px;
    white-space: pre;
    flex: 1;
    min-width: 0;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #888;
    font-style: italic;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  /* Comment Modal */
  .comment-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1000;
    display: none;
  }

  .comment-modal.visible {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .comment-modal-backdrop {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    cursor: pointer;
  }

  .comment-modal-content {
    position: relative;
    background: #2d2d2d;
    border-radius: 8px;
    padding: 20px;
    max-width: 400px;
    width: 90%;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .comment-modal-content h4 {
    margin: 0 0 12px 0;
    font-size: 16px;
    color: #fff;
  }

  .comment-modal-content textarea {
    width: 100%;
    height: 80px;
    background: #1e1e1e;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 8px;
    color: #e0e0e0;
    font-family: inherit;
    resize: vertical;
    margin-bottom: 16px;
  }

  .comment-modal-content textarea:focus {
    outline: none;
    border-color: #18a0fb;
  }

  .comment-modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .comment-modal-actions button {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }

  .comment-modal-actions button.primary {
    background: #18a0fb;
    color: white;
  }

  .comment-modal-actions button.secondary {
    background: #3d3d3d;
    color: #e0e0e0;
  }

  .comment-modal-actions button:hover.primary {
    background: #0d8ee0;
  }

  .comment-modal-actions button:hover.secondary {
    background: #4d4d4d;
  }
`;