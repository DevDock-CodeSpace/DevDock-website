// Note titles on their own: no database, no model.

import { isPlaceholderTitle } from '../tools/reminders.ts'
import { assertEquals } from './helpers.ts'

Deno.test('notes: a title that says nothing about the note is a question, not a note', () => {
  for (const title of ['Reminder', 'reminder!', '  A reminder ', 'Remind me', 'Note', 'TODO', 'to-do', 'Something', 'Untitled', '...', '?']) {
    assertEquals(isPlaceholderTitle(title), true, title)
  }
  for (const title of ['Review CAP-12', 'Deploy staging', 'Buy milk', 'Reminder about the demo', 'Note the API change', 'x']) {
    assertEquals(isPlaceholderTitle(title), false, title)
  }
})
