using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace DeveloperKeys.Host;

/// <summary>
/// Smart add: maps pasted text into a key using the Claude Code CLI already
/// installed and signed in on this PC. The text goes to Anthropic through the
/// user's own sign-in; Developer Keys sends nothing on its own. The CLI runs with
/// every tool turned off, no saved session and an empty working folder.
/// </summary>
public static class ClaudeCli
{
    static (bool available, string? reason, DateTime at)? cached;
    static readonly SemaphoreSlim gate = new(1, 1);

    /// <summary>Whether `claude` is on PATH and signed in. Cached for a minute.</summary>
    public static async Task<(bool available, string? reason)> StatusAsync()
    {
        if (cached is { } c && DateTime.UtcNow - c.at < TimeSpan.FromMinutes(1)) return (c.available, c.reason);
        var (code, stdout, _) = await RunAsync(["auth", "status"], null, TimeSpan.FromSeconds(15));
        (bool, string?) result;
        if (code is null) result = (false, "Claude Code isn't installed.");
        else
        {
            try
            {
                using var doc = JsonDocument.Parse(stdout);
                var loggedIn = doc.RootElement.TryGetProperty("loggedIn", out var v) && v.GetBoolean();
                result = loggedIn ? (true, null) : (false, "Claude Code isn't signed in.");
            }
            catch (JsonException)
            {
                result = (false, "Couldn't read Claude Code's sign-in status.");
            }
        }
        cached = (result.Item1, result.Item2, DateTime.UtcNow);
        return result;
    }

    /// <summary>Runs one prompt and returns the model's text answer.</summary>
    public static async Task<string> AskAsync(string prompt)
    {
        await gate.WaitAsync();
        try
        {
            var (code, stdout, stderr) = await RunAsync(
                ["-p", "--tools", "", "--no-session-persistence", "--strict-mcp-config", "--output-format", "json"],
                prompt,
                TimeSpan.FromSeconds(120));
            if (code is null) throw new InvalidOperationException("Claude Code isn't installed.");
            using var doc = JsonDocument.Parse(stdout);
            var root = doc.RootElement;
            var text = root.TryGetProperty("result", out var r) ? r.GetString() ?? "" : "";
            if (root.TryGetProperty("is_error", out var e) && e.GetBoolean())
                throw new InvalidOperationException(string.IsNullOrWhiteSpace(text) ? stderr.Trim() : text);
            return text;
        }
        finally
        {
            gate.Release();
        }
    }

    static async Task<(int? code, string stdout, string stderr)> RunAsync(string[] args, string? stdin, TimeSpan timeout)
    {
        // An empty folder, so no project files or CLAUDE.md are read.
        var workDir = Path.Combine(Path.GetTempPath(), "developer-keys-smart-add");
        Directory.CreateDirectory(workDir);
        var psi = new ProcessStartInfo
        {
            // npm installs claude as a .cmd shim, so go through cmd on Windows.
            FileName = OperatingSystem.IsWindows() ? "cmd.exe" : "claude",
            WorkingDirectory = workDir,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        if (OperatingSystem.IsWindows())
        {
            psi.ArgumentList.Add("/c");
            psi.ArgumentList.Add("claude");
        }
        foreach (var a in args) psi.ArgumentList.Add(a);

        Process? p;
        try
        {
            p = Process.Start(psi);
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return (null, "", "");
        }
        if (p is null) return (null, "", "");
        using var _ = p;
        if (stdin is not null)
        {
            await p.StandardInput.WriteAsync(stdin);
        }
        p.StandardInput.Close();
        var outTask = p.StandardOutput.ReadToEndAsync();
        var errTask = p.StandardError.ReadToEndAsync();
        using var cts = new CancellationTokenSource(timeout);
        try
        {
            await p.WaitForExitAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            p.Kill(entireProcessTree: true);
            throw new TimeoutException("Claude Code took too long to answer.");
        }
        var stdout = await outTask;
        var stderr = await errTask;
        // cmd reports a missing command with exit code 9009.
        if (p.ExitCode == 9009) return (null, stdout, stderr);
        return (p.ExitCode, stdout, stderr);
    }
}
