' ============================================================
'  Dungeon Fighters - map editor launcher (no console window)
'  ダブルクリックすると、隠しウィンドウでローカルサーバを起動し、
'  既定のブラウザで「TRPG マップエディタ」を開きます。
'
'  ・「ゲームを起動.vbs」と同じポート(8765)を使います。
'    すでにゲーム側でサーバが動いていれば、新しい起動は静かに失敗し、
'    そのまま既存のサーバに繋がるだけなので、両方開いても問題ありません。
'  ・停止は「サーバを停止.bat」で(ゲームと共通)。
'  ・file:// で直接開くと動きません(http:// である必要があります)。
' ============================================================
Option Explicit
Dim shell, fso, here, port, url, serverCmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
port = "8765"
url  = "http://localhost:" & port & "/map-editor.html"

' Start the HTTP server in a HIDDEN window (style 0), from the project folder.
' If a server is already running on this port the new one just fails silently
' and the browser still connects to the existing one.
serverCmd = "cmd /c cd /d """ & here & """ && (py -m http.server " & port & " 2>nul || python -m http.server " & port & " 2>nul)"
shell.Run serverCmd, 0, False   ' 0 = hidden window, False = do not wait

' Give the server a moment to come up, then open the editor in the browser.
WScript.Sleep 1500
shell.Run url, 1, False
