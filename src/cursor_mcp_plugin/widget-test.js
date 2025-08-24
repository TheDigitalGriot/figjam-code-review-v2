// Simple test widget to validate basic functionality
const { widget } = figma;
const { AutoLayout, Text, useSyncedState } = widget;

function TestWidget() {
  const [status, setStatus] = useSyncedState('status', 'Test widget loaded');
  const [counter, setCounter] = useSyncedState('counter', 0);
  
  // Simple test directory data
  const testDirectory = {
    name: 'project',
    path: '/project',
    kind: 'dir',
    children: [
      { name: 'src', path: '/project/src', kind: 'dir' },
      { name: 'package.json', path: '/project/package.json', kind: 'file' },
      { name: 'README.md', path: '/project/README.md', kind: 'file' },
      { name: 'components', path: '/project/components', kind: 'dir' },
      { name: 'utils', path: '/project/utils', kind: 'dir' }
    ]
  };
  
  const renderDirectory = () => {
    if (!testDirectory.children) return [];
    
    return testDirectory.children.map(function(item, index) {
      return Text({
        text: (item.kind === 'dir' ? '📁 ' : '📄 ') + item.name,
        fontSize: 12,
        fill: item.kind === 'dir' ? '#666666' : '#333333',
        onClick: () => {
          setStatus('Clicked: ' + item.name);
          setCounter(counter + 1);
        }
      });
    });
  };

  return AutoLayout({
    direction: 'vertical',
    spacing: 8,
    padding: 16,
    cornerRadius: 8,
    fill: '#FFFFFF',
    stroke: '#CCCCCC',
    strokeWidth: 1,
    width: 300,
    height: 'hug-contents',
  }, [
    Text({
      text: 'Test Directory Widget',
      fontSize: 16,
      fontWeight: 'bold',
      fill: '#333333',
    }),
    
    Text({
      text: status,
      fontSize: 12,
      fill: '#666666',
    }),
    
    Text({
      text: 'Clicks: ' + counter,
      fontSize: 11,
      fill: '#888888',
    }),
    
    AutoLayout({
      direction: 'vertical',
      spacing: 4,
      width: 'fill-parent',
      padding: 8,
      fill: '#F8F8F8',
      cornerRadius: 4,
    }, renderDirectory())
  ]);
}

widget.register(TestWidget);