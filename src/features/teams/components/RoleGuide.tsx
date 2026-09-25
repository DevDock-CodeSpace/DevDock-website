import { Check } from 'lucide-react'
import type { TeamRole, TeamType } from '../api'
import type { WorkspaceRole } from '@/features/workspaces/api'
import { cn } from '@/lib/utils'
import { defaultWorkspaceType, workspaceTypes } from '../permissions'

// Plain-language summary of the roles. Keep it in step with the RLS policies
// (and permissions.ts); it's a guide for people, not the enforcement.

type Role = { title: string; who: string; can: string[] }

/** Who typically holds each role, by group type. */
const typical: Record<TeamType, Record<TeamRole | WorkspaceRole, string>> = {
  learning: {
    owner: 'Runs the group, usually the instructor',
    admin: 'Instructors and TAs',
    member: 'Students',
    lead: 'Teaches or assists in this course',
  },
  development: {
    owner: 'Runs the group',
    admin: 'Team leads and managers',
    member: 'Developers and contributors',
    lead: 'Leads this project',
  },
  general: {
    owner: 'Runs the group',
    admin: 'Helps run the group',
    member: 'Everyone else',
    lead: 'Runs this workspace',
  },
}

/**
 * "Who can do what": group roles (owner, admin, member), then what a lead and
 * a member can do inside a course/project/workspace. Wording follows the
 * group's type; the viewer's own role is marked.
 */
export function RoleGuide({ type, myRole }: { type: TeamType; myRole: TeamRole }) {
  const noun = workspaceTypes[defaultWorkspaceType[type]].noun // course / project / workspace
  const nouns = `${noun}s`
  const who = typical[type]

  const groupRoles: (Role & { id: TeamRole })[] = [
    {
      id: 'owner',
      title: 'Owner',
      who: who.owner,
      can: [
        'Everything an admin can do',
        'Make people admins or members',
        'Remove anyone from the group',
        'Delete the group',
      ],
    },
    {
      id: 'admin',
      title: 'Admin',
      who: who.admin,
      can: [
        'Invite people with invite codes, and remove members',
        `Create, edit and delete ${nouns}, and choose who’s in each and who leads it`,
        `See and manage every ${noun}, even ones they haven’t joined`,
        'Write group-wide docs and diagrams, and change group settings',
      ],
    },
    {
      id: 'member',
      title: 'Member',
      who: who.member,
      can: [
        `Sees only the ${nouns} they’ve been added to`,
        'Reads group-wide docs and diagrams',
        `What they can do inside a ${noun} depends on their role there (below)`,
        'Can leave the group at any time',
      ],
    },
  ]

  const workspaceRoles: Role[] = [
    {
      title: 'Lead',
      who: who.lead,
      can: [
        `Change the ${noun}’s settings and tools, and add or remove its members`,
        'Write its docs and diagrams, and organize folders',
        'Delete issues, and manage labels and cycles',
        ...(type === 'learning' ? ['Build the course in Learning and see the class’s progress'] : []),
      ],
    },
    {
      title: 'Member',
      who: type === 'learning' ? 'Takes the course' : `Works in the ${noun}`,
      can: [
        'Reads its docs and diagrams',
        'Creates and updates issues, and comments',
        ...(type === 'learning' ? ['Takes lessons and tracks their own progress'] : []),
      ],
    },
  ]

  return (
    <section aria-labelledby="role-guide" className="mt-12">
      <h2 id="role-guide" className="text-sm font-semibold">
        Who can do what
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {type === 'learning'
          ? 'A common setup: instructors and TAs are admins, students are members, and each course has one or more leads.'
          : `Roles in the group decide who manages it; each ${noun} also has leads and members.`}
      </p>

      <div className="mt-4 grid border-y md:grid-cols-3 md:divide-x">
        {groupRoles.map((role) => (
          <RoleColumn key={role.id} role={role} isYou={role.id === myRole} />
        ))}
      </div>

      <h3 className="mt-8 text-sm font-semibold">Inside a {noun}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Set per {noun} on its Members tab. Group owners and admins can do everything a lead can, in every {noun}.
      </p>
      <div className="mt-4 grid border-y md:grid-cols-2 md:divide-x">
        {workspaceRoles.map((role) => (
          <RoleColumn key={role.title} role={role} />
        ))}
      </div>
    </section>
  )
}

function RoleColumn({ role, isYou = false }: { role: Role; isYou?: boolean }) {
  return (
    <div className={cn('border-b px-4 py-4 last:border-b-0 md:border-b-0', isYou && 'bg-muted/40')}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className={cn(isYou && 'text-brand')}>{role.title}</span>
        {isYou && <span className="font-mono text-[11px] font-normal text-muted-foreground">you</span>}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{role.who}</p>
      <ul className="mt-3 space-y-1.5">
        {role.can.map((item) => (
          <li key={item} className="flex gap-2 text-sm">
            <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
