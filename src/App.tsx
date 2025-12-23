// In this implementation:
// 1. Nodes cannot be in more than one span

import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Panel,
  SelectionMode,
  addEdge,
  type Connection
} from 'reactflow'
import 'reactflow/dist/style.css'

import { useCallback } from 'react'
import { generateProgram } from './compiler/graphToScheme'
import { computeNodesAfterCreateSpan } from './compiler/spans'
import { nodeTypes } from './renderer/nodes'
import { type EdgeKind } from './types'

import { initialNodes, initialEdges } from './editor/initialGraph'
import { procedureDataMapping } from './compiler/spec'

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

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

    // sets the span as the parent node of the selected nodes
    // for UI/rendering reasons
    setNodes(ns => computeNodesAfterCreateSpan(ns, edges, selected, spanId, name))
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
                  data: { kind: 'literal', value: Number(value), name: `Literal ${value}` },
                  type: 'expr',
                }])
              }}
            >
              Add Literal
            </button>

            <button
              style={{ padding: 10, cursor: 'pointer' }}
              onClick={() => {
                const name = prompt('Enter function name (e.g., +, -, *, display):')
                if (!name) return
                const id = `${Date.now()}`
                setNodes(ns => [...ns, {
                  id,
                  position: { x: Math.random() * 400, y: Math.random() * 400 },
                  data: procedureDataMapping[name],
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
                console.log(generateProgram(nodes, edges))
              }}
            >
              Generate
            </button>

            <button
              style={{ padding: 10, cursor: 'pointer' }}
              onClick={() => {
                setNodes([])
                setEdges([])
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
