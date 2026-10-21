using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace DeveloperKeys.Host;

/// <summary>
/// One-click setup. Run as developer-keys-setup.exe, the same program installs itself:
/// copies to %LOCALAPPDATA%\Programs\Developer Keys, trusts the localhost certificate,
/// starts at sign-in, appears in Apps &amp; features, saves the Teams package to
/// Downloads, then starts Developer Keys and opens it. Everything is per-user; no admin.
/// </summary>
public static class Installer
{
    public const string Publisher = "Henry Azer";
    static readonly string InstallDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Developer Keys");
    static readonly string InstalledExe = Path.Combine(InstallDir, "developer-keys.exe");
    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Developer Keys";

    /// <summary>True when this copy is the downloaded setup file (developer-keys-setup.exe, or "developer-keys-setup (1).exe").</summary>
    public static bool IsSetup() =>
        OperatingSystem.IsWindows() &&
        Path.GetFileNameWithoutExtension(Environment.ProcessPath ?? "").StartsWith("developer-keys-setup", StringComparison.OrdinalIgnoreCase);

    public static async Task<int> InstallAsync(string origin)
    {
        if (!OperatingSystem.IsWindows()) return 1;
        try
        {
            StopInstalledCopies();
            LegacyDevVault.StopOldApp();
            Directory.CreateDirectory(InstallDir);
            CopyWhenFree(Environment.ProcessPath!, InstalledExe);

            // Windows asks the person to confirm trusting the certificate; Teams only loads HTTPS tabs.
            LocalCert.Ensure();

            using (var run = Registry.CurrentUser.CreateSubKey(RunKey))
                run.SetValue("Developer Keys", $"\"{InstalledExe}\"");
            RegisterUninstall();
            var teamsZip = SaveTeamsPackage();

            Process.Start(new ProcessStartInfo(InstalledExe) { UseShellExecute = true, WorkingDirectory = InstallDir });
            await WaitUntilRunningAsync(origin, TimeSpan.FromSeconds(20));
            OpenBrowser(origin);

            Message(
                "Developer Keys is installed and running. It starts when you sign in to Windows.\n\n" +
                (teamsZip is null
                    ? "To add it to Teams, upload the Developer Keys Teams package as a custom app."
                    : $"To add it to Teams: Apps → Manage your apps → Upload an app → Upload a custom app, then choose:\n{teamsZip}"),
                MbIconInformation);
            return 0;
        }
        catch (Exception e)
        {
            Message($"Developer Keys couldn't be installed.\n\n{e.Message}", MbIconError);
            return 1;
        }
    }

    public static int Uninstall(string dataDir)
    {
        if (!OperatingSystem.IsWindows()) return 1;
        using (var run = Registry.CurrentUser.OpenSubKey(RunKey, writable: true))
            run?.DeleteValue("Developer Keys", throwOnMissingValue: false);
        Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, throwOnMissingSubKey: false);
        LocalCert.Remove();
        StopInstalledCopies();
        // This exe may be the installed one, so remove the folder after it exits.
        if (Directory.Exists(InstallDir))
        {
            Process.Start(new ProcessStartInfo("cmd.exe", $"/c timeout /t 2 /nobreak >nul & rmdir /s /q \"{InstallDir}\"")
            {
                CreateNoWindow = true,
                UseShellExecute = false,
            });
        }
        Message($"Developer Keys is removed.\n\nYour encrypted vault is still in {dataDir}, and your backups in Documents\\Developer Keys Backups.", MbIconInformation);
        return 0;
    }

    /// <summary>True when a Developer Keys host already answers on this PC (so a second launch just opens it).</summary>
    public static async Task<bool> IsRunningAsync(string origin)
    {
        using var handler = new HttpClientHandler
        {
            // Our own self-signed localhost certificate, before Windows trusts it.
            ServerCertificateCustomValidationCallback = (req, _, _, _) => req.RequestUri?.Host == "localhost",
        };
        using var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(2) };
        http.DefaultRequestHeaders.Add("X-Developer-Keys", "1");
        try
        {
            using var res = await http.GetAsync($"{origin}/api/health");
            return res.IsSuccessStatusCode;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
        {
            return false;
        }
    }

    public static void OpenBrowser(string origin) => Process.Start(new ProcessStartInfo(origin) { UseShellExecute = true });

    static async Task WaitUntilRunningAsync(string origin, TimeSpan limit)
    {
        var until = DateTime.UtcNow + limit;
        while (DateTime.UtcNow < until && !await IsRunningAsync(origin)) await Task.Delay(500);
    }

    /// <summary>
    /// Windows can hold a stopped program's exe open for a moment after it exits,
    /// so the copy over it is retried for a few seconds before giving up.
    /// </summary>
    static void CopyWhenFree(string from, string to)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                File.Copy(from, to, overwrite: true);
                return;
            }
            catch (IOException) when (attempt < 20)
            {
                Thread.Sleep(250);
            }
        }
    }

    static void StopInstalledCopies()
    {
        foreach (var p in Process.GetProcessesByName("developer-keys"))
        {
            using (p)
            {
                if (p.Id == Environment.ProcessId) continue;
                try
                {
                    if (string.Equals(p.MainModule?.FileName, InstalledExe, StringComparison.OrdinalIgnoreCase))
                    {
                        p.Kill();
                        p.WaitForExit(5000);
                    }
                }
                catch (Exception e) when (e is System.ComponentModel.Win32Exception or InvalidOperationException)
                {
                    // Not ours, or already gone.
                }
            }
        }
    }

    [System.Runtime.Versioning.SupportedOSPlatform("windows")]
    static void RegisterUninstall()
    {
        using var key = Registry.CurrentUser.CreateSubKey(UninstallKey);
        key.SetValue("DisplayName", "Developer Keys");
        key.SetValue("DisplayVersion", typeof(Installer).Assembly.GetName().Version?.ToString(3) ?? "0.1.0");
        key.SetValue("Publisher", Publisher);
        key.SetValue("DisplayIcon", InstalledExe);
        key.SetValue("InstallLocation", InstallDir);
        key.SetValue("UninstallString", $"\"{InstalledExe}\" uninstall");
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        key.SetValue("EstimatedSize", (int)(new FileInfo(InstalledExe).Length / 1024), RegistryValueKind.DWord);
    }

    /// <summary>Writes the embedded Teams app package to Downloads, if the build included it.</summary>
    static string? SaveTeamsPackage()
    {
        using var zip = typeof(Installer).Assembly.GetManifestResourceStream("developer-keys-teams.zip");
        if (zip is null) return null;
        var downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        Directory.CreateDirectory(downloads);
        var path = Path.Combine(downloads, "Developer Keys for Teams.zip");
        using var file = File.Create(path);
        zip.CopyTo(file);
        return path;
    }

    const uint MbIconInformation = 0x40;
    const uint MbIconError = 0x10;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int MessageBoxW(nint hWnd, string text, string caption, uint type);

    static void Message(string text, uint icon) => MessageBoxW(0, text, "Developer Keys", icon);
}
