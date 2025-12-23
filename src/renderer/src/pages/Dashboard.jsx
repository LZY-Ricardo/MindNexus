import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function Dashboard() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Total Files</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">-</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Knowledge Chunks</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">-</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Storage Used</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">-</CardContent>
      </Card>
    </div>
  )
}
