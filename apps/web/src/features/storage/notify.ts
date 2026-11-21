/** Single place for blocking browser notifications; UI can swap this for a toast later. */
export function notify(message: string) {
  window.alert(message);
}

export function confirmAction(message: string) {
  return window.confirm(message);
}
