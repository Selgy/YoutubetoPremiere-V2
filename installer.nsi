!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

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
  
  # Warn user about potentially running processes
  MessageBox MB_OKCANCEL|MB_ICONINFORMATION "Please close YouTube to Premiere Pro application if it's currently running before continuing installation. Click OK to proceed." IDOK cleanup_install IDCANCEL abort_install
  abort_install:
    DetailPrint "Installation aborted by user"
    Abort
  
  cleanup_install:
  # Remove any existing installation first  
  DetailPrint "Cleaning up previous installation..."
  RMDir /r "$INSTDIR"
  
  # Create directory structure
  CreateDirectory "$INSTDIR"
  
  # Install CEP extension files in main directory
  SetOutPath "$INSTDIR"
  DetailPrint "Installing CEP extension..."
  
  # First copy all CEP files except exec folder
  IfFileExists "dist\cep\manifest.xml" 0 skip_manifest
    DetailPrint "Found CEP extension files"
    File /r /x "exec" "dist\cep\*.*"
    DetailPrint "CEP extension core files copied"
  skip_manifest:
  
  # Then ensure exec folder exists and copy Python executable
  CreateDirectory "$INSTDIR\exec"
  IfFileExists "dist\cep\exec\*.*" copy_exec skip_exec
  copy_exec:
    DetailPrint "Copying Python executable from CEP build..."
    SetOutPath "$INSTDIR\exec"
    File /r "dist\cep\exec\*.*"
    DetailPrint "Python executable copied from CEP extension"
    Goto done_exec
  skip_exec:
    DetailPrint "Python executable not found in CEP extension, using fallback..."
    SetOutPath "$INSTDIR\exec"
    File /r "dist\YoutubetoPremiere\*.*"
    DetailPrint "Python executable copied from direct build"
  done_exec:
  
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