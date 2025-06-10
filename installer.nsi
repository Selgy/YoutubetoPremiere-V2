!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsProcess.nsh"

; Version is passed from the workflow as a command line parameter
; If VERSION is not defined via command line, use a default
!ifndef VERSION
  !define VERSION "1.0.0"
!endif

Name "YouTube to Premiere Pro"
OutFile "YoutubetoPremiere-${VERSION}-Setup.exe"
; Icon temporarily disabled - will be added later
; !define MUI_ICON "icon.ico"

; Request application privileges for Windows Vista and higher
RequestExecutionLevel admin

; Interface Settings
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_SHOWREADME "https://chromewebstore.google.com/detail/youtube-to-premiere-pro-v/fnhpeiohcfobchjffmgfdeobphhmaibb"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Open Chrome Extension Page"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Function .onInit
    ; Force installation to Adobe CEP extensions folder
    StrCpy $INSTDIR "$PROGRAMFILES64\Common Files\Adobe\CEP\extensions\com.selgy.youtubetopremiere"
FunctionEnd

Section "Install YouTube to Premiere Pro" SEC01
  DetailPrint "Installing YouTube to Premiere Pro..."
  
  # Check if YouTube to Premiere Pro is running and stop it
  DetailPrint "Checking for running processes..."
  nsProcess::_FindProcess "YoutubetoPremiere.exe"
  Pop $R0
  ${If} $R0 == 0
    MessageBox MB_OKCANCEL|MB_ICONSTOP "YouTube to Premiere Pro is currently running. Click OK to close it automatically, or Cancel to abort installation." IDOK kill_process IDCANCEL abort_install
    kill_process:
      DetailPrint "Stopping YouTube to Premiere Pro process..."
      nsProcess::_KillProcess "YoutubetoPremiere.exe"
      Pop $R0
      Sleep 2000
      Goto cleanup_install
    abort_install:
      DetailPrint "Installation aborted by user"
      Abort
  ${EndIf}
  
  cleanup_install:
  # Remove any existing installation first  
  DetailPrint "Cleaning up previous installation..."
  RMDir /r "$INSTDIR"
  
  # Create directory structure
  CreateDirectory "$INSTDIR"
  CreateDirectory "$INSTDIR\exec"
  
  # Install Python executable in exec subfolder
  SetOutPath "$INSTDIR\exec"
  DetailPrint "Installing Python application..."
  File /r "dist\YoutubetoPremiere\*.*"
  
  # Install CEP extension files in main directory
  SetOutPath "$INSTDIR"
  DetailPrint "Installing CEP extension..."
  IfFileExists "dist\cep\*.*" copy_cep skip_cep
  copy_cep:
    File /r /x "exec" "dist\cep\*.*"
    Goto done_cep
  skip_cep:
    DetailPrint "CEP extension not found, skipping..."
  done_cep:
  
  DetailPrint "Installation completed successfully"
SectionEnd

Section "Enable Debugging for Adobe CEP"
  DetailPrint "Enabling CEP debugging mode..."
  WriteRegStr HKCU "Software\Adobe\CSXS.6" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.7" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.8" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.9" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.10" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.11" "PlayerDebugMode" "1"
  WriteRegStr HKCU "Software\Adobe\CSXS.12" "PlayerDebugMode" "1"
SectionEnd

Section "Uninstall"
  # Remove all extension files
  Delete "$INSTDIR\exec\YoutubetoPremiere.exe"
  RMDir /r "$INSTDIR\exec"
  RMDir /r "$INSTDIR"
  
  # Remove CEP debugging registry entries
  DeleteRegValue HKCU "Software\Adobe\CSXS.6" "PlayerDebugMode"
  DeleteRegValue HKCU "Software\Adobe\CSXS.7" "PlayerDebugMode"
  DeleteRegValue HKCU "Software\Adobe\CSXS.8" "PlayerDebugMode"
  DeleteRegValue HKCU "Software\Adobe\CSXS.9" "PlayerDebugMode"
  DeleteRegValue HKCU "Software\Adobe\CSXS.10" "PlayerDebugMode"
  DeleteRegValue HKCU "Software\Adobe\CSXS.11" "PlayerDebugMode"
  DeleteRegValue HKCU "Software\Adobe\CSXS.12" "PlayerDebugMode"
SectionEnd 