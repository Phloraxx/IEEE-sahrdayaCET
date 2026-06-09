import { SocietiesContent } from './SocietiesContent'

export default function SocietiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Societies</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage IEEE societies and their chairs.</p>
      </div>
      <SocietiesContent />
    </div>
  )
}