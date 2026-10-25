import { JaaSMeeting } from '@jitsi/react-sdk'
import { DockSpinner } from '@/components/DockSpinner'
import type { JaasToken } from '../api'

type JitsiRoomProps = {
  jaas: JaasToken
  subject: string
  displayName: string
  email: string
  /** The user hung up (or the call closed). */
  onLeave: () => void
}

function Spinner() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <DockSpinner label={null} />
      Connecting…
    </div>
  )
}

/**
 * The embedded JaaS (8x8) meeting. Lazy-loaded, so the Jitsi SDK is only
 * downloaded when someone joins. Identity and the moderator flag come from the
 * signed token; recording/streaming are off in the token's features.
 */
export default function JitsiRoom({ jaas, subject, displayName, email, onLeave }: JitsiRoomProps) {
  return (
    <div className="size-full overflow-hidden bg-muted">
      <JaaSMeeting
        appId={jaas.appId}
        roomName={jaas.roomName}
        jwt={jaas.token}
        userInfo={{ displayName, email }}
        spinner={Spinner}
        configOverwrite={{
          subject,
          prejoinConfig: { enabled: true },
          startWithAudioMuted: true,
          disableDeepLinking: true,
          disableInviteFunctions: true,
          enableWelcomePage: false,
          readOnlyName: true,
        }}
        interfaceConfigOverwrite={{ SHOW_PROMOTIONAL_CLOSE_PAGE: false }}
        getIFrameRef={(node) => {
          node.style.height = '100%'
          node.style.width = '100%'
        }}
        onReadyToClose={onLeave}
      />
    </div>
  )
}
