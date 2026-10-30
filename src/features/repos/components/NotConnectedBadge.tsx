/** A repo Calsko's GitHub connection can't reach (added by name, or its installation was disconnected). */
export function NotConnectedBadge() {
  return (
    <span
      className="shrink-0 rounded-sm border px-1 font-mono text-[10px] text-muted-foreground"
      title="Calsko’s GitHub connection can’t reach this repository. Give the Calsko app access to it on GitHub, then add it again from GitHub."
    >
      Not connected
    </span>
  )
}
