import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: SmokeHome,
})

function SmokeHome() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>IEEE Sahrdaya — TanStack Start scaffold</h1>
      <p>Smoke test. PB-direct wiring lands next.</p>
    </div>
  )
}
