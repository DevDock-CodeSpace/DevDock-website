const FLAG = 'devdock-requests'

/** Turned on or off by the URL, remembered in this browser. */
export function requestRecorderWanted(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get('requests')
    if (asked === '1') localStorage.setItem(FLAG, '1')
    if (asked === '0') localStorage.removeItem(FLAG)
    return localStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}
