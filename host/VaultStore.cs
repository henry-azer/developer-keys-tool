using System.Security.Cryptography;
using System.Text.Json;

namespace DeveloperKeys.Host;

/// <summary>
/// Stores the encrypted vault file on disk. The host never sees a key or any
/// plaintext: it receives sealed JSON from the browser and writes it as is.
/// Every save keeps the previous file in history/, so a bad write or a buggy
/// release can be rolled back by hand.
/// </summary>
sealed class VaultStore(string dataDir)
{
    const int HistoryToKeep = 20;
    public const int MaxBytes = 20 * 1024 * 1024;

    readonly string _path = Path.Combine(dataDir, "vault.json");
    readonly string _history = Path.Combine(dataDir, "history");
    readonly Lock _gate = new();

    /// Erases the vault and its saved history. Backups in Documents are not touched.
    public void Erase()
    {
        lock (_gate)
        {
            if (File.Exists(_path)) File.Delete(_path);
            if (Directory.Exists(_history)) Directory.Delete(_history, recursive: true);
        }
    }

    public (byte[] Bytes, string ETag)? Read()
    {
        lock (_gate)
        {
            if (!File.Exists(_path)) return null;
            var bytes = File.ReadAllBytes(_path);
            return (bytes, ETagOf(bytes));
        }
    }

    public enum WriteResult { Saved, Conflict, Invalid }

    /// Writes only if the file still matches <paramref name="ifMatch"/>
    /// (null means "must not exist yet"), so two open Teams windows can't
    /// silently overwrite each other.
    public (WriteResult Result, string? ETag) Write(byte[] bytes, string? ifMatch)
    {
        if (!LooksLikeVault(bytes)) return (WriteResult.Invalid, null);

        lock (_gate)
        {
            var exists = File.Exists(_path);
            var current = exists ? ETagOf(File.ReadAllBytes(_path)) : null;
            if (current != ifMatch) return (WriteResult.Conflict, current);

            Directory.CreateDirectory(_history);
            if (exists)
            {
                File.Copy(_path, Path.Combine(_history, $"vault-{DateTime.UtcNow:yyyyMMdd-HHmmss-fff}.json"));
                Prune();
            }

            var temp = _path + ".tmp";
            using (var fs = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                fs.Write(bytes);
                fs.Flush(flushToDisk: true);
            }
            File.Move(temp, _path, overwrite: true);
            return (WriteResult.Saved, ETagOf(bytes));
        }
    }

    void Prune()
    {
        foreach (var old in Directory.GetFiles(_history, "vault-*.json")
                     .OrderByDescending(f => f, StringComparer.Ordinal)
                     .Skip(HistoryToKeep))
            File.Delete(old);
    }

    static bool LooksLikeVault(byte[] bytes)
    {
        try
        {
            using var doc = JsonDocument.Parse(bytes);
            var root = doc.RootElement;
            return root.ValueKind == JsonValueKind.Object
                && root.TryGetProperty("format", out var f) && f.GetString() == "devvault/1"
                && root.TryGetProperty("kdf", out _)
                && root.TryGetProperty("key", out _)
                && root.TryGetProperty("body", out _);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    static string ETagOf(byte[] bytes) => $"\"{Convert.ToHexStringLower(SHA256.HashData(bytes))[..32]}\"";
}
