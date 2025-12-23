import { Handle, Position } from "reactflow"

// node types mapping
export const nodeTypes = {
  expr: ExprNode,
  span: SpanNode,
}

export function ExprNode({ data }: any) {
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