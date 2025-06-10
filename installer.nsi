!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

; Enable detailed logging for debugging
LogSet on

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
    
    ; Check if source files exist
    IfFileExists "dist\cep\*.*" 0 no_cep_files
        DetailPrint "CEP source files found in dist\cep\"
        Goto cep_files_ok
    no_cep_files:
        DetailPrint "WARNING: No CEP source files found in dist\cep\"
    cep_files_ok:
FunctionEnd

Section "Install YouTube to Premiere Pro" SEC01
  DetailPrint "Installing YouTube to Premiere Pro..."
  DetailPrint "Working directory: $EXEDIR"
  DetailPrint "Installation target: $INSTDIR"
  
  # List contents of dist\cep directory for debugging
  DetailPrint "Checking contents of source directory..."
  IfFileExists "dist\cep\manifest.xml" 0 no_manifest
    DetailPrint "✓ Found manifest.xml"
    Goto check_other_files
  no_manifest:
    DetailPrint "✗ manifest.xml not found"
  check_other_files:
  
  IfFileExists "dist\cep\*.html" 0 no_html
    DetailPrint "✓ Found HTML files"
    Goto check_js
  no_html:
    DetailPrint "✗ No HTML files found"
  check_js:
  
  IfFileExists "dist\cep\js\*.*" 0 no_js
    DetailPrint "✓ Found JS directory"
    Goto check_exec_source
  no_js:
    DetailPrint "✗ No JS directory found"
  check_exec_source:
  
  IfFileExists "dist\cep\exec\*.*" 0 no_exec_source
    DetailPrint "✓ Found exec directory in CEP"
    Goto warn_user
  no_exec_source:
    DetailPrint "✗ No exec directory found in CEP"
  warn_user:
  
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
  
  # First copy all CEP files except exec folder
  IfFileExists "dist\cep\manifest.xml" 0 skip_manifest
    DetailPrint "Found CEP extension files - copying all except exec..."
    File /r /x "exec" "dist\cep\*.*"
    DetailPrint "CEP extension core files copied"
    
    ; Verify what was actually copied
    IfFileExists "$INSTDIR\manifest.xml" 0 no_copied_manifest
      DetailPrint "✓ Verified: manifest.xml copied successfully"
      Goto check_copied_html
    no_copied_manifest:
      DetailPrint "✗ ERROR: manifest.xml was not copied!"
    check_copied_html:
    
    IfFileExists "$INSTDIR\*.html" 0 no_copied_html
      DetailPrint "✓ Verified: HTML files copied successfully"
      Goto manifest_ok
    no_copied_html:
      DetailPrint "✗ ERROR: HTML files were not copied!"
    manifest_ok:
    
  skip_manifest:
  
  # Then ensure exec folder exists and copy Python executable
  CreateDirectory "$INSTDIR\exec"
  DetailPrint "Created exec directory: $INSTDIR\exec"
  
  IfFileExists "dist\cep\exec\*.*" copy_exec skip_exec
  copy_exec:
    DetailPrint "Copying Python executable from CEP build..."
    SetOutPath "$INSTDIR\exec"
    File /r "dist\cep\exec\*.*"
    DetailPrint "Python executable copied from CEP extension"
    Goto done_exec
  skip_exec:
    DetailPrint "Python executable not found in CEP extension, using fallback..."
    IfFileExists "dist\YoutubetoPremiere\*.*" fallback_exists no_fallback
    fallback_exists:
      SetOutPath "$INSTDIR\exec"
      File /r "dist\YoutubetoPremiere\*.*"
      DetailPrint "Python executable copied from direct build"
      Goto done_exec
    no_fallback:
      DetailPrint "ERROR: No Python executable found in fallback location either!"
  done_exec:
  
  ; Final verification
  DetailPrint "Final verification of installation..."
  IfFileExists "$INSTDIR\manifest.xml" 0 missing_manifest_final
    DetailPrint "✓ FINAL CHECK: manifest.xml present"
    Goto check_exec_final
  missing_manifest_final:
    DetailPrint "✗ FINAL CHECK: manifest.xml MISSING!"
  check_exec_final:
  
  IfFileExists "$INSTDIR\exec\*.*" 0 missing_exec_final
    DetailPrint "✓ FINAL CHECK: exec directory present"
    Goto install_complete
  missing_exec_final:
    DetailPrint "✗ FINAL CHECK: exec directory MISSING!"
  install_complete:
  
  DetailPrint "Installation completed"
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