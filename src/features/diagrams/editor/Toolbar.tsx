import { useReactFlow, useStore } from '@xyflow/react'
import {
  CodeXml,
  Eraser,
  Grid3x3,
  Highlighter,
  Maximize,
  Maximize2,
  Minimize2,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { colorNames } from './colors'
import { PEN_SIZES } from './ink'
import type { DrawTool } from './InkLayer'
import type { ColorKey } from './model'

/** The ink colors offered in the toolbar (a short list; any key draws). */
const INK_COLORS: ColorKey[] = ['default', 'blue', 'red', 'green', 'amber', 'violet']
const inkSwatch: Partial<Record<ColorKey, string>> = {
  default: 'bg-foreground',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  green: 'bg-green-500',
  amber: 'bg-amber-400',
  violet: 'bg-violet-500',
}

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
  snapToGrid: boolean
  onSnapToGrid: (on: boolean) => void
  onImportMermaid: () => void
  tool: 'select' | DrawTool
  onTool: (tool: 'select' | DrawTool) => void
  inkColor: ColorKey
  onInkColor: (color: ColorKey) => void
  penSize: number
  onPenSize: (size: number) => void
}

/** Undo/redo, zoom, snap to grid, Mermaid import, full screen and the properties-panel toggle, above the canvas. */
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
  snapToGrid,
  onSnapToGrid,
  onImportMermaid,
  tool,
  onTool,
  inkColor,
  onInkColor,
  penSize,
  onPenSize,
}: ToolbarProps) {
  const flow = useReactFlow()
  const zoom = useStore((s) => s.transform[2])

  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b bg-background px-2 [scrollbar-width:none]">
      {!readOnly && (
        <>
          <ToolButton icon={Undo2} label="Undo" shortcut="⌘Z" onClick={onUndo} disabled={!canUndo} />
          <ToolButton icon={Redo2} label="Redo" shortcut="⇧⌘Z" onClick={onRedo} disabled={!canRedo} />
          <Separator orientation="vertical" className="mx-1.5 h-4 data-vertical:self-center" />
          {/* Select, or draw by hand. */}
          <ToolButton icon={MousePointer2} label="Select" shortcut="V" onClick={() => onTool('select')} pressed={tool === 'select'} />
          <ToolButton icon={PenLine} label="Pen" shortcut="P" onClick={() => onTool('pen')} pressed={tool === 'pen'} />
          <ToolButton icon={Highlighter} label="Highlighter" shortcut="H" onClick={() => onTool('highlighter')} pressed={tool === 'highlighter'} />
          <ToolButton icon={Eraser} label="Eraser: rub out whole strokes" shortcut="E" onClick={() => onTool('eraser')} pressed={tool === 'eraser'} />
          {(tool === 'pen' || tool === 'highlighter') && (
            <div className="ml-1 flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-1" role="group" aria-label="Ink">
              {INK_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`${color === 'default' ? 'Black / white' : colorNames[color]} ink`}
                  aria-pressed={inkColor === color}
                  title={color === 'default' ? 'Black / white (follows the theme)' : colorNames[color]}
                  onClick={() => onInkColor(color)}
                  className={cn(
                    'size-4 rounded-full ring-offset-2 ring-offset-background transition-shadow',
                    inkSwatch[color],
                    inkColor === color ? 'ring-2 ring-brand' : 'hover:ring-1 hover:ring-border',
                  )}
                />
              ))}
              {tool === 'pen' && (
                <>
                  <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
                  {PEN_SIZES.map((size, i) => (
                    <button
                      key={size}
                      type="button"
                      aria-label={`${['Thin', 'Medium', 'Thick'][i]} pen`}
                      aria-pressed={penSize === size}
                      title={['Thin', 'Medium', 'Thick'][i]}
                      onClick={() => onPenSize(size)}
                      className={cn('flex size-6 items-center justify-center rounded', penSize === size ? 'bg-background shadow-sm' : 'hover:bg-background/60')}
                    >
                      <span className="rounded-full bg-foreground" style={{ width: 2 + i * 3, height: 2 + i * 3 }} />
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
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
      {!readOnly && (
        <>
          <Separator orientation="vertical" className="mx-1.5 h-4 data-vertical:self-center" />
          <ToolButton
            icon={Grid3x3}
            label={snapToGrid ? 'Snap to grid: on' : 'Snap to grid: off'}
            onClick={() => onSnapToGrid(!snapToGrid)}
            pressed={snapToGrid}
          />
        </>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        {!readOnly && (
          <>
            {/* Labelled: an icon alone didn't say what it does. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={onImportMermaid} className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
                  <CodeXml className="size-3.5" />
                  Import Mermaid
                </Button>
              </TooltipTrigger>
              <TooltipContent>Paste a Mermaid flowchart or ER diagram (from ChatGPT, GitHub…) to add it as shapes</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="mx-1.5 h-4 data-vertical:self-center" />
          </>
        )}
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
