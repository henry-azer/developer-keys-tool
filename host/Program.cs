using System.Net;
using DeveloperKeys.Host;
using Microsoft.Extensions.FileProviders;
using Microsoft.Win32;

// Developer Keys host: serves the Developer Keys web app on https://localhost:53917 for
// this machine only, and stores the encrypted vault file on disk.
//
//   developer-keys-setup.exe        one-click install (see Installer.cs)
//   developer-keys.Host             run the host (creates + trusts the certificate on first run)
//   developer-keys.Host install     also start the host when you sign in to Windows
//   developer-keys.Host uninstall   remove Developer Keys: autostart, certificate, app files (keeps your vault)

const int Port = 53917;
var origin = $"https://localhost:{Port}";
var dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Developer Keys");
// First run after the rename: copy the DevVault data across. The old folder is never changed.
LegacyDevVault.CopyIfMissing(
    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DevVault"), dataDir);
Directory.CreateDirectory(dataDir);

if (Installer.IsSetup()) return await Installer.InstallAsync(origin);

switch (args.FirstOrDefault())
{
    case "install":
        LocalCert.Ensure();
        SetAutostart(true);
        Console.WriteLine($"Developer Keys will start when you sign in. Data folder: {dataDir}");
        return 0;
    case "uninstall":
        return Installer.Uninstall(dataDir);
}

// Opening Developer Keys again while it runs just shows it.
if (await Installer.IsRunningAsync(origin))
{
    Installer.OpenBrowser(origin);
    return 0;
}

var cert = LocalCert.Ensure();
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
    WebRootPath = Path.Combine(AppContext.BaseDirectory, "app"),
});
builder.WebHost.ConfigureKestrel(k =>
{
    k.AddServerHeader = false;
    k.Limits.MaxRequestBodySize = VaultStore.MaxBytes;
    // Loopback only: nothing on the network can reach the host.
    k.Listen(IPAddress.Loopback, Port, o => o.UseHttps(cert));
});

var app = builder.Build();
var store = new VaultStore(dataDir);
var hello = new WindowsHello(dataDir);

// Teams, Outlook and the Microsoft 365 app may frame the tab; nothing else may.
const string FrameAncestors =
    "'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.cloud.microsoft " +
    "https://*.office.com https://outlook.office.com https://outlook.office365.com https://*.skype.com";

app.Use(async (ctx, next) =>
{
    // Blocks DNS rebinding: a hostile site pointing its own name at 127.0.0.1.
    var host = ctx.Request.Host.Host;
    if (host is not ("localhost" or "127.0.0.1"))
    {
        ctx.Response.StatusCode = StatusCodes.Status421MisdirectedRequest;
        return;
    }

    var h = ctx.Response.Headers;
    h.ContentSecurityPolicy =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
        $"connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors {FrameAncestors}";
    h["Referrer-Policy"] = "no-referrer";
    h["X-Content-Type-Options"] = "nosniff";
    h["Cross-Origin-Resource-Policy"] = "same-origin";

    if (ctx.Request.Path.StartsWithSegments("/api"))
    {
        // Other websites can't set a custom header without a CORS preflight,
        // and the host never answers preflights, so only our own page gets in.
        if (ctx.Request.Headers["X-Developer-Keys"] != "1" ||
            (ctx.Request.Headers.Origin is { Count: > 0 } o && o != origin))
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
        h.CacheControl = "no-store";
    }
    await next();
});

app.MapGet("/api/health", () => Results.Ok(new { app = "Developer Keys", version = typeof(VaultStore).Assembly.GetName().Version?.ToString(3) }));

app.MapGet("/api/vault", (HttpContext ctx) =>
{
    if (store.Read() is not var (bytes, etag)) return Results.NotFound();
    ctx.Response.Headers.ETag = etag;
    return Results.Bytes(bytes, "application/json");
});

app.MapDelete("/api/vault", () =>
{
    store.Erase();
    hello.Disable();
    return Results.NoContent();
});

// Windows Hello: the body is the vault key going in, or coming back out after the gesture.
app.MapGet("/api/hello", () => Results.Ok(new { available = hello.Available, enabled = hello.Enabled }));

app.MapPut("/api/hello", async (HttpContext ctx) =>
{
    using var ms = new MemoryStream();
    await ctx.Request.Body.CopyToAsync(ms);
    var key = ms.ToArray();
    if (key.Length != 32) return Results.BadRequest();
    try
    {
        await hello.EnableAsync(key);
        return Results.NoContent();
    }
    catch (WindowsHello.HelloException e)
    {
        return Results.Problem(e.Message, statusCode: e.Cancelled ? StatusCodes.Status409Conflict : StatusCodes.Status422UnprocessableEntity);
    }
    finally
    {
        Array.Clear(key);
    }
});

app.MapPost("/api/hello/unlock", async () =>
{
    try
    {
        return Results.Bytes(await hello.UnlockAsync(), "application/octet-stream");
    }
    catch (WindowsHello.HelloException e)
    {
        return Results.Problem(e.Message, statusCode: e.Cancelled ? StatusCodes.Status409Conflict : StatusCodes.Status422UnprocessableEntity);
    }
});

app.MapDelete("/api/hello", () =>
{
    hello.Disable();
    return Results.NoContent();
});

app.MapPut("/api/vault", async (HttpContext ctx) =>
{
    using var ms = new MemoryStream();
    await ctx.Request.Body.CopyToAsync(ms);
    // If-Match: "<etag>" to replace; If-None-Match: * to create the first vault.
    var ifMatch = ctx.Request.Headers.IfNoneMatch == "*" ? null : ctx.Request.Headers.IfMatch.ToString();
    if (ifMatch == "") return Results.StatusCode(StatusCodes.Status428PreconditionRequired);

    var (result, etag) = store.Write(ms.ToArray(), ifMatch);
    if (etag is not null) ctx.Response.Headers.ETag = etag;
    return result switch
    {
        VaultStore.WriteResult.Saved => Results.NoContent(),
        VaultStore.WriteResult.Conflict => Results.StatusCode(StatusCodes.Status412PreconditionFailed),
        _ => Results.BadRequest("Not a Developer Keys file"),
    };
});

// Encrypted backups are written to Documents\Developer Keys Backups, because Teams
// tabs can't reliably trigger browser downloads.
var backupDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Developer Keys Backups");
LegacyDevVault.CopyIfMissing(
    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "DevVault Backups"), backupDir);
app.MapPost("/api/backups", async (HttpContext ctx, string? name) =>
{
    using var ms = new MemoryStream();
    await ctx.Request.Body.CopyToAsync(ms);
    var bytes = ms.ToArray();
    if (bytes.Length < 64) return Results.BadRequest("Empty backup");

    var safe = string.Concat((name ?? "developer-keys").Where(c => char.IsLetterOrDigit(c) || c is '-' or '_'));
    if (safe.Length == 0) safe = "developer-keys";
    Directory.CreateDirectory(backupDir);
    var path = Path.Combine(backupDir, $"{safe}-{DateTime.Now:yyyy-MM-dd-HHmmss}.dkbackup");
    await File.WriteAllBytesAsync(path, bytes);
    return Results.Ok(new { path });
});

// Automatic backup: a copy of the encrypted vault file (it opens with the master
// password), replaced after every save. Written to a temp file first, then swapped in.
app.MapPut("/api/backups/auto", async (HttpContext ctx) =>
{
    using var ms = new MemoryStream();
    await ctx.Request.Body.CopyToAsync(ms);
    var bytes = ms.ToArray();
    if (bytes.Length < 64 || bytes[0] != (byte)'{') return Results.BadRequest("Not a Developer Keys file");
    Directory.CreateDirectory(backupDir);
    var path = Path.Combine(backupDir, "Developer Keys auto-backup.dkvault");
    var temp = path + ".tmp";
    await File.WriteAllBytesAsync(temp, bytes);
    File.Move(temp, path, overwrite: true);
    return Results.Ok(new { path });
});

// Smart add, through the Claude Code CLI on this PC (see ClaudeCli.cs).
app.MapGet("/api/ai/status", async () =>
{
    var (available, reason) = await ClaudeCli.StatusAsync();
    return Results.Ok(new { available, reason });
});
app.MapPost("/api/ai/ask", async (HttpContext ctx) =>
{
    using var reader = new StreamReader(ctx.Request.Body);
    var prompt = await reader.ReadToEndAsync();
    if (prompt.Length is 0 or > 20_000) return Results.BadRequest("Prompt is empty or too long");
    if (!(await ClaudeCli.StatusAsync()).available) return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    try
    {
        return Results.Ok(new { text = await ClaudeCli.AskAsync(prompt) });
    }
    catch (Exception e) when (e is InvalidOperationException or TimeoutException or System.Text.Json.JsonException)
    {
        return Results.Problem(e.Message, statusCode: StatusCodes.Status502BadGateway);
    }
});

app.MapPost("/api/backups/open-folder", () =>
{
    Directory.CreateDirectory(backupDir);
    if (OperatingSystem.IsWindows())
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", $"\"{backupDir}\"") { UseShellExecute = true });
    return Results.NoContent();
});

var webRoot = app.Environment.WebRootPath;
if (Directory.Exists(webRoot))
{
    app.UseDefaultFiles();
    app.UseStaticFiles(new StaticFileOptions { FileProvider = new PhysicalFileProvider(webRoot) });
}
else
{
    app.MapGet("/", () => Results.Text("Developer Keys host is running, but the web app isn't built. Run `npm run build` in web/."));
}

Console.WriteLine($"Developer Keys running at {origin}  (data: {dataDir})");
app.Run();
return 0;

static void SetAutostart(bool on)
{
    if (!OperatingSystem.IsWindows()) return;
    using var run = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", writable: true)!;
    if (on) run.SetValue("Developer Keys", $"\"{Environment.ProcessPath}\"");
    else run.DeleteValue("Developer Keys", throwOnMissingValue: false);
}
