import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { LogoMark, LogoWordmark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'

const UPDATED = 'October 18, 2026'

/**
 * Public privacy policy at /privacy (no sign-in needed; linked from the login
 * page and from Google's consent screen). Keep it in step with what the app
 * actually stores; see docs/STATUS.md.
 */
export function PrivacyPage() {
  return (
    <div className="min-h-svh bg-background">
      <header className="flex items-center justify-between px-4 py-4 md:px-8">
        <Link to="/" className="flex items-center gap-2.5" aria-label="DevDock home">
          <LogoMark className="h-8" />
          <LogoWordmark className="h-5" />
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6 pb-20 md:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">Last updated {UPDATED}</p>

        <p className="mt-6 text-[15px] leading-relaxed text-muted-foreground">
          DevDock is a private workspace for learning and teaching software engineering, used by an instructor and a
          small group of students. This page explains what DevDock stores about you and why.
        </p>

        <Section title="What we get when you sign in with Google">
          <p>When you sign in with Google, DevDock receives and stores:</p>
          <ul>
            <li>your name,</li>
            <li>your email address,</li>
            <li>a link to your Google profile photo, shown as your avatar to people in your group.</li>
          </ul>
          <p>
            DevDock never sees your Google password and has no access to your Gmail, Drive, Calendar or anything else in
            your Google account.
          </p>
        </Section>

        <Section title="What you create in DevDock">
          <p>DevDock stores the things you and your group create, so you can use them:</p>
          <ul>
            <li>groups, workspaces and who belongs to them, with their roles;</li>
            <li>docs (including images you add to them) and whiteboards;</li>
            <li>issues (including images you add to their descriptions), comments, labels and sprints, and a history of changes made to issues;</li>
            <li>the GitHub repositories your group uses (their names and GitHub ids) and which projects use them;</li>
            <li>notes you keep for yourself: their title, details, the time you want them to pop up (if any) and the workspace or issue they are about.</li>
          </ul>
          <p>
            This content is only visible to people in your group or workspace, according to their role (for example,
            workspace content is visible to that workspace’s members and the group’s owners and admins). Notes are
            the exception: only you can see yours, not even the group’s owners and admins.
          </p>
        </Section>

        <Section title="If your group connects GitHub">
          <p>
            A group owner or admin can connect the DevDock GitHub app. On GitHub, they choose which repositories it may
            see, and DevDock can only reach those. DevDock stores the GitHub account or organization it was installed
            on.
          </p>
          <p>
            While connecting, GitHub asks the person connecting to sign in, so DevDock can check they really have access
            to that installation. DevDock uses that GitHub sign-in once and doesn’t keep it.
          </p>
        </Section>

        <Section title="If you use Ask DevDock (AI)">
          <p>
            Ask DevDock lets you type a request in your own words, such as “show my open issues” or “tell Sree I’ll be
            late”. It is only used when you open it and send something. To answer, DevDock sends to an AI model run by
            Google (Gemini):
          </p>
          <ul>
            <li>what you typed, and the last few messages of that Ask DevDock chat;</li>
            <li>your name, your group’s name, the date and your time zone, and the name of the page you have open;</li>
            <li>
              the DevDock details needed for that one request, for example the titles and status of matching issues, the
              names of people in your group, or the title and time of a meeting.
            </li>
          </ul>
          <p>
            It can only see and do what you are allowed to see and do, and it asks you before sending a message.
            DevDock does not send your email address, your sign-in, your documents or your chat history to the model,
            and the chat itself lives only in your browser tab until you close it. DevDock does keep a private record of
            each request you send: what you typed, the steps it took in DevDock to answer (which actions it ran and
            with what details), and its reply. It is there so a wrong answer can be traced and fixed; only you can read
            it, other people in your group can’t, and it is kept until your account or group is deleted. A message you ask it to prepare is held for up to ten minutes while it waits for your confirmation.
          </p>
          <p>
            Google processes these requests under the terms of its Gemini API. On the free plan DevDock currently uses,
            Google may also use them to improve its products, so don’t put anything in a request that you wouldn’t want
            shared that way.
          </p>
        </Section>

        <Section title="In your browser">
          <p>
            DevDock keeps your sign-in session and a few preferences in your browser: light or dark theme, the last
            group you opened, and whether some panels are open. The session stays in the tab you signed in with and
            ends after 4 hours; if you tick “Remember me”, this browser keeps it for up to 12 hours. Either way you are
            signed out after 15 minutes without use. There are no ads, no analytics and no tracking.
          </p>
        </Section>

        <Section title="Who handles your data">
          <p>DevDock runs on a few services that store or process data on its behalf:</p>
          <ul>
            <li>
              <strong>Supabase</strong>: database, sign-in and file storage;
            </li>
            <li>
              <strong>Vercel</strong>: hosts the website;
            </li>
            <li>
              <strong>Google</strong>: the “Sign in with Google” step, and the AI model behind Ask DevDock when you use
              it;
            </li>
            <li>
              <strong>GitHub</strong>: only if your group connects it, for the repositories it was given access to.
            </li>
          </ul>
          <p>
            Your data is <strong>never sold</strong>, and it isn’t shared with advertisers or anyone else.
          </p>
        </Section>

        <Section title="Keeping and deleting data">
          <p>
            Your data is kept while you use DevDock. Group owners and workspace leads can delete content, and leaving a
            group removes your access to it and deletes your notes in it. To have your account and data deleted, ask the instructor who runs your
            DevDock group.
          </p>
        </Section>

        <Section title="Changes">
          <p>If this policy changes, this page will be updated and the date above will change.</p>
        </Section>

        <p className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          <Link to="/login" className="underline underline-offset-4 hover:text-foreground">
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  )
}
