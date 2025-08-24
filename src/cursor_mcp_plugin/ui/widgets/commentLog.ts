import { store } from '../store/store';
import { wsClient } from '../utils/websocket';
import { CodeComment } from '../store/types';

export class CommentLogWidget {
  private container: HTMLElement;
  private unsubscribe: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.initialize();
  }

  private initialize() {
    this.container.className = 'comment-log-widget';
    this.container.innerHTML = `
      <div class="comment-log-header">
        <h3>Comments (<span id="comment-count">0</span>)</h3>
        <div class="comment-log-actions">
          <button id="clear-comments" class="icon-button" title="Clear All Comments">
            🗑️
          </button>
          <div class="export-dropdown">
            <button id="export-comments" class="icon-button" title="Export Comments">
              📤
            </button>
            <div class="export-menu">
              <button data-format="json">Export JSON</button>
              <button data-format="csv">Export CSV</button>
              <button data-format="markdown">Export Markdown</button>
            </div>
          </div>
        </div>
      </div>
      <div class="comment-list" id="comment-list">
        <div class="empty-state">No comments yet</div>
      </div>
    `;

    this.setupEventListeners();
    this.subscribeToStore();
  }

  private setupEventListeners() {
    // Clear comments button
    const clearBtn = this.container.querySelector('#clear-comments') as HTMLButtonElement;
    clearBtn?.addEventListener('click', () => {
      this.clearAllComments();
    });

    // Export dropdown
    const exportBtn = this.container.querySelector('#export-comments') as HTMLButtonElement;
    const exportMenu = this.container.querySelector('.export-menu') as HTMLElement;
    
    exportBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle('visible');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      exportMenu.classList.remove('visible');
    });

    // Export format buttons
    exportMenu?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const format = target.getAttribute('data-format') as 'json' | 'csv' | 'markdown';
      if (format) {
        this.exportComments(format);
        exportMenu.classList.remove('visible');
      }
    });
  }

  private subscribeToStore() {
    this.unsubscribe = store.subscribe((state) => {
      this.renderComments(state.comments);
      this.updateCommentCount(state.comments.length);
    });
  }

  private renderComments(comments: CodeComment[]) {
    const listContainer = this.container.querySelector('#comment-list') as HTMLElement;
    
    if (comments.length === 0) {
      listContainer.innerHTML = '<div class="empty-state">No comments yet</div>';
      return;
    }

    // Sort comments by file and line
    const sortedComments = [...comments].sort((a, b) => {
      if (a.file !== b.file) {
        return a.file.localeCompare(b.file);
      }
      return a.line - b.line;
    });

    listContainer.innerHTML = '';
    
    let currentFile = '';
    sortedComments.forEach(comment => {
      // Add file separator if needed
      if (comment.file !== currentFile) {
        currentFile = comment.file;
        const fileSeparator = this.createFileSeparator(currentFile);
        listContainer.appendChild(fileSeparator);
      }

      const commentElement = this.createCommentElement(comment);
      listContainer.appendChild(commentElement);
    });
  }

  private createFileSeparator(filePath: string): HTMLElement {
    const separator = document.createElement('div');
    separator.className = 'file-separator';
    
    const fileName = filePath.split('/').pop() || filePath;
    const filePathSpan = document.createElement('span');
    filePathSpan.className = 'file-path';
    filePathSpan.textContent = fileName;
    filePathSpan.title = filePath;
    
    separator.appendChild(filePathSpan);
    return separator;
  }

  private createCommentElement(comment: CodeComment): HTMLElement {
    const commentElement = document.createElement('div');
    commentElement.className = 'comment-item';
    commentElement.setAttribute('data-comment-id', comment.id);

    const header = document.createElement('div');
    header.className = 'comment-header';

    const lineInfo = document.createElement('span');
    lineInfo.className = 'line-info';
    
    if (comment.range) {
      lineInfo.textContent = `Lines ${comment.range[0]}-${comment.range[1]}`;
    } else {
      lineInfo.textContent = `Line ${comment.line}`;
    }

    const timestamp = document.createElement('span');
    timestamp.className = 'comment-timestamp';
    timestamp.textContent = this.formatTimestamp(comment.createdAt);

    const actions = document.createElement('div');
    actions.className = 'comment-actions';

    const gotoButton = document.createElement('button');
    gotoButton.className = 'goto-button';
    gotoButton.textContent = '→';
    gotoButton.title = 'Go to code';
    gotoButton.addEventListener('click', () => {
      this.goToComment(comment);
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button';
    deleteButton.textContent = '×';
    deleteButton.title = 'Delete comment';
    deleteButton.addEventListener('click', () => {
      this.deleteComment(comment.id);
    });

    actions.appendChild(gotoButton);
    actions.appendChild(deleteButton);

    header.appendChild(lineInfo);
    header.appendChild(timestamp);
    header.appendChild(actions);

    const content = document.createElement('div');
    content.className = 'comment-content';
    content.textContent = comment.text;

    // Make content editable on double-click
    content.addEventListener('dblclick', () => {
      this.makeCommentEditable(comment.id, content);
    });

    commentElement.appendChild(header);
    commentElement.appendChild(content);

    return commentElement;
  }

  private formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffMinutes < 1) return 'now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  private goToComment(comment: CodeComment) {
    // Select the file in directory and open it
    store.selectFile(comment.file);
    wsClient.openFile(comment.file, comment.line);

    // Highlight the comment line(s)
    if (comment.range) {
      const lines = [];
      for (let i = comment.range[0]; i <= comment.range[1]; i++) {
        lines.push(i);
      }
      store.highlightLines(lines);
      store.setSelectedRange(comment.range);
    } else {
      store.highlightLines([comment.line]);
    }

    console.log('Navigating to comment:', comment);
  }

  private deleteComment(commentId: string) {
    if (confirm('Are you sure you want to delete this comment?')) {
      store.deleteComment(commentId);
      console.log('Comment deleted:', commentId);
    }
  }

  private makeCommentEditable(commentId: string, contentElement: HTMLElement) {
    const currentText = contentElement.textContent || '';
    
    const textarea = document.createElement('textarea');
    textarea.className = 'comment-edit-textarea';
    textarea.value = currentText;
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-edit-btn';
    saveBtn.textContent = '✓';
    saveBtn.title = 'Save changes';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cancel-edit-btn';
    cancelBtn.textContent = '×';
    cancelBtn.title = 'Cancel editing';

    const editControls = document.createElement('div');
    editControls.className = 'edit-controls';
    editControls.appendChild(saveBtn);
    editControls.appendChild(cancelBtn);

    // Replace content with edit interface
    contentElement.innerHTML = '';
    contentElement.appendChild(textarea);
    contentElement.appendChild(editControls);
    
    textarea.focus();
    textarea.select();

    const saveEdit = () => {
      const newText = textarea.value.trim();
      if (newText && newText !== currentText) {
        store.updateComment(commentId, { text: newText });
      }
      contentElement.textContent = newText || currentText;
    };

    const cancelEdit = () => {
      contentElement.textContent = currentText;
    };

    saveBtn.addEventListener('click', saveEdit);
    cancelBtn.addEventListener('click', cancelEdit);
    
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    });
  }

  private clearAllComments() {
    if (confirm('Are you sure you want to clear all comments?')) {
      const comments = store.getState().comments;
      comments.forEach(comment => {
        store.deleteComment(comment.id);
      });
      console.log('All comments cleared');
    }
  }

  private updateCommentCount(count: number) {
    const countElement = this.container.querySelector('#comment-count');
    if (countElement) {
      countElement.textContent = count.toString();
    }
  }

  private exportComments(format: 'json' | 'csv' | 'markdown') {
    const exportData = store.exportComments(format);
    
    // Create blob and download
    const blob = new Blob([exportData], { 
      type: this.getMimeType(format) 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code-review-comments.${format}`;
    a.click();
    
    URL.revokeObjectURL(url);

    // Also send export request via WebSocket
    wsClient.exportComments(format);
    
    console.log(`Comments exported as ${format}`);
  }

  private getMimeType(format: string): string {
    switch (format) {
      case 'json': return 'application/json';
      case 'csv': return 'text/csv';
      case 'markdown': return 'text/markdown';
      default: return 'text/plain';
    }
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

// CSS styles
export const commentLogWidgetStyles = `
  .comment-log-widget {
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

  .comment-log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #3d3d3d;
    border-bottom: 1px solid #555;
  }

  .comment-log-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
  }

  .comment-log-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .export-dropdown {
    position: relative;
  }

  .export-menu {
    position: absolute;
    top: 100%;
    right: 0;
    background: #2d2d2d;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 4px 0;
    min-width: 120px;
    z-index: 100;
    display: none;
  }

  .export-menu.visible {
    display: block;
  }

  .export-menu button {
    display: block;
    width: 100%;
    padding: 6px 12px;
    text-align: left;
    background: none;
    border: none;
    color: #e0e0e0;
    cursor: pointer;
    font-size: 13px;
  }

  .export-menu button:hover {
    background: #4d4d4d;
  }

  .comment-list {
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

  .file-separator {
    padding: 8px 12px;
    background: #404040;
    border-bottom: 1px solid #555;
    font-size: 12px;
    font-weight: 600;
    color: #18a0fb;
  }

  .comment-item {
    padding: 12px;
    border-bottom: 1px solid #404040;
    transition: background-color 0.15s;
  }

  .comment-item:hover {
    background: #3d3d3d;
  }

  .comment-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
    font-size: 12px;
  }

  .line-info {
    color: #18a0fb;
    font-weight: 500;
  }

  .comment-timestamp {
    color: #888;
  }

  .comment-actions {
    display: flex;
    gap: 4px;
  }

  .comment-actions button {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 2px;
    font-size: 14px;
  }

  .comment-actions button:hover {
    background: #4d4d4d;
    color: #e0e0e0;
  }

  .goto-button:hover {
    color: #18a0fb;
  }

  .delete-button:hover {
    color: #f44336;
  }

  .comment-content {
    color: #e0e0e0;
    line-height: 1.4;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
  }

  .comment-content:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .comment-edit-textarea {
    width: 100%;
    min-height: 60px;
    background: #1e1e1e;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 6px;
    color: #e0e0e0;
    font-family: inherit;
    font-size: inherit;
    resize: vertical;
  }

  .comment-edit-textarea:focus {
    outline: none;
    border-color: #18a0fb;
  }

  .edit-controls {
    display: flex;
    gap: 4px;
    margin-top: 6px;
    justify-content: flex-end;
  }

  .edit-controls button {
    padding: 4px 8px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }

  .save-edit-btn {
    background: #18a0fb;
    color: white;
  }

  .cancel-edit-btn {
    background: #666;
    color: white;
  }

  .edit-controls button:hover {
    opacity: 0.8;
  }
`;