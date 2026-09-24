export function formatLessonNumber(n: number) {
  return String(n).padStart(2, '0')
}

const sessionFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatSessionTime(iso: string) {
  return sessionFormat.format(new Date(iso))
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
