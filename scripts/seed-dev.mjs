// Fills the DevDock Dev Supabase project with test data: two accounts, a group, workspaces,
// folders, docs, diagrams, issues and a note. Never production data, and never the production
// project: it refuses the live project's URL.
//
// Everything after creating the two accounts is done signed in as them, through the same tables
// and functions the app uses, so RLS, grants and triggers apply exactly as in the app. Only the
// accounts need the secret key (the Auth admin API). Run it once on an empty project; it stops if
// the group already exists.
//
//   npm run seed:dev
//
// Reads (the npm script fills these from the macOS keychain; see docs/DEV_ENVIRONMENT.md):
//   DEV_SUPABASE_URL, DEV_SUPABASE_PUBLISHABLE_KEY, DEV_SUPABASE_SECRET_KEY
//   DEV_ADMIN_PASSWORD, DEV_MEMBER_PASSWORD
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const PRODUCTION_REF = 'ejqrrxxiatvvdiyxtvid'
const ADMIN = { email: 'dev-admin@devdock.test', name: 'Dev Admin' }
const MEMBER = { email: 'dev-member@devdock.test', name: 'Dev Member' }
const GROUP = { name: 'DevDock Dev', slug: 'devdock-dev', type: 'development' }

// The URL and publishable key come from .env.devdb when not given.
const fileEnv = (() => {
  try {
    return Object.fromEntries(
      readFileSync('.env.devdb', 'utf8')
        .split('\n')
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    )
  } catch {
    return {}
  }
})()
const url = process.env.DEV_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL
const publishable = process.env.DEV_SUPABASE_PUBLISHABLE_KEY ?? fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY
const secret = process.env.DEV_SUPABASE_SECRET_KEY
const passwords = { admin: process.env.DEV_ADMIN_PASSWORD, member: process.env.DEV_MEMBER_PASSWORD }

function fail(message) {
  console.error(`seed-dev: ${message}`)
  process.exit(1)
}
if (!url || !publishable || !secret || !passwords.admin || !passwords.member) {
  fail('missing settings. Run it with `npm run seed:dev` (see docs/DEV_ENVIRONMENT.md).')
}
if (url.includes(PRODUCTION_REF)) fail('this is the production project. The seed only runs against DevDock Dev.')

const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, secret, options)

/** Creates the account (confirmed, so it can sign in at once) unless it exists. */
async function ensureUser({ email, name }, password) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, name },
  })
  if (error && !/already been registered|already exists/i.test(error.message)) fail(`creating ${email}: ${error.message}`)
  if (data?.user) console.log(`account ${email}`)
  else console.log(`account ${email} (already there)`)
}

/** A client signed in as that person: everything it does goes through RLS. */
async function signIn({ email }, password) {
  const client = createClient(url, publishable, options)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) fail(`signing in as ${email}: ${error.message}`)
  return client
}

/** Unwraps a Supabase response, stopping on an error. */
function must(what, { data, error }) {
  if (error) fail(`${what}: ${error.message}`)
  return data
}

// A paragraph-per-line TipTap document, as the docs editor saves it.
const doc = (...paragraphs) => ({
  body: { type: 'doc', content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) },
  content: paragraphs.join('\n'),
})

// A small diagram in the editor's saved format (see src/features/diagrams/editor/model.ts).
const shape = (id, label, shapeKind, x, y, fill = 'default') => ({
  id,
  type: 'shape',
  position: { x, y },
  width: 140,
  height: 64,
  data: { label, shape: shapeKind, fill, stroke: fill, line: 'solid', text: 'md', bold: false },
})
const link = (id, source, target, label = '') => ({
  id,
  type: 'connector',
  source,
  target,
  sourceHandle: 'r',
  targetHandle: 'l',
  data: { routing: 'orthogonal', line: 'solid', arrows: 'end', color: 'default', label, animated: false },
})
const requestFlow = {
  nodes: [
    shape('browser', 'Browser (SPA)', 'rounded', 0, 0, 'blue'),
    shape('supabase', 'Supabase API', 'rectangle', 220, 0),
    shape('postgres', 'Postgres (RLS)', 'cylinder', 440, 0, 'teal'),
  ],
  edges: [link('e1', 'browser', 'supabase', 'HTTPS + JWT'), link('e2', 'supabase', 'postgres', 'SQL')],
}

async function main() {
  await ensureUser(ADMIN, passwords.admin)
  await ensureUser(MEMBER, passwords.member)
  const asAdmin = await signIn(ADMIN, passwords.admin)
  const asMember = await signIn(MEMBER, passwords.member)

  const existing = must('looking for the group', await asAdmin.from('teams').select('id').eq('slug', GROUP.slug))
  if (existing.length > 0) {
    console.log(`The group "${GROUP.name}" already exists: nothing to do.`)
    return
  }

  // Group: the creator becomes its owner (trigger). The member joins with an invite code, as people do.
  const team = must('creating the group', await asAdmin.from('teams').insert(GROUP).select('id').single())
  const invite = must('creating an invite', await asAdmin.from('team_invites').insert({ team_id: team.id }).select('code').single())
  must('joining the group', await asMember.rpc('join_team', { invite_code: invite.code }))
  console.log(`group ${GROUP.name} (/t/${GROUP.slug}), with ${MEMBER.email} as a member`)

  const workspace = (title, description, type, modules) =>
    asAdmin
      .rpc('create_workspace_in', {
        p_team_id: team.id,
        p_title: title,
        p_description: description,
        p_type: type,
        p_modules: modules,
        p_access: 'members',
        p_collection_id: null,
      })
      .then((r) => must(`creating ${title}`, r))
  const project = await workspace('Website application', 'The DevDock site itself, for testing.', 'project', [
    'issues',
    'docs',
    'diagrams',
    'live',
    'github',
  ])
  const sandbox = await workspace('Sandbox', 'Try things here.', 'general', ['docs', 'diagrams', 'live'])
  must('adding the member to the project', await asAdmin.from('workspace_members').insert({ workspace_id: project, user_id: (await asMember.auth.getUser()).data.user.id, role: 'member' }))
  console.log('workspaces Website application (project), Sandbox (space)')

  // Folders, docs and diagrams side by side.
  const folder = must(
    'creating a folder',
    await asAdmin.from('doc_folders').insert({ team_id: team.id, workspace_id: project, parent_id: null, name: 'Architecture' }).select('id').single(),
  )
  // A doc is created with its title (and folder), then its text is saved, as the editor does.
  const docs = [
    [null, null, 'Welcome to DevDock Dev', doc('This group only exists in the dev project.', 'Anything here can be deleted.')],
    [project, folder.id, 'System overview', doc('The browser talks straight to Supabase.', 'RLS is the authorization layer.')],
    [sandbox, null, 'Scratch notes', doc('A doc in the Sandbox.')],
  ]
  for (const [workspaceId, folderId, title, text] of docs) {
    const created = must(`creating ${title}`, await asAdmin.from('documents').insert({ team_id: team.id, workspace_id: workspaceId, folder_id: folderId, title }).select('id').single())
    must(`writing ${title}`, await asAdmin.from('documents').update(text).eq('id', created.id))
  }
  must(
    'creating diagrams',
    await asAdmin.from('diagrams').insert([
      { team_id: team.id, workspace_id: project, folder_id: folder.id, title: 'Request flow', data: requestFlow },
      { team_id: team.id, workspace_id: null, title: 'Group map', data: requestFlow },
    ]),
  )
  console.log('folder Architecture, 3 docs, 2 diagrams')

  // Issues in every status (statuses are only moved by GitHub on connected repos; none here).
  const memberId = (await asMember.auth.getUser()).data.user.id
  const issues = [
    ['Set up the dev environment', 'done', 2],
    ['Write the seed script', 'in_review', 2],
    ['Link diagrams from docs', 'in_progress', 3],
    ['Convert Mermaid code blocks to diagrams', 'todo', 1],
    ['Try the AI diagram tool', 'backlog', 0],
  ]
  for (const [title, status, priority] of issues) {
    must(`creating issue ${title}`, await asAdmin.from('issues').insert({ workspace_id: project, title, status, priority, assignee_id: status === 'in_progress' ? memberId : null }))
  }
  console.log(`${issues.length} issues`)

  must('creating a note', await asAdmin.from('reminders').insert({ team_id: team.id, title: 'Check the dev seed', notes: 'A note without a time.' }))
  console.log('1 note')
  console.log(`\nDone. Sign in at /admin-login as ${ADMIN.email} (or ${MEMBER.email}) with the password from the keychain.`)
}

await main()
