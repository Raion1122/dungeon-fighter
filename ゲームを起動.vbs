' ============================================================
'  Dungeon Fighters - local launcher (no console window)
'  Double-click this file: starts a hidden local web server
'  and opens the game in your default browser.
'  Voice narration works because it is served over http://
'  (file:// blocks the mp3 fetch and stays silent).
' ============================================================
Option Explicit
Dim shell, fso, here, port, url, serverCmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
port = "8765"
url  = "http://localhost:" & port & "/tavern.html"

' Start the HTTP server in a HIDDEN window (style 0), from the project folder.
' If a server is already running on this port the new one just fails silently
' and the browser still connects to the existing one.
serverCmd = "cmd /c cd /d """ & here & """ && (py -m http.server " & port & " 2>nul || python -m http.server " & port & " 2>nul)"
shell.Run serverCmd, 0, False   ' 0 = hidden window, False = do not wait

' Give the server a moment to come up, then open the game in the browser.
WScript.Sleep 1500
shell.Run url, 1, False
