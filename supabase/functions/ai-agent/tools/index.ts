// Every tool the agent has. A feature adds AI support by exporting an array of
// tools from its own file here and adding it to this list; nothing else in the
// agent changes.

import { issueTools } from './issues.ts'
import { meetingTools } from './meetings.ts'
import { messagingTools } from './messaging.ts'
import { peopleTools } from './people.ts'
import { reminderTools } from './reminders.ts'
import { ToolRegistry } from './registry.ts'

export const createToolRegistry = () => new ToolRegistry().register(peopleTools, issueTools, messagingTools, meetingTools, reminderTools)
