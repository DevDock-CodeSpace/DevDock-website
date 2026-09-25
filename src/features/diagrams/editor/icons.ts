import {
  Activity,
  AppWindow,
  Bell,
  Bot,
  Boxes,
  Braces,
  ChartLine,
  Clock,
  Cloud,
  Code,
  Cog,
  Container,
  Cpu,
  CreditCard,
  Database,
  DatabaseZap,
  FileText,
  Folder,
  GitBranch,
  Globe,
  HardDrive,
  Inbox,
  KeyRound,
  Laptop,
  ListOrdered,
  Lock,
  Mail,
  MemoryStick,
  MessageSquare,
  Monitor,
  Network,
  Package,
  Radio,
  Router,
  ScrollText,
  Search,
  Server,
  Share2,
  Shield,
  ShieldCheck,
  Smartphone,
  Split,
  Terminal,
  User,
  Users,
  Warehouse,
  Waypoints,
  Webhook,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ColorKey } from './model'

// Architecture icons for the shape panel. The key is what gets saved, so
// never rename one; the label and icon can change freely.

export const ICON_GROUPS = ['Clients', 'Compute', 'Data', 'Network', 'Messaging', 'Security', 'Dev & ops'] as const
type IconGroup = (typeof ICON_GROUPS)[number]

type IconDef = { label: string; icon: LucideIcon; group: IconGroup; color: ColorKey }

const groupColor: Record<IconGroup, ColorKey> = {
  Clients: 'default',
  Compute: 'blue',
  Data: 'green',
  Network: 'violet',
  Messaging: 'amber',
  Security: 'red',
  'Dev & ops': 'teal',
}

const defs = {
  user: ['User', User, 'Clients'],
  users: ['Users', Users, 'Clients'],
  browser: ['Web app', AppWindow, 'Clients'],
  mobile: ['Mobile app', Smartphone, 'Clients'],
  laptop: ['Laptop', Laptop, 'Clients'],
  desktop: ['Desktop', Monitor, 'Clients'],

  server: ['Server', Server, 'Compute'],
  api: ['API', Braces, 'Compute'],
  function: ['Function', Zap, 'Compute'],
  container: ['Container', Container, 'Compute'],
  services: ['Services', Boxes, 'Compute'],
  worker: ['Worker', Cog, 'Compute'],
  cron: ['Scheduler', Clock, 'Compute'],
  cpu: ['Compute', Cpu, 'Compute'],
  ai: ['AI model', Bot, 'Compute'],

  database: ['Database', Database, 'Data'],
  cache: ['Cache', DatabaseZap, 'Data'],
  memory: ['In-memory', MemoryStick, 'Data'],
  storage: ['Storage', HardDrive, 'Data'],
  files: ['Files', Folder, 'Data'],
  warehouse: ['Warehouse', Warehouse, 'Data'],
  search: ['Search', Search, 'Data'],

  internet: ['Internet', Globe, 'Network'],
  cloud: ['Cloud', Cloud, 'Network'],
  loadBalancer: ['Load balancer', Split, 'Network'],
  gateway: ['API gateway', Waypoints, 'Network'],
  router: ['Router', Router, 'Network'],
  network: ['Network', Network, 'Network'],
  cdn: ['CDN', Share2, 'Network'],

  queue: ['Queue', ListOrdered, 'Messaging'],
  stream: ['Event stream', Radio, 'Messaging'],
  inbox: ['Inbox', Inbox, 'Messaging'],
  email: ['Email', Mail, 'Messaging'],
  notification: ['Notifications', Bell, 'Messaging'],
  chat: ['Chat', MessageSquare, 'Messaging'],
  webhook: ['Webhook', Webhook, 'Messaging'],

  auth: ['Auth', ShieldCheck, 'Security'],
  firewall: ['Firewall', Shield, 'Security'],
  lock: ['Encryption', Lock, 'Security'],
  secrets: ['Secrets', KeyRound, 'Security'],

  git: ['Git repo', GitBranch, 'Dev & ops'],
  code: ['Code', Code, 'Dev & ops'],
  terminal: ['Terminal', Terminal, 'Dev & ops'],
  package: ['Package', Package, 'Dev & ops'],
  monitoring: ['Monitoring', Activity, 'Dev & ops'],
  metrics: ['Metrics', ChartLine, 'Dev & ops'],
  logs: ['Logs', ScrollText, 'Dev & ops'],
  payments: ['Payments', CreditCard, 'Dev & ops'],
  docs: ['Docs', FileText, 'Dev & ops'],
} as const satisfies Record<string, readonly [string, LucideIcon, IconGroup]>

export type IconKey = keyof typeof defs

export const ICONS = Object.fromEntries(
  Object.entries(defs).map(([key, [label, icon, group]]) => [key, { label, icon, group, color: groupColor[group] }]),
) as Record<IconKey, IconDef>

export const ICON_KEYS = Object.keys(defs) as IconKey[]
