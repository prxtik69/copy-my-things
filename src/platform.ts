export function formatShortcut(accelerator: string, mac: boolean): string {
  return accelerator
    .replaceAll('CommandOrControl', mac ? '⌘' : 'Ctrl')
    .replaceAll('Command', '⌘')
    .replaceAll('Control', 'Ctrl')
    .replaceAll('Shift', mac ? '⇧' : 'Shift')
    .replaceAll('Alt', mac ? '⌥' : 'Alt')
    .replaceAll('+', ' ')
}
