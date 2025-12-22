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
import { type Span, generateProgram } from './compiler/graphToScheme'

// In this implementation:
// 1. Nodes cannot be in more than one span

// Node rendering
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

// Call nodes data spec
type CallSpec = {
  kind: string | 'call'
  name: string
  n_args: number
}

// expression nodes data
const exprNodeData: Record<string, CallSpec> = {
  "+": { kind: 'call', name: '+', n_args: 2 },
  "print": { kind: 'call', name: 'print', n_args: 1 },
}

// initial nodes and edges
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
  {
    id: '5',
    position: { x: 560, y: 150 },
    data: exprNodeData['print'],
    type: 'expr',
  },
];

// edge kinds
type EdgeKind = 'flow' | 'data'

// initial edges
const initialEdges: Edge[] = [
  { id: 'e1', source: '1', target: '3', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' as EdgeKind } },
  { id: 'e2', source: '2', target: '3', sourceHandle: 'value', targetHandle: 'arg-1', data: { kind: 'data' as EdgeKind } },
  { id: 'e3', source: '3', target: '4', sourceHandle: 'value', targetHandle: 'arg-0', data: { kind: 'data' as EdgeKind } },
  { id: 'e4', source: '4', target: '5', sourceHandle: 'flow-out', targetHandle: 'flow-in', data: { kind: 'flow' as EdgeKind } },
];

// node types mapping
const nodeTypes = {
  expr: ExprNode,
  span: SpanNode,
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
    (connection: Connection) => {
      const kind: EdgeKind =
        connection.sourceHandle?.startsWith('flow') ||
          connection.targetHandle?.startsWith('flow')
          ? 'flow'
          : 'data'

      setEdges(eds =>
        addEdge(
          {
            ...connection,
            data: { kind },
          },
          eds
        )
      )
    },
    [setEdges]
  );

  function createSpan(name: string) {
    const selected = nodes.filter(
      n => n.selected && n.type === 'expr'
    )

    if (selected.length === 0) return

    const spanId = `span-${Date.now()}`

    // set the span data
    setSpans(s => [
      ...s,
      {
        id: spanId,
        name,
        nodeIds: selected.map(n => n.id),
      },
    ])

    // sets the span as the parent node of the selected nodes
    // for UI/rendering reasons
    setNodes(ns => {
      const spanX = Math.min(...selected.map(n => n.position.x)) - 40
      const spanY = Math.min(...selected.map(n => n.position.y)) - 40

      let spanNode = {
        id: spanId,
        type: 'span',
        position: { x: spanX, y: spanY },
        data: { name },
        style: { width: 300, height: 200 },
      }

      let nodes = [
        // add the span node
        spanNode,

        // update existing nodes
        ...ns.map(n => {
          // for all the non selected, update the span ones
          // so that they become children of the new span if their nodes
          // are consequence of nodes in the new span
          if (!selected.some(s => s.id === n.id)) {

            // check if it's a span node
            if (n.type === 'span') {
              // if it is a span node, check if it is a child span of the new span
              // a child span is a span that contains node that are executed as a consequence of
              // any of the nodes in the new span
              // i.e. we need to traverse the edges from the selected nodes to see if we reach any node in the span
              const selectedIds = new Set(selected.map(s => s.id))
              const spanNodeIds = spans.flatMap(s => s.nodeIds) || [] // all nodes in other spans

              let foundParentSpan = false
              for (const sid of selectedIds) {
                const toVisit = [sid]
                const visited = new Set<string>()
                while (toVisit.length > 0) {
                  const current = toVisit.pop()!
                  if (spanNodeIds.includes(current)) {
                    foundParentSpan = true
                    break
                  }
                  visited.add(current)
                  const incoming = edges.filter(e => e.target === current)
                  for (const o of incoming) {
                    if (!visited.has(o.source)) {
                      toVisit.push(o.source)
                    }
                  }
                }
                if (foundParentSpan) break
              }

              if (foundParentSpan) {
                // move the child span inside the new span
                return {
                  ...n,
                  parentId: spanId,
                }
              }
            }

            return n
          }

          // for all the selected, move them inside the new span
          return {
            ...n,
            parentId: spanId,
            extent: 'parent' as const,
            position: {
              x: n.position.x - spanX,
              y: n.position.y - spanY,
            },
          }
        }),
      ];
      return nodes
    })
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
                console.log(generateProgram(nodes, edges, spans))
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
