!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\com.unimozer.next\Installer" "InstallPath" "$INSTDIR"
  WriteRegStr SHCTX "Software\com.unimozer.next\Installer" "InstallerKind" "nsis"

  WriteRegStr SHCTX "Software\Classes\.umz" "" "com.unimozer.next.umz"
  WriteRegStr SHCTX "Software\Classes\com.unimozer.next.umz" "" "Unimozer Next Project File"
  WriteRegStr SHCTX "Software\Classes\com.unimozer.next.umz\DefaultIcon" "" "$INSTDIR\unimozer-next.exe,0"
  WriteRegStr SHCTX "Software\Classes\com.unimozer.next.umz\shell\open\command" "" '"$INSTDIR\unimozer-next.exe" "%1"'

  System::Call 'shell32::SHChangeNotify(i 0x8000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ReadRegStr $R0 SHCTX "Software\com.unimozer.next\Installer" "InstallPath"
  StrCmp "$R0" "$INSTDIR" 0 +2
    DeleteRegKey SHCTX "Software\com.unimozer.next\Installer"

  ReadRegStr $R1 SHCTX "Software\Classes\com.unimozer.next.umz\shell\open\command" ""
  StrCmp "$R1" '"$INSTDIR\unimozer-next.exe" "%1"' 0 +2
    DeleteRegKey SHCTX "Software\Classes\com.unimozer.next.umz"

  ReadRegStr $R2 SHCTX "Software\Classes\.umz" ""
  StrCmp "$R2" "com.unimozer.next.umz" 0 +2
    DeleteRegKey SHCTX "Software\Classes\.umz"

  System::Call 'shell32::SHChangeNotify(i 0x8000000, i 0, p 0, p 0)'
!macroend
