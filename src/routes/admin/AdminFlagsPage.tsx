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
 * the default). Flags are added by migrations; this page only switches them.
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
            <FlagSection key={flag.key} flag={flag} groups={groups} />
          ))}
        </div>
      )}
    </>
  )
}

function FlagSection({ flag, groups }: { flag: AdminFlag; groups: AdminGroup[] }) {
  const queryClient = useQueryClient()
  const own = new Map(flag.overrides.map((o) => [o.team_id, o.enabled]))
  const onCount = groups.filter((g) => own.get(g.id) ?? flag.default_enabled).length

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

  return (
    <SettingsSection
      title={flag.key}
      description={
        <>
          {flag.description}
          <span className="mt-2 block">
            On for <span className="font-mono tabular-nums">{onCount}</span> of <span className="font-mono tabular-nums">{groups.length}</span>{' '}
            {groups.length === 1 ? 'group' : 'groups'}.
          </span>
        </>
      }
    >
      <div data-flag={flag.key} className="space-y-5">
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
                    <p className="font-mono text-xs text-muted-foreground">{g.slug}</p>
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
}
