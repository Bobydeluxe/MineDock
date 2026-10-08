$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class MineDockQaClose {
 public delegate bool Callback(IntPtr hwnd, IntPtr state);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr state);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr a, IntPtr b);
 public static void Close(uint target) { EnumWindows((hwnd,state)=>{uint owner;GetWindowThreadProcessId(hwnd,out owner);if(owner==target)PostMessage(hwnd,0x0010,IntPtr.Zero,IntPtr.Zero);return true;},IntPtr.Zero); }
}
"@
$qaDirectory = (Resolve-Path -LiteralPath 'data/upgrade-validation').Path + '\'
$qaWrappers = Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'MineDock-*.exe' -and $_.ExecutablePath -and $_.ExecutablePath.StartsWith($qaDirectory,[StringComparison]::OrdinalIgnoreCase) }
foreach ($qaWrapper in $qaWrappers) { foreach ($qaMain in (Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $qaWrapper.ProcessId -and $_.Name -eq 'MineDock.exe' })) { [MineDockQaClose]::Close([uint32]$qaMain.ProcessId); $qaProcess = Get-Process -Id $qaMain.ProcessId -ErrorAction SilentlyContinue; if ($qaProcess) { $qaProcess.WaitForExit(10000) } } }
