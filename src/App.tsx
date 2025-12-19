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

  if (data.kind === 'let') {
    return (
      <div style={{ padding: 10, border: '1px solid white' }}>
        <div>let</div>

        {data.bindings.map((b: string, i: number) => (
          <Handle
            key={i}
            type="target"
            position={Position.Left}
            id={`bind-${i}`}
          />
        ))}

        <Handle type="target" position={Position.Bottom} id="body" />
        <Handle type="source" position={Position.Right} />
      </div>
    )
  }
}

type LetNodeData = {
  kind: 'let'
  bindings: string[]   // variable names
}


type ExprNodeData = {
  kind: 'call' | 'literal' | 'let'
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
  },
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

function generateExpr(nodeId: string, nodes: Node[], edges: Edge[], previous: string | null = null): string {
  const node = nodes.find(n => n.id === nodeId)!
  const incoming = edges.filter(e => e.target === nodeId)

  switch (node.data.kind) {
    case 'literal': {
      // literal has no inputs
      // can be a simple let that wraps previous
      if (previous) {
        let param_id = `p-${node.id}`
        return `(let ((${param_id} ${node.data.value})) ${previous})`
      }
      return node.data.value.toString()
    }
    case 'call': {
      let b = `(let ((${'p-' + node.id} (${node.data.name} ${incoming
        .sort((a, b) => a.targetHandle!.localeCompare(b.targetHandle!)) // TODO: we need truly separate handles
        .map(e => nodes.find(n => n.id === e.source)?.id!)
        .map(id => `p-${id}`)
        .join(' ')})))`;

      if (previous) {
        b = b + ` ${previous} )`
      } else {
        b = b + ` (+ 1 1) )` // TODO: noop
      }
      return b;
    }
    default: {
      throw new Error(`Unknown node kind: ${node.data.kind}`)
    }
  }
  return ''
}

function generateExprWithSpans(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
  spans: Span[]
): string {
  let expr = generateExpr(nodeId, nodes, edges)

  for (const span of spans) {
    const roots = spanRootNodes(span, edges)
    if (roots.includes(nodeId)) {
      expr = `(let ((ctx start-span "${span.name}"))
  (begin
    ${expr}
    (end-span ctx)))`
    }
  }

  return expr
}

function spanRootNodes(
  span: Span,
  edges: Edge[]
) {
  return span.nodeIds.filter(nodeId => {
    const outgoing = edges.filter(e => e.source === nodeId)

    // root if any outgoing edge leaves the span
    return outgoing.length === 0 ||
      outgoing.every(e => !span.nodeIds.includes(e.target))
  })
}

function generateProgram(nodes: Node[], edges: Edge[], spans: Span[]): string {
  const visited = new Set<string>();
  let result: string | null = null;

  while (visited.size < nodes.length) {
    for (const n of nodes) {
      // it's time to visit if we visited all its children
      const outgoing = edges.filter(e => e.source === n.id)
      if (outgoing.every(e => visited.has(e.target)) && !visited.has(n.id)) {
        visited.add(n.id);
        result = generateExpr(n.id, nodes, edges, result);
        break;
      }
    }
  }

  return result || '';
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

    // sets the span as the parent node of the selected nodes
    // for UI/rendering reasons
    setNodes(ns => {
      const spanX = Math.min(...selected.map(n => n.position.x)) - 40
      const spanY = Math.min(...selected.map(n => n.position.y)) - 40

      return [
        // span node
        {
          id: spanId,
          type: 'span',
          position: { x: spanX, y: spanY },
          data: { name },
          style: { width: 300, height: 200 },
        },

        // update existing nodes
        ...ns.map(n => {
          if (!selected.some(s => s.id === n.id)) return n

          return {
            ...n,
            parentNode: spanId,
            extent: 'parent' as const,
            position: {
              x: n.position.x - spanX,
              y: n.position.y - spanY,
            },
          }
        }),
      ]
    })

    // set the span data
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
            onClick={() => createSpan('my-span')} // todo: prompt for name or something
          >
            Create span
          </button>

          <button
            style={{ padding: 10, cursor: 'pointer', marginLeft: 8 }}
            onClick={() => {
              console.log(generateProgram(nodes, edges, spans))
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

