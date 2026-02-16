!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\com.unimozer.next\Installer" "InstallPath" "$INSTDIR"
  WriteRegStr SHCTX "Software\com.unimozer.next\Installer" "InstallerKind" "nsis"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ReadRegStr $R0 SHCTX "Software\com.unimozer.next\Installer" "InstallPath"
  StrCmp "$R0" "$INSTDIR" 0 +2
    DeleteRegKey SHCTX "Software\com.unimozer.next\Installer"
!macroend
