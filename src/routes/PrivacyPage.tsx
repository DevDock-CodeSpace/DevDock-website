import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { LogoMark, LogoWordmark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'

const UPDATED = 'September 25, 2026'

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
            <li>docs (including images you add to them) and diagrams;</li>
            <li>issues, comments, labels and cycles, and a history of changes made to issues.</li>
          </ul>
          <p>
            This content is only visible to people in your group or workspace, according to their role (for example,
            workspace content is visible to that workspace’s members and the group’s owners and admins).
          </p>
        </Section>

        <Section title="In your browser">
          <p>
            DevDock keeps your sign-in session and a few preferences in your browser: light or dark theme, the last
            group you opened, and whether some panels are open. There are no ads, no analytics and no tracking.
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
              <strong>Google</strong>: the “Sign in with Google” step.
            </li>
          </ul>
          <p>
            Your data is <strong>never sold</strong>, and it isn’t shared with advertisers or anyone else.
          </p>
        </Section>

        <Section title="Keeping and deleting data">
          <p>
            Your data is kept while you use DevDock. Group owners and workspace leads can delete content, and leaving a
            group removes your access to it. To have your account and data deleted, ask the instructor who runs your
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
