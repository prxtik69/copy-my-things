!macro customUnInstall
  ; Remove this application's Windows login item when uninstalling.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Copy My Things"
!macroend
