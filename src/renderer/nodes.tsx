import { Handle, Position } from "reactflow"
import { useState } from "react"

// node types mapping
export const nodeTypes = {
  expr: ExprNode,
  span: SpanNode,
  if: IfNode,
}

function IfNode({ selected }: any) {
  return (
    <div
      style={{
        padding: '10px 12px',
        border: selected ? '2px solid #2563eb' : '1px solid white',
        minWidth: 120,
        minHeight: 110,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative'
      }}
    >
      <div style={{ textAlign: 'center', fontWeight: 600 }}>
        if
      </div>

      {/* condition */}
      <div style={{ position: 'relative', height: 24 }}>
        <Handle
          type="target"
          position={Position.Left}
          id="cond"
          style={{ background: '#4ade80' }}
        />
        <span style={{ fontSize: 10, color: '#aaa', marginLeft: 10 }}>
          condition
        </span>
      </div>

      {/* then */}
      <div style={{ position: 'relative', height: 24 }}>
        <Handle
          type="target"
          position={Position.Left}
          id="then"
          style={{ background: '#facc15' }}
        />
        <span style={{ fontSize: 10, color: '#aaa', marginLeft: 10 }}>
          then
        </span>
      </div>

      {/* else */}
      <div style={{ position: 'relative', height: 24 }}>
        <Handle
          type="target"
          position={Position.Left}
          id="else"
          style={{ background: '#facc15' }}
        />
        <span style={{ fontSize: 10, color: '#aaa', marginLeft: 10 }}>
          else
        </span>
      </div>

      {/* flow out */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="flow-out"
        style={{ background: '#22d3ee' }}
      />
    </div>
  )
}


function ExprNode({ data, selected }: any) {
  if (data.kind === 'literal') {
    return (
      <div style={{ padding: 10, border: selected ? '2px solid #2563eb' : '1px solid white' }}>
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
    // make n_args === -1 nodes expandable
    const isVariadic = data.n_args === -1
    const hasOutput = data.output === true
    const [argCount, setArgCount] = useState(
      isVariadic ? 0 : data.n_args
    )

    return (
      <div
        style={{
          padding: '8px 12px',
          border: selected ? '2px solid #2563eb' : '1px solid white',
          minWidth: 120,
          position: 'relative'
        }}
      >
        {/* Operation name */}
        <div
          style={{
            textAlign: 'center',
            fontWeight: 500,
            marginBottom: 6
          }}
        >
          {data.name}
        </div>

        {/* Arguments */}
        <div style={{ fontSize: 10, color: '#aaa' }}>
          {Array.from({ length: argCount }).map((_, i) => (
            <div
              key={i}
              style={{
                marginBottom: 4,
                paddingLeft: 12,
                position: 'relative'
              }}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={`arg-${i}`}
                style={{
                  left: -6,
                  background: '#4ade80'
                }}
              />
              arg-{i}
            </div>
          ))}
        </div>

        {/* Expand button (ONLY for variadic) */}
        {isVariadic && (
          <button
            onClick={() => setArgCount((c: number) => c + 1)}
            style={{
              marginTop: 4,
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: 12,
              lineHeight: 1,
              padding: 2
            }}
            title="Add argument"
          >
            ▾
          </button>
        )}

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


        {/* DATA OUTPUT */}
        {hasOutput && (
          <Handle
            type="source"
            position={Position.Right}
            id="value"
            style={{ background: '#4ade80' }}
          />
        )}


      </div>


    )
  }
}

export function SpanNode({ data }: any) {
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