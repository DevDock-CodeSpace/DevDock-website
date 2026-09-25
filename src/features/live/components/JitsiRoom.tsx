import { JaaSMeeting } from '@jitsi/react-sdk'
import { LoaderCircle } from 'lucide-react'
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
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <LoaderCircle className="mr-2 size-4 animate-spin" /> Connecting…
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
    <div className="h-[calc(100svh-11rem)] min-h-[480px] overflow-hidden rounded-lg border bg-muted">
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
