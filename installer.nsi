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
    DetailPrint "Installation directory set to: $INSTDIR"
FunctionEnd

Section "Install YouTube to Premiere Pro" SEC01
  DetailPrint "Installing YouTube to Premiere Pro..."
  DetailPrint "Working directory: $EXEDIR"
  DetailPrint "Installation target: $INSTDIR"
  
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
  DetailPrint "Created installation directory: $INSTDIR"
  
  # Install CEP extension files in main directory
  SetOutPath "$INSTDIR"
  DetailPrint "Installing CEP extension..."
  
  # Install CEP extension files - copy entire cep folder content
  DetailPrint "Installing CEP extension files..."
  DetailPrint "Copying CEP extension to $INSTDIR..."
  SetOutPath "$INSTDIR"
  
  # Use NSIS error handling - if files don't exist, this will fail
  ClearErrors
  File /r "dist\cep\*.*"
  
  # Check if file copy was successful
  ${If} ${Errors}
    DetailPrint "ERROR: Failed to copy CEP extension files from dist\cep\"
    DetailPrint "Installation cannot continue without CEP extension files"
    MessageBox MB_OK|MB_ICONSTOP "Installation failed: CEP extension files not found or could not be copied."
    Abort
  ${Else}
    DetailPrint "CEP extension files copied successfully"
  ${EndIf}
  

  
  # Final verification of installation
  DetailPrint "Performing final installation verification..."
  
  # Check for essential CEP files
  IfFileExists "$INSTDIR\CSXS\manifest.xml" manifest_ok manifest_missing
  manifest_ok:
    DetailPrint "✓ CEP manifest.xml found"
    Goto check_exec_final
  manifest_missing:
    DetailPrint "❌ CRITICAL ERROR: CEP manifest.xml not found - extension will not work!"
    MessageBox MB_OK|MB_ICONSTOP "Installation verification failed: CEP manifest missing."
    Abort
    
  check_exec_final:
    IfFileExists "$INSTDIR\exec\YoutubetoPremiere.exe" final_ok final_missing
  final_ok:
    DetailPrint "✓ Python executable found"
    DetailPrint "✅ Installation completed successfully!"
    DetailPrint "Extension installed at: $INSTDIR"
    DetailPrint "The extension should now be available in Adobe Premiere Pro"
    Goto installation_done
  final_missing:
    DetailPrint "❌ CRITICAL ERROR: Python executable missing after installation!"
    MessageBox MB_OK|MB_ICONSTOP "Installation verification failed: Python executable is missing. Please try reinstalling."
    Abort
    
  installation_done:
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