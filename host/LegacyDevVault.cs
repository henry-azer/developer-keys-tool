using Microsoft.Win32;

namespace DeveloperKeys.Host;

/// <summary>
/// Developer Keys was called DevVault. Its data is copied, never moved, so the old
/// folders stay as they were and the old app still opens them.
/// </summary>
public static class LegacyDevVault
{
    /// <summary>Copies <paramref name="oldDir"/> to <paramref name="newDir"/> when only the old one exists.</summary>
    public static void CopyIfMissing(string oldDir, string newDir)
    {
        if (Directory.Exists(newDir) || !Directory.Exists(oldDir)) return;
        // Copy into a temp folder first so a failed copy never leaves a half-filled new folder.
        var temp = newDir + ".copying";
        if (Directory.Exists(temp)) Directory.Delete(temp, recursive: true);
        foreach (var dir in Directory.GetDirectories(oldDir, "*", SearchOption.AllDirectories))
            Directory.CreateDirectory(Path.Combine(temp, Path.GetRelativePath(oldDir, dir)));
        Directory.CreateDirectory(temp);
        foreach (var file in Directory.GetFiles(oldDir, "*", SearchOption.AllDirectories))
            File.Copy(file, Path.Combine(temp, Path.GetRelativePath(oldDir, file)));
        Directory.Move(temp, newDir);
    }

    /// <summary>
    /// Both apps listen on the same port, so setup stops a running DevVault and turns off its
    /// start-at-sign-in. Its program files, vault and backups are left in place.
    /// </summary>
    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
    public static void StopOldApp()
    {
        using (var run = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", writable: true))
            run?.DeleteValue("DevVault", throwOnMissingValue: false);
        foreach (var p in System.Diagnostics.Process.GetProcessesByName("DevVault")
                     .Concat(System.Diagnostics.Process.GetProcessesByName("DevVault.Host")))
        {
            using (p)
            {
                try
                {
                    p.Kill();
                    p.WaitForExit(5000);
                }
                catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException)
                {
                    // Already gone.
                }
            }
        }
    }
}
