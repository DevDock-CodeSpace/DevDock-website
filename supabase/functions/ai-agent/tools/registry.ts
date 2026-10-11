// The tool registry: the one place the agent learns what it can do. It knows
// nothing about any feature or any model provider. A feature exposes an array
// of tools (tools/issues.ts, …) and tools/index.ts registers it.

import type { AiExecutionContext, AiTool, AiToolDefinition, AiToolExecutor, AiToolResult, AiToolRisk, ObjectSchema } from '../agent/types.ts'

const NAME = /^[a-z][a-z0-9_]{1,62}$/

export type ToolFilter = { domain?: string | string[]; capability?: string | string[]; risk?: AiToolRisk | AiToolRisk[] }

const matches = (value: string, wanted: string | string[] | undefined) =>
  wanted === undefined || (Array.isArray(wanted) ? wanted.includes(value) : wanted === value)

export class ToolRegistry {
  readonly #tools = new Map<string, AiTool>()

  /** Throws on a bad or repeated name, so a mistake stops the function at start-up rather than at a request. */
  register(...groups: (AiTool | readonly AiTool[])[]): this {
    for (const tool of groups.flat()) {
      const { name } = tool.definition
      if (!NAME.test(name)) throw new Error(`AI tool name "${name}" must be snake_case`)
      if (this.#tools.has(name)) throw new Error(`AI tool "${name}" is registered twice`)
      if (!tool.domain || !tool.capability) throw new Error(`AI tool "${name}" needs a domain and a capability`)
      this.#tools.set(name, tool)
    }
    return this
  }

  get(name: string): AiTool | undefined {
    return this.#tools.get(name)
  }

  /** Tools in registration order, optionally narrowed (for sending the model only part of the catalogue later). */
  list(filter: ToolFilter = {}): AiTool[] {
    return [...this.#tools.values()].filter(
      (tool) => matches(tool.domain, filter.domain) && matches(tool.capability, filter.capability) && matches(tool.executor.risk, filter.risk),
    )
  }

  /** Only what the model may see. */
  definitions(filter: ToolFilter = {}): AiToolDefinition[] {
    return this.list(filter).map((tool) => tool.definition)
  }
}

/**
 * Declares a tool with typed arguments. The runner validates the model's
 * arguments against `inputSchema` before `execute` or `prepare` is called, so
 * `A` describes what the schema lets through.
 */
export function defineTool<A>(tool: {
  name: string
  description: string
  inputSchema: ObjectSchema
  domain: string
  capability: string
  risk: AiToolRisk
  confirm?: boolean
  execute: (args: A, context: AiExecutionContext) => Promise<AiToolResult>
  prepare?: AiToolExecutor<A>['prepare']
  editable?: AiToolExecutor<A>['editable']
  confirmedMessage?: AiToolExecutor<A>['confirmedMessage']
}): AiTool {
  const { name, description, inputSchema, domain, capability, ...executor } = tool
  return {
    definition: { name, description, inputSchema },
    domain,
    capability,
    // Arguments reach the executor only after validation, which is what makes this cast sound.
    executor: executor as unknown as AiToolExecutor,
  }
}
