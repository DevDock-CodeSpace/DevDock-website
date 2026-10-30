import { useMutation, useQueryClient, useSuspenseQueries } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { SettingsSection } from '@/components/SettingsSection'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminFlagsQuery, adminGroupsQuery, adminKeys, setFlagDefault, setTeamFlag, type AdminFlag, type AdminGroup } from '@/features/admin/api'
import { errorMessage } from '@/lib/errors'

type GroupSetting = 'default' | 'on' | 'off'

/**
 * /admin/flags: each flag's default for every group, and each group's own setting (on, off, or follow
 * the default). Flags are added by migrations; this page only switches them. Sub-features (a flag with a
 * `parent`) sit indented under their parent, and only count for a group while the parent is on too.
 */
export function AdminFlagsPage() {
  const [{ data: flags }, { data: groups }] = useSuspenseQueries({ queries: [adminFlagsQuery(), adminGroupsQuery()] })

  return (
    <>
      <PageHeader
        title="Feature flags"
        description="Switch features on or off per group. Groups see a change the next time they open Calsko."
      />
      {flags.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No feature flags yet.</p>
      ) : (
        <div>
          {flags.map((flag) => (
            <FlagSection
              key={flag.key}
              flag={flag}
              parent={flag.parent ? flags.find((f) => f.key === flag.parent) : undefined}
              groups={groups}
            />
          ))}
        </div>
      )}
    </>
  )
}

const ownSetting = (flag: AdminFlag, teamId: string) =>
  flag.overrides.find((o) => o.team_id === teamId)?.enabled ?? flag.default_enabled

function FlagSection({ flag, parent, groups }: { flag: AdminFlag; parent?: AdminFlag; groups: AdminGroup[] }) {
  const queryClient = useQueryClient()
  const own = new Map(flag.overrides.map((o) => [o.team_id, o.enabled]))
  // A sub-feature is only really on where its parent is on as well.
  const parentOn = (teamId: string) => !parent || ownSetting(parent, teamId)
  const onCount = groups.filter((g) => (own.get(g.id) ?? flag.default_enabled) && parentOn(g.id)).length

  // Optimistic: the page shows the change at once and puts it back if the database refuses it.
  const patchFlag = (change: (f: AdminFlag) => AdminFlag) => {
    const previous = queryClient.getQueryData(adminKeys.flags)
    queryClient.setQueryData<AdminFlag[]>(adminKeys.flags, (list) => list?.map((f) => (f.key === flag.key ? change(f) : f)))
    return { previous }
  }
  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.flags })
    void queryClient.invalidateQueries({ queryKey: adminKeys.groups })
  }

  const setDefault = useMutation({
    scope: { id: `flag:${flag.key}` },
    mutationFn: (enabled: boolean) => setFlagDefault(flag.key, enabled),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: adminKeys.flags })
      return patchFlag((f) => ({ ...f, default_enabled: enabled }))
    },
    onError: (e, _v, context) => {
      queryClient.setQueryData(adminKeys.flags, context?.previous)
      toast.error(errorMessage(e))
    },
    onSettled: settle,
  })

  const setGroup = useMutation({
    scope: { id: `flag:${flag.key}` },
    mutationFn: ({ teamId, setting }: { teamId: string; setting: GroupSetting }) =>
      setTeamFlag(teamId, flag.key, setting === 'default' ? null : setting === 'on'),
    onMutate: async ({ teamId, setting }) => {
      await queryClient.cancelQueries({ queryKey: adminKeys.flags })
      return patchFlag((f) => ({
        ...f,
        overrides: [
          ...f.overrides.filter((o) => o.team_id !== teamId),
          ...(setting === 'default' ? [] : [{ team_id: teamId, enabled: setting === 'on' }]),
        ],
      }))
    },
    onError: (e, _v, context) => {
      queryClient.setQueryData(adminKeys.flags, context?.previous)
      toast.error(errorMessage(e))
    },
    onSettled: settle,
  })

  const defaultLabel = flag.default_enabled ? 'On' : 'Off'

  const section = (
    <SettingsSection
      title={flag.key}
      description={
        <>
          {parent && (
            <span className="mb-1 block text-xs">
              Sub-feature of <span className="font-mono text-foreground">{parent.key}</span>: works only where that is on too.
            </span>
          )}
          {flag.description}
          <span className="mt-2 block">
            On for <span className="font-mono tabular-nums">{onCount}</span> of <span className="font-mono tabular-nums">{groups.length}</span>{' '}
            {groups.length === 1 ? 'group' : 'groups'}.
          </span>
        </>
      }
    >
      <div data-flag={flag.key} className="space-y-5">
        {flag.details && (
          <div className="rounded-md bg-muted/40 px-4 py-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What happens</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-relaxed text-muted-foreground marker:text-muted-foreground/60">
              {flag.details.split('\n').filter(Boolean).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Default for every group</p>
            <p className="text-sm text-muted-foreground">Groups without their own setting follow this, new groups too.</p>
          </div>
          <Select value={flag.default_enabled ? 'on' : 'off'} onValueChange={(value) => value && setDefault.mutate(value === 'on')}>
            <SelectTrigger className="w-full sm:w-44" aria-label={`Default for ${flag.key}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off</SelectItem>
              <SelectItem value="on">On</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {groups.length > 0 && (
          <ul className="divide-y border-t">
            {groups.map((g) => {
              const setting: GroupSetting = own.has(g.id) ? (own.get(g.id) ? 'on' : 'off') : 'default'
              return (
                <li key={g.id} data-flag-group={g.slug} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{g.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {g.slug}
                      {!parentOn(g.id) && ` · off: ${parent?.key} is off`}
                    </p>
                  </div>
                  <Select
                    value={setting}
                    // Radix reports '' when its options change under it: ignore that.
                    onValueChange={(value) => value && value !== setting && setGroup.mutate({ teamId: g.id, setting: value as GroupSetting })}
                  >
                    <SelectTrigger className="w-full sm:w-44" aria-label={`${flag.key} for ${g.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default ({defaultLabel})</SelectItem>
                      <SelectItem value="on">On</SelectItem>
                      <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                  </Select>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </SettingsSection>
  )

  return parent ? <div className="border-l-2 pl-4 sm:ml-4 sm:pl-6">{section}</div> : section
}
