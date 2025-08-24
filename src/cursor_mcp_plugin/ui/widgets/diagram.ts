import { store } from '../store/store';
import { wsClient } from '../utils/websocket';
import { UmlDiagram, UmlNode, UmlEdge } from '../store/types';

export class DiagramWidget {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private unsubscribe: (() => void) | null = null;
  
  private nodePositions = new Map<string, { x: number, y: number, width: number, height: number }>();
  private scale = 1;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  
  private nodeWidth = 180;
  private nodeHeight = 120;
  private nodeSpacing = 40;

  constructor(container: HTMLElement) {
    this.container = container;
    this.initialize();
  }

  private initialize() {
    this.container.className = 'diagram-widget';
    this.container.innerHTML = `
      <div class="diagram-header">
        <h3>UML Diagram</h3>
        <div class="diagram-controls">
          <button id="fit-diagram" class="icon-button" title="Fit to Screen">
            🔍
          </button>
          <button id="reset-zoom" class="icon-button" title="Reset Zoom">
            🎯
          </button>
          <button id="generate-uml" class="icon-button" title="Generate UML">
            ⚙️
          </button>
          <button id="toggle-legend" class="icon-button" title="Toggle Legend">
            ℹ️
          </button>
        </div>
      </div>
      <div class="diagram-container">
        <canvas id="diagram-canvas"></canvas>
        <div class="diagram-legend" id="diagram-legend">
          <h4>Legend</h4>
          <div class="legend-item">
            <div class="legend-color class"></div>
            <span>Class</span>
          </div>
          <div class="legend-item">
            <div class="legend-color interface"></div>
            <span>Interface</span>
          </div>
          <div class="legend-item">
            <div class="legend-color function"></div>
            <span>Function</span>
          </div>
          <div class="legend-item">
            <div class="legend-color module"></div>
            <span>Module</span>
          </div>
          <div class="legend-item">
            <div class="legend-color type"></div>
            <span>Type</span>
          </div>
          <div class="legend-item">
            <div class="legend-color enum"></div>
            <span>Enum</span>
          </div>
        </div>
      </div>
    `;

    this.setupCanvas();
    this.setupEventListeners();
    this.subscribeToStore();
  }

  private setupCanvas() {
    this.canvas = this.container.querySelector('#diagram-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas() {
    const container = this.canvas.parentElement!;
    const rect = container.getBoundingClientRect();
    
    this.canvas.width = rect.width * devicePixelRatio;
    this.canvas.height = rect.height * devicePixelRatio;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    
    this.ctx.scale(devicePixelRatio, devicePixelRatio);
    this.redraw();
  }

  private setupEventListeners() {
    // Control buttons
    const fitBtn = this.container.querySelector('#fit-diagram') as HTMLButtonElement;
    fitBtn?.addEventListener('click', () => this.fitToScreen());

    const resetBtn = this.container.querySelector('#reset-zoom') as HTMLButtonElement;
    resetBtn?.addEventListener('click', () => this.resetZoom());

    const generateBtn = this.container.querySelector('#generate-uml') as HTMLButtonElement;
    generateBtn?.addEventListener('click', () => this.showGenerateDialog());

    const legendBtn = this.container.querySelector('#toggle-legend') as HTMLButtonElement;
    const legend = this.container.querySelector('#diagram-legend') as HTMLElement;
    legendBtn?.addEventListener('click', () => {
      legend.classList.toggle('visible');
    });

    // Canvas interaction
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
  }

  private subscribeToStore() {
    this.unsubscribe = store.subscribe((state) => {
      this.updateDiagram(state.diagram);
      this.updateSelection(state.selectedNodeIds, state.dimmedNodeIds);
    });
  }

  private updateDiagram(diagram: UmlDiagram | null) {
    if (diagram) {
      this.calculateNodePositions(diagram);
    }
    this.redraw();
  }

  private updateSelection(selectedIds: Set<string>, dimmedIds: Set<string>) {
    this.redraw();
  }

  private calculateNodePositions(diagram: UmlDiagram) {
    this.nodePositions.clear();
    
    // Simple grid layout
    const cols = Math.ceil(Math.sqrt(diagram.nodes.length));
    const rows = Math.ceil(diagram.nodes.length / cols);
    
    diagram.nodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      const x = col * (this.nodeWidth + this.nodeSpacing) + this.nodeSpacing;
      const y = row * (this.nodeHeight + this.nodeSpacing) + this.nodeSpacing;
      
      this.nodePositions.set(node.id, {
        x,
        y,
        width: this.nodeWidth,
        height: this.nodeHeight
      });
    });
  }

  private redraw() {
    const state = store.getState();
    if (!state.diagram) {
      this.drawEmptyState();
      return;
    }

    // Clear canvas
    const canvasWidth = this.canvas.width / devicePixelRatio;
    const canvasHeight = this.canvas.height / devicePixelRatio;
    this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Apply transformations
    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.scale, this.scale);

    // Draw edges first
    this.drawEdges(state.diagram.edges, state.selectedNodeIds, state.dimmedNodeIds);
    
    // Draw nodes
    this.drawNodes(state.diagram.nodes, state.selectedNodeIds, state.dimmedNodeIds);

    this.ctx.restore();
  }

  private drawEmptyState() {
    const canvasWidth = this.canvas.width / devicePixelRatio;
    const canvasHeight = this.canvas.height / devicePixelRatio;
    
    this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    this.ctx.fillStyle = '#888';
    this.ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('No UML diagram loaded', canvasWidth / 2, canvasHeight / 2);
    this.ctx.fillText('Click Generate UML to create one', canvasWidth / 2, canvasHeight / 2 + 25);
  }

  private drawNodes(nodes: UmlNode[], selectedIds: Set<string>, dimmedIds: Set<string>) {
    nodes.forEach(node => {
      const pos = this.nodePositions.get(node.id);
      if (!pos) return;

      const isSelected = selectedIds.has(node.id);
      const isDimmed = dimmedIds.has(node.id);
      
      this.drawNode(node, pos, isSelected, isDimmed);
    });
  }

  private drawNode(node: UmlNode, pos: { x: number, y: number, width: number, height: number }, isSelected: boolean, isDimmed: boolean) {
    const { x, y, width, height } = pos;
    
    // Node background
    this.ctx.fillStyle = this.getNodeColor(node.kind, isDimmed);
    if (isDimmed) {
      this.ctx.globalAlpha = 0.3;
    }
    
    this.ctx.fillRect(x, y, width, height);
    
    // Node border
    this.ctx.strokeStyle = isSelected ? '#18a0fb' : '#555';
    this.ctx.lineWidth = isSelected ? 3 : 1;
    this.ctx.strokeRect(x, y, width, height);
    
    // Node label
    this.ctx.fillStyle = isDimmed ? '#666' : '#fff';
    this.ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(node.label, x + width / 2, y + 20);
    
    // Node kind
    this.ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    this.ctx.fillStyle = isDimmed ? '#555' : '#ccc';
    this.ctx.fillText(node.kind, x + width / 2, y + 35);
    
    // Properties and methods
    let lineY = y + 50;
    const lineHeight = 14;
    const maxLines = Math.floor((height - 55) / lineHeight);
    let lineCount = 0;
    
    this.ctx.textAlign = 'left';
    this.ctx.font = '11px Monaco, Menlo, "Ubuntu Mono", monospace';
    
    // Properties
    if (node.properties && lineCount < maxLines) {
      const propsToShow = node.properties.slice(0, maxLines - lineCount);
      propsToShow.forEach(prop => {
        if (lineCount >= maxLines) return;
        this.ctx.fillText(prop, x + 8, lineY);
        lineY += lineHeight;
        lineCount++;
      });
    }
    
    // Methods
    if (node.methods && lineCount < maxLines) {
      const methodsToShow = node.methods.slice(0, maxLines - lineCount);
      methodsToShow.forEach(method => {
        if (lineCount >= maxLines) return;
        this.ctx.fillText(method, x + 8, lineY);
        lineY += lineHeight;
        lineCount++;
      });
    }
    
    // Show truncation indicator if needed
    const totalItems = (node.properties?.length || 0) + (node.methods?.length || 0);
    if (totalItems > maxLines && lineCount >= maxLines) {
      this.ctx.fillStyle = isDimmed ? '#444' : '#888';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`... ${totalItems - maxLines} more`, x + width / 2, y + height - 10);
    }
    
    if (isDimmed) {
      this.ctx.globalAlpha = 1;
    }
  }

  private getNodeColor(kind: string, isDimmed: boolean): string {
    const colors = {
      class: '#4f46e5',
      interface: '#059669',
      function: '#dc2626',
      module: '#7c2d12',
      type: '#7c3aed',
      enum: '#ea580c'
    };
    
    const baseColor = colors[kind as keyof typeof colors] || '#6b7280';
    return isDimmed ? this.darkenColor(baseColor, 0.5) : baseColor;
  }

  private darkenColor(color: string, factor: number): string {
    // Simple color darkening
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
  }

  private drawEdges(edges: UmlEdge[], selectedIds: Set<string>, dimmedIds: Set<string>) {
    this.ctx.strokeStyle = '#666';
    this.ctx.lineWidth = 1;
    
    edges.forEach(edge => {
      const sourcePos = this.nodePositions.get(edge.source);
      const targetPos = this.nodePositions.get(edge.target);
      
      if (!sourcePos || !targetPos) return;
      
      const isDimmed = dimmedIds.has(edge.source) && dimmedIds.has(edge.target);
      
      if (isDimmed) {
        this.ctx.globalAlpha = 0.2;
      }
      
      // Calculate connection points
      const sourceX = sourcePos.x + sourcePos.width / 2;
      const sourceY = sourcePos.y + sourcePos.height;
      const targetX = targetPos.x + targetPos.width / 2;
      const targetY = targetPos.y;
      
      // Draw arrow
      this.drawArrow(sourceX, sourceY, targetX, targetY, edge.type);
      
      if (isDimmed) {
        this.ctx.globalAlpha = 1;
      }
    });
  }

  private drawArrow(fromX: number, fromY: number, toX: number, toY: number, type: string) {
    const headlen = 10;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    
    // Line
    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.stroke();
    
    // Arrowhead
    this.ctx.beginPath();
    this.ctx.moveTo(toX, toY);
    this.ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    this.ctx.moveTo(toX, toY);
    this.ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    this.ctx.stroke();
    
    // Type-specific styling
    if (type === 'extends' || type === 'implements') {
      // Draw hollow arrowhead for inheritance
      this.ctx.strokeStyle = '#666';
      this.ctx.fillStyle = '#2d2d2d';
      this.ctx.fill();
    }
  }

  // Mouse event handlers
  private handleMouseDown(e: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.lastMouseX = e.clientX - rect.left;
    this.lastMouseY = e.clientY - rect.top;
    this.isDragging = true;
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.isDragging) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const deltaX = mouseX - this.lastMouseX;
    const deltaY = mouseY - this.lastMouseY;
    
    this.panX += deltaX;
    this.panY += deltaY;
    
    this.lastMouseX = mouseX;
    this.lastMouseY = mouseY;
    
    this.redraw();
  }

  private handleMouseUp(e: MouseEvent) {
    this.isDragging = false;
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(3, this.scale * zoomFactor));
    
    // Zoom towards mouse position
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const scaleChange = newScale / this.scale;
    this.panX = mouseX - (mouseX - this.panX) * scaleChange;
    this.panY = mouseY - (mouseY - this.panY) * scaleChange;
    this.scale = newScale;
    
    this.redraw();
  }

  private handleClick(e: MouseEvent) {
    if (this.isDragging) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Transform mouse coordinates
    const worldX = (mouseX - this.panX) / this.scale;
    const worldY = (mouseY - this.panY) / this.scale;
    
    // Find clicked node
    const state = store.getState();
    if (!state.diagram) return;
    
    const clickedNode = state.diagram.nodes.find(node => {
      const pos = this.nodePositions.get(node.id);
      if (!pos) return false;
      
      return worldX >= pos.x && worldX <= pos.x + pos.width &&
             worldY >= pos.y && worldY <= pos.y + pos.height;
    });
    
    if (clickedNode) {
      this.selectNode(clickedNode, e.ctrlKey || e.metaKey);
    } else {
      // Clear selection if clicking empty space
      store.selectNode('', false);
    }
  }

  private selectNode(node: UmlNode, addToSelection: boolean) {
    store.selectNode(node.id, addToSelection);
    
    // Open file associated with the node
    if (node.file) {
      store.selectFile(node.file);
      wsClient.openFile(node.file, node.line, node.symbol);
    }
  }

  // Control methods
  private fitToScreen() {
    if (this.nodePositions.size === 0) return;
    
    // Calculate bounds
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const pos of this.nodePositions.values()) {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + pos.width);
      maxY = Math.max(maxY, pos.y + pos.height);
    }
    
    const contentWidth = maxX - minX + 2 * this.nodeSpacing;
    const contentHeight = maxY - minY + 2 * this.nodeSpacing;
    
    const canvasWidth = this.canvas.width / devicePixelRatio;
    const canvasHeight = this.canvas.height / devicePixelRatio;
    
    const scaleX = canvasWidth / contentWidth;
    const scaleY = canvasHeight / contentHeight;
    this.scale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%
    
    // Center content
    this.panX = (canvasWidth - contentWidth * this.scale) / 2 - (minX - this.nodeSpacing) * this.scale;
    this.panY = (canvasHeight - contentHeight * this.scale) / 2 - (minY - this.nodeSpacing) * this.scale;
    
    this.redraw();
  }

  private resetZoom() {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.redraw();
  }

  private showGenerateDialog() {
    const rootPath = prompt('Enter root path to analyze:', '/path/to/your/project');
    if (rootPath) {
      wsClient.generateUml(rootPath);
    }
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    window.removeEventListener('resize', () => this.resizeCanvas());
  }
}

// CSS styles
export const diagramWidgetStyles = `
  .diagram-widget {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #2d2d2d;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    border-radius: 8px;
    overflow: hidden;
  }

  .diagram-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #3d3d3d;
    border-bottom: 1px solid #555;
  }

  .diagram-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
  }

  .diagram-controls {
    display: flex;
    gap: 4px;
  }

  .diagram-container {
    position: relative;
    flex: 1;
    overflow: hidden;
  }

  #diagram-canvas {
    width: 100%;
    height: 100%;
    cursor: grab;
    background: #1e1e1e;
  }

  #diagram-canvas:active {
    cursor: grabbing;
  }

  .diagram-legend {
    position: absolute;
    top: 12px;
    right: 12px;
    background: rgba(45, 45, 45, 0.9);
    border: 1px solid #555;
    border-radius: 6px;
    padding: 12px;
    min-width: 120px;
    display: none;
  }

  .diagram-legend.visible {
    display: block;
  }

  .diagram-legend h4 {
    margin: 0 0 8px 0;
    font-size: 12px;
    color: #fff;
  }

  .legend-item {
    display: flex;
    align-items: center;
    margin-bottom: 6px;
    font-size: 12px;
  }

  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    margin-right: 6px;
  }

  .legend-color.class { background: #4f46e5; }
  .legend-color.interface { background: #059669; }
  .legend-color.function { background: #dc2626; }
  .legend-color.module { background: #7c2d12; }
  .legend-color.type { background: #7c3aed; }
  .legend-color.enum { background: #ea580c; }
`;