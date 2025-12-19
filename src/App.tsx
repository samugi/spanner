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
  SelectionMode,
  addEdge,
  type Connection
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useState, useCallback } from 'react'

function ExprNode({ data }: any) {
  if (data.kind === 'literal') {
    return (
      <div style={{ padding: 10, border: '1px solid white' }}>
        <div>Literal</div>
        <div>{data.value}</div>
        {/* FLOW */}
        <Handle
          type="source"
          position={Position.Top}
          id="flow-out"
          style={{ background: '#22d3ee' }}
        />

        {/* DATA */}
        <Handle
          type="source"
          position={Position.Right}
          id="value"
          style={{ background: '#4ade80' }}
        />
      </div>
    )
  }

  if (data.kind === 'call') {
    const ARG_Y_START = 5
    const ARG_Y_STEP = 10
    return (
      <div style={{ padding: 10, border: '1px solid white' }}>
        <div>{data.name}</div>
        {/* FLOW */}
        <Handle
          type="target"
          position={Position.Top}
          id="flow-in"
          style={{ background: '#22d3ee' }}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="flow-out"
          style={{ background: '#22d3ee' }}
        />

        {/* DATA */}
        {Array.from(Array(data.n_args)).map((_, i) => (
          <Handle
            key={i}
            type="target"
            position={Position.Left}
            id={`arg-${i}`}
            style={{ top: ARG_Y_START + i * ARG_Y_STEP, background: '#4ade80' }}
          />
        ))}
        <Handle
          key="value"
          type="source"
          position={Position.Right}
          id={`value`}
          style={{ background: '#4ade80' }}
        />
      </div>
    )
  }
}

type CallSpec = {
  kind: string | 'call'
  name: string
  n_args: number
}

const exprNodeData: Record<string, CallSpec> = {
  "+": { kind: 'call', name: '+', n_args: 2 },
  "print": { kind: 'call', name: 'print', n_args: 1 },
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
    data: exprNodeData['+'],
    type: 'expr',
  },
  {
    id: '4',
    position: { x: 450, y: 150 },
    data: exprNodeData['print'],
    type: 'expr',
  },
];

type EdgeKind = 'flow' | 'data'

const initialEdges: Edge[] = [
  { id: 'e1', source: '1', target: '3', sourceHandle: 'flow-out', targetHandle: 'flow-in', data: { kind: 'flow' as EdgeKind } },
  { id: 'e2', source: '1', target: '3', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' as EdgeKind } },
  { id: 'e3', source: '2', target: '3', sourceHandle: 'flow-out', targetHandle: 'flow-in', data: { kind: 'flow' as EdgeKind } },
  { id: 'e4', source: '2', target: '3', sourceHandle: 'value', targetHandle: 'arg-1', data: { kind: 'data' as EdgeKind } },
  { id: 'e5', source: '3', target: '4', sourceHandle: 'flow-out', targetHandle: 'flow-in', data: { kind: 'flow' as EdgeKind } },
  { id: 'e6', source: '3', target: '4', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' as EdgeKind } },
];

const nodeTypes = {
  expr: ExprNode,
  span: SpanNode,
}

function generateExpr(nodeId: string, nodes: Node[], edges: Edge[], previous: string | null = null): string {
  const node = nodes.find(n => n.id === nodeId)!
  const incoming_nodes = edges.filter(e => e.target === nodeId)

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
      let b = `(let ((${'p-' + node.id} (${node.data.name}`;

      if (incoming_nodes.length === 0) {
        // no inputs, just call the function
        b = b + `)))`;
      } else b = b + `${incoming_nodes
        .sort((a, b) => a.targetHandle!.localeCompare(b.targetHandle!)) // TODO: we need truly separate handles
        .map(e => nodes.find(n => n.id === e.source)?.id!)
        .map(id => `p-${id}`)
        .join(' ')})))`;

      if (previous) {
        b = b + ` ${previous} )`
      } else {
        b = b + ` p-${node.id} )` // TODO: noop
      }
      return b;
    }
    default: {
      throw new Error(`Unknown node kind: ${node.data.kind}`)
    }
  }
}

// TODO: check logic
function spanRootNodes(
  span: Span,
  edges: Edge[]
) {
  return span.nodeIds.filter(nodeId => {
    const outgoing = edges.filter(e => e.source === nodeId)

    // root node of the span if no outgoing edge points to another node in the span
    return outgoing.length === 0 ||
      outgoing.every(e => !span.nodeIds.includes(e.target))
  })
}

function generateProgram(nodes: Node[], edges: Edge[], spans: Span[], visited: Set<string>, result: string | null): string {
  if (visited.size === nodes.length) {
    return result || '';
  }

  for (const n of nodes) {
    // visit all the children of the current node n
    const outgoing = edges.filter(e => e.source === n.id)
    if (outgoing.every(e => visited.has(e.target)) && !visited.has(n.id)) {
      visited.add(n.id);
      result = generateExpr(n.id, nodes, edges, result);
      break;
    }
  }

  return generateProgram(nodes, edges, spans, visited, result);
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

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

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
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        selectionOnDrag={true}
        selectionMode={SelectionMode.Partial}
        fitView
      >
        <Background />
        <Controls />

        <Panel position="top-left">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              style={{ padding: 10, cursor: 'pointer' }}
              onClick={() => {
                const value = prompt('Enter literal value:')
                if (value === null) return
                const id = `${Date.now()}`
                setNodes(ns => [...ns, {
                  id,
                  position: { x: Math.random() * 400, y: Math.random() * 400 },
                  data: { kind: 'literal', value: Number(value) },
                  type: 'expr',
                }])
              }}
            >
              Add Literal
            </button>

            <button
              style={{ padding: 10, cursor: 'pointer' }}
              onClick={() => {
                const name = prompt('Enter function name (e.g., +, -, *, print):')
                if (!name) return
                const id = `${Date.now()}`
                setNodes(ns => [...ns, {
                  id,
                  position: { x: Math.random() * 400, y: Math.random() * 400 },
                  data: exprNodeData[name],
                  type: 'expr',
                }])
              }}
            >
              Add Call
            </button>
          </div>
        </Panel>

        <Panel position="top-right">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              style={{ padding: 10, cursor: 'pointer' }}
              onClick={() => createSpan('my-span')}
            >
              Create span
            </button>

            <button
              style={{ padding: 10, cursor: 'pointer' }}
              onClick={() => {
                console.log(generateProgram(nodes, edges, spans, new Set<string>(), null))
              }}
            >
              Generate
            </button>

            <button
              style={{ padding: 10, cursor: 'pointer' }}
              onClick={() => {
                setNodes([])
                setEdges([])
                setSpans([])
              }}
            >
              Clear All
            </button>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  )
}

export default App