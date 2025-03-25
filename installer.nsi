!include "MUI2.nsh"
!include "FileFunc.nsh"

; Version is passed from the workflow
!define VERSION "${VERSION}"

Name "YouTube to Premiere Pro"
OutFile "YoutubetoPremiere-${VERSION}-Setup.exe"
InstallDir "$PROGRAMFILES\YoutubetoPremiere"

; Request application privileges for Windows Vista and higher
RequestExecutionLevel admin

; Interface Settings
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  
  # Main executable
  File "dist\YoutubetoPremiere.exe"
  
  # Additional files if they exist
  !if /FileExists "dist\YoutubetoPremiere\*.*"
    File /r "dist\YoutubetoPremiere\*.*"
  !endif
  
  # Add the ZXP to the installer if it exists
  CreateDirectory "$INSTDIR\zxp"
  !if /FileExists "dist\zxp\YoutubetoPremiere-v${VERSION}.zxp"
    File /oname="$INSTDIR\zxp\YoutubetoPremiere-${VERSION}.zxp" "dist\zxp\YoutubetoPremiere-v${VERSION}.zxp"
  !endif
  
  # Create shortcut
  CreateDirectory "$SMPROGRAMS\YouTube to Premiere Pro"
  CreateShortcut "$SMPROGRAMS\YouTube to Premiere Pro\YouTube to Premiere Pro.lnk" "$INSTDIR\YoutubetoPremiere.exe"
  
  # Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"
  
  # Add uninstall information to Add/Remove Programs
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\YoutubetoPremiere" "DisplayName" "YouTube to Premiere Pro"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\YoutubetoPremiere" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\YoutubetoPremiere" "DisplayIcon" '"$INSTDIR\YoutubetoPremiere.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\YoutubetoPremiere" "Publisher" "YoutubetoPremiere"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\YoutubetoPremiere" "DisplayVersion" "${VERSION}"
  
  # Get install size
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\YoutubetoPremiere" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  # Remove application files
  RMDir /r "$INSTDIR\*.*"
  
  # Remove shortcuts
  Delete "$SMPROGRAMS\YouTube to Premiere Pro\*.*"
  RMDir "$SMPROGRAMS\YouTube to Premiere Pro"
  
  # Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\YoutubetoPremiere"
  
  # Remove install directory if empty
  RMDir "$INSTDIR"
SectionEnd 