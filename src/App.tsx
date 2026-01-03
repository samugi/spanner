// In this implementation:
// 1. Nodes cannot be in more than one span
// 2. We use the node parentId to determine span membership
//   1. I.e. a node is in a span if its parentId is the span's id
// 3. We use the span node parentId to determine span nesting
//   1. I.e. a span is nested in another span if its parentId is the other span's id

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
import 'reactflow/dist/style.css';

import { useCallback, useEffect, useState } from 'react'
import { generateProgram } from './compiler/compile'
import { computeNodesAfterCreateSpan } from './compiler/spans'
import { nodeTypes } from './renderer/nodes'
import { type EdgeKind } from './types'

import { initialNodes, initialEdges } from './editor/initialGraph'
import { procedureDataMapping } from './compiler/spec'

function App() {

  const [selectedProcedure, setSelectedProcedure] = useState(
    Object.keys(procedureDataMapping)[0]
  )

  const [currNodeId, setCurrNodeId] = useState(0);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // check nodes and set min to the max node id + 1 to avoid collisions
  useEffect(() => {
    const maxId = Math.max(...nodes.map(n => parseInt(n.id)), 0)
    setCurrNodeId(maxId + 1)
  }, [nodes])

  const deleteSelectedNodes = useCallback(() => {
    setNodes(ns => {
      const selectedIds = new Set(ns.filter(n => n.selected).map(n => n.id))
      setEdges(es => es.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target)))
      return ns.filter(n => !selectedIds.has(n.id))
    })
  }, [setNodes, setEdges])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete or Backspace key
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // prevent browser default (like going back)
        e.preventDefault()
        deleteSelectedNodes()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [deleteSelectedNodes])


  const onConnect = useCallback(
    (connection: Connection) => {
      let kind: EdgeKind = 'data'
      let branch: string | undefined = undefined

      if (connection.targetHandle === 'then' || connection.targetHandle === 'else' || connection.targetHandle?.startsWith('action-')) {
        kind = 'control'
        branch = connection.targetHandle
      } else if (
        connection.sourceHandle?.startsWith('flow') ||
        connection.targetHandle?.startsWith('flow')
      ) {
        kind = 'flow'
      }

      setEdges(eds =>
        addEdge(
          {
            ...connection,
            data: { kind, branch },
          },
          eds
        )
      )
    },
    [setEdges]
  )

  async function sendSCM(content: string) {
    await fetch("http://localhost:3001/spanner-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  }

  function createSpan() {
    const name = prompt('Enter span name:') || 'span'
    const selected = nodes.filter(
      n => n.selected && (n.type === 'expr' || n.type === 'if' || n.type === 'cond')
    )

    if (selected.length === 0) return

    const spanId = `${currNodeId}`;
    setCurrNodeId((c: number) => c + 1);

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
        /* selection */
        selectionOnDrag
        selectionMode={SelectionMode.Partial}

        /* mac-friendly multi select */
        selectionKeyCode={null}
        multiSelectionKeyCode={['Meta']}

        /* stop the hand */
        panOnDrag={false}
        panOnScroll={false}

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
                const id = `${currNodeId}`;
                setCurrNodeId((c: number) => c + 1);
                setNodes(ns => [...ns, {
                  id,
                  position: { x: Math.random() * 400, y: Math.random() * 400 },
                  data: { kind: 'literal', value: value, name: `Literal ${value}` },
                  type: 'expr',
                }])
              }}
            >
              Add Literal
            </button>

            <select
              value={selectedProcedure}
              onChange={(e) => setSelectedProcedure(e.target.value)}
              style={{ padding: 8 }}
            >
              {Object.keys(procedureDataMapping).map(name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <button
              style={{ padding: 10, cursor: 'pointer' }}
              onClick={() => {
                const id = `${currNodeId}`;
                setCurrNodeId((c: number) => c + 1);
                const data = procedureDataMapping[selectedProcedure]

                setNodes(ns => [
                  ...ns,
                  {
                    id,
                    position: {
                      x: Math.random() * 400,
                      y: Math.random() * 400,
                    },
                    data: procedureDataMapping[selectedProcedure],
                    type: data.kind === 'if' ? 'if' : (data.kind === 'cond' ? 'cond' : 'expr'),
                  },
                ])
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
              onClick={() => createSpan()}
            >
              Create span
            </button>

            <button
              style={{ padding: 10, cursor: 'pointer' }}
              onClick={() => {
                const program = generateProgram(nodes, edges);
                console.log(program);
                sendSCM(program);
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
            <button
              style={{ padding: 10, cursor: 'pointer' }}
              onClick={() => {
                const dataStr = JSON.stringify({ nodes, edges }, null, 2)
                const blob = new Blob([dataStr], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'graph.json'
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              Download JSON
            </button>
          </div>

        </Panel>
      </ReactFlow>
    </div>
  )
}

export default App
