/** Shown for a workspace tool URL whose tool is turned off in that workspace. */
export function ToolNotEnabled() {
  return (
    <div className="py-16 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <p className="mt-1 font-medium">This tool isn’t enabled in this workspace.</p>
    </div>
  )
}
