import { useReactFlow, useStore } from '@xyflow/react'
import {
  Maximize,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type ToolbarProps = {
  readOnly: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  fullscreen: boolean
  onFullscreen: (on: boolean) => void
  propertiesOpen: boolean
  onToggleProperties: () => void
}

/** Undo/redo, zoom, full screen and the properties-panel toggle, above the canvas. */
export function Toolbar({
  readOnly,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  fullscreen,
  onFullscreen,
  propertiesOpen,
  onToggleProperties,
}: ToolbarProps) {
  const flow = useReactFlow()
  const zoom = useStore((s) => s.transform[2])

  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b bg-background px-2">
      {!readOnly && (
        <>
          <ToolButton icon={Undo2} label="Undo" shortcut="⌘Z" onClick={onUndo} disabled={!canUndo} />
          <ToolButton icon={Redo2} label="Redo" shortcut="⇧⌘Z" onClick={onRedo} disabled={!canRedo} />
          <Separator orientation="vertical" className="mx-1.5 h-4 data-vertical:self-center" />
        </>
      )}
      <ToolButton icon={ZoomOut} label="Zoom out" onClick={() => void flow.zoomOut({ duration: 150 })} />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => void flow.zoomTo(1, { duration: 150 })}
            className="h-7 w-12 rounded-md font-mono text-xs text-muted-foreground tabular-nums hover:bg-muted hover:text-foreground"
          >
            {Math.round(zoom * 100)}%
          </button>
        </TooltipTrigger>
        <TooltipContent>Reset to 100%</TooltipContent>
      </Tooltip>
      <ToolButton icon={ZoomIn} label="Zoom in" onClick={() => void flow.zoomIn({ duration: 150 })} />
      <ToolButton
        icon={Maximize}
        label="Fit to screen"
        onClick={() => void flow.fitView({ padding: 0.2, maxZoom: 1, duration: 200 })}
      />
      <div className="ml-auto flex items-center gap-0.5">
        <ToolButton
          icon={fullscreen ? Minimize2 : Maximize2}
          label={fullscreen ? 'Exit full screen' : 'Full screen'}
          shortcut={fullscreen ? 'Esc' : undefined}
          onClick={() => onFullscreen(!fullscreen)}
        />
        {!readOnly && (
          // The panel only exists on wide screens (lg+), so neither does its toggle.
          <div className="hidden lg:block">
            <ToolButton
              icon={propertiesOpen ? PanelRightClose : PanelRightOpen}
              label={propertiesOpen ? 'Hide properties' : 'Show properties'}
              onClick={onToggleProperties}
              pressed={propertiesOpen}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ToolButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled,
  pressed,
}: {
  icon: LucideIcon
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  /** For toggles: rendered as a pressed button. */
  pressed?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={pressed ? 'secondary' : 'ghost'}
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          disabled={disabled}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <span className="ml-2 font-mono opacity-70">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  )
}
