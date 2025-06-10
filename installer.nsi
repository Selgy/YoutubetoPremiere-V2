!include "MUI2.nsh"
!include "FileFunc.nsh"

; Version is passed from the workflow as a command line parameter
; If VERSION is not defined via command line, use a default
!ifndef VERSION
  !define VERSION "1.0.0"
!endif

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
  
  # Copy the Python application directory
  DetailPrint "Installing Python application..."
  File /r "dist\YoutubetoPremiere\*.*"
  
  # Copy the CEP extension 
  DetailPrint "Installing CEP extension..."
  CreateDirectory "$INSTDIR\CEP"
  File /r /x "exec" "dist\cep\*.*" "$INSTDIR\CEP\"
  
  # Ensure .debug file is included (hidden files might not be copied by *)
  !if /FileExists "dist\cep\.debug"
    DetailPrint "Installing .debug file..."
    File /oname="$INSTDIR\CEP\.debug" "dist\cep\.debug"
  !endif
  
  # Create shortcut to the main executable
  CreateDirectory "$SMPROGRAMS\YouTube to Premiere Pro"
  CreateShortcut "$SMPROGRAMS\YouTube to Premiere Pro\YouTube to Premiere Pro.lnk" "$INSTDIR\YoutubetoPremiere.exe"
  CreateShortcut "$DESKTOP\YouTube to Premiere Pro.lnk" "$INSTDIR\YoutubetoPremiere.exe"
  
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
  RMDir /r "$INSTDIR"
  
  # Remove shortcuts
  Delete "$SMPROGRAMS\YouTube to Premiere Pro\*.*"
  RMDir "$SMPROGRAMS\YouTube to Premiere Pro"
  Delete "$DESKTOP\YouTube to Premiere Pro.lnk"
  
  # Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\YoutubetoPremiere"
SectionEnd 