import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  Panel,
  SelectionMode
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useState } from 'react'

function ExprNode({ data }: any) {
  if (data.kind === 'literal') {
    return (
      <div style={{ padding: 10, border: '1px solid white' }}>
        <div>Literal</div>
        <div>{data.value}</div>
        <Handle type="source" position={Position.Right} />
      </div>
    )
  }

  if (data.kind === 'call') {
    return (
      <div style={{ padding: 10, border: '1px solid white' }}>
        <div>{data.name}</div>
        <Handle type="target" position={Position.Left} id="0" />
        <Handle type="target" position={Position.Left} id="1" />
        <Handle type="target" position={Position.Left} id="2" />
        <Handle type="target" position={Position.Left} id="3" />
        <Handle type="target" position={Position.Left} id="4" />
        <Handle type="target" position={Position.Left} id="5" />
        <Handle type="source" position={Position.Right} />
      </div>
    )
  }
}

type ExprNodeData = {
  kind: 'call' | 'literal'
  value?: number
  name?: string
}

const initialNodes: Node[] = [
  {
    id: '1',
    position: { x: 50, y: 100 },
    data: { kind: 'literal', value: 1 },
    type: 'expr',
  },
  {
    id: '2',
    position: { x: 50, y: 200 },
    data: { kind: 'literal', value: 2 },
    type: 'expr',
  },
  {
    id: '3',
    position: { x: 250, y: 150 },
    data: { kind: 'call', name: '+' },
    type: 'expr',
  },
  {
    id: '4',
    position: { x: 450, y: 150 },
    data: { kind: 'call', name: 'print' },
    type: 'expr',
  }
];

const initialEdges: Edge[] = [
  { id: 'e1', source: '1', target: '3', targetHandle: '0' },
  { id: 'e2', source: '2', target: '3', targetHandle: '1' },
  { id: 'e3', source: '3', target: '4', targetHandle: '0' },
];

const nodeTypes = {
  expr: ExprNode,
  span: SpanNode,
}

function generate(nodeId: string, nodes: Node[], edges: Edge[]): string {
  const node = nodes.find(n => n.id === nodeId)!
  const incoming = edges.filter(e => e.target === nodeId)

  if (node.data.kind === 'literal') {
    return node.data.value.toString()
  }

  if (node.data.kind === 'call') {
    const args = incoming
      .sort((a, b) => a.targetHandle!.localeCompare(b.targetHandle!))
      .map(e => generate(e.source, nodes, edges))

    return `(${node.data.name} ${args.join(' ')})`
  }

  return ''
}

type Span = {
  id: string
  name: string
  nodeIds: string[]   // nodes wrapped by this span
}

function SpanNode({ data }: any) {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      border: '2px dashed #888',
      borderRadius: 6,
      padding: 6,
      background: 'rgba(255,255,255,0.03)'
    }}>
      <strong>Span: {data.name}</strong>
    </div>
  )
}

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [spans, setSpans] = useState<Span[]>([]);

  function createSpan(name: string) {
    const selected = nodes.filter(
      n => n.selected && n.type === 'expr'
    )

    if (selected.length === 0) return

    const spanId = `span-${Date.now()}`

    setNodes(ns => [
      ...ns,
      {
        id: spanId,
        type: 'span',
        position: {
          x: Math.min(...selected.map(n => n.position.x)) - 40,
          y: Math.min(...selected.map(n => n.position.y)) - 40,
        },
        data: { name },
        style: { width: 300, height: 200 },
      },
      ...selected.map(n => ({
        ...n,
        parentNode: spanId,
        extent: 'parent' as const,
      })),
    ])

    setSpans(s => [
      ...s,
      {
        id: spanId,
        name,
        nodeIds: selected.map(n => n.id),
      },
    ])
  }

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        selectionOnDrag={true}
        selectionMode={SelectionMode.Partial}
        fitView
      >
        <Background />
        <Controls />

        <Panel position="top-right">
          <button
            style={{ padding: 10, cursor: 'pointer' }}
            onClick={() => createSpan('my-span')}
          >
            Create span
          </button>

          <button
            style={{ padding: 10, cursor: 'pointer', marginLeft: 8 }}
            onClick={() => {
              console.log(generate('4', nodes, edges))
            }}
          >
            Generate
          </button>
        </Panel>
      </ReactFlow>
    </div >
  )
}


export default App

