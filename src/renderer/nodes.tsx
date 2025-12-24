import { Handle, Position } from "reactflow"

// node types mapping
export const nodeTypes = {
  expr: ExprNode,
  span: SpanNode,
}

export function ExprNode({ data, selected }: any) {
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
    return (
      <div style={{
        padding: '8px 12px',
        border: selected ? '2px solid #2563eb' : '1px solid white',
        minWidth: 120,
        position: 'relative'
      }}>
        {/* Operation name centered */}
        <div style={{
          textAlign: 'center',
          fontWeight: 500,
          marginBottom: 8
        }}>
          {data.name}
        </div>

        {/* Arguments list */}
        <div style={{ fontSize: 10, color: '#aaa' }}>
          {Array.from(Array(data.n_args)).map((_, i) => (
            <div key={i} style={{
              marginBottom: 4,
              paddingLeft: 12,
              position: 'relative'
            }}>
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
        <Handle
          type="source"
          position={Position.Right}
          id="value"
          style={{ background: '#4ade80' }}
        />
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