using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace DeveloperKeys.Host;

/// <summary>
/// Unlock with Windows Hello. The page hands over the vault key (the 32-byte DEK,
/// never the master password); it is encrypted to a Windows Hello key that lives in
/// the TPM and saved as hello.bin. Encrypting needs only the public key. Decrypting
/// needs the person's fingerprint, face or Hello PIN every time, so hello.bin is
/// useless to anything that copies it off this PC or reads it without that gesture.
/// </summary>
public sealed class WindowsHello(string dataDir)
{
    public sealed class HelloException(string message, bool cancelled = false) : Exception(message)
    {
        public bool Cancelled { get; } = cancelled;
    }

    const string Provider = "Microsoft Passport Key Storage Provider";
    const int NcryptPadPkcs1 = 0x2;
    const int NcryptOverwriteKey = 0x80;
    const int NcryptAllowDecryptAndSign = 0x1 | 0x2;
    const int NcryptNgcCacheAuthMandatory = 0x1;

    readonly string _blob = Path.Combine(dataDir, "hello.bin");
    // Windows Hello key names start with the user's SID.
    readonly string _keyName = $"{(OperatingSystem.IsWindows() ? WindowsIdentity.GetCurrent().User!.Value : "")}//DeveloperKeys/VaultUnlock/v1";
    // One Windows Hello prompt at a time.
    readonly SemaphoreSlim _gate = new(1, 1);

    /// <summary>True when this PC has the Windows Hello key provider (Windows 10 and later).</summary>
    public bool Available
    {
        get
        {
            if (!OperatingSystem.IsWindows() || NCryptOpenStorageProvider(out var p, Provider, 0) != 0) return false;
            p.Dispose();
            return true;
        }
    }

    public bool Enabled => File.Exists(_blob);

    /// <summary>Creates the Hello key (Windows asks for the gesture) and seals the vault key to it.</summary>
    public Task EnableAsync(byte[] vaultKey) => Run(() =>
    {
        using var provider = OpenProvider();
        Check(NCryptCreatePersistedKey(provider, out var key, "RSA", _keyName, 0, NcryptOverwriteKey), "create the Windows Hello key");
        using (key)
        {
            SetInt(key, "Length", 2048);
            SetInt(key, "Key Usage", NcryptAllowDecryptAndSign);
            // Ask for the gesture on every unlock instead of reusing a recent one.
            if (NCryptSetProperty(key, "NgcCacheType", BitConverter.GetBytes(NcryptNgcCacheAuthMandatory), 4, 0) != 0)
                NCryptSetProperty(key, "NgcCacheTypeProperty", BitConverter.GetBytes(NcryptNgcCacheAuthMandatory), 4, 0);
            SetPrompt(key, "Turn on Windows Hello for Developer Keys");
            Check(NCryptFinalizeKey(key, 0), "create the Windows Hello key");

            var sealedKey = Crypt(key, vaultKey, encrypt: true);
            var temp = _blob + ".tmp";
            File.WriteAllBytes(temp, sealedKey);
            File.Move(temp, _blob, overwrite: true);
        }
    });

    /// <summary>Asks for the gesture and returns the vault key.</summary>
    public Task<byte[]> UnlockAsync() => Run(() =>
    {
        if (!File.Exists(_blob)) throw new HelloException("Windows Hello isn’t turned on for this vault.");
        using var provider = OpenProvider();
        var status = NCryptOpenKey(provider, out var key, _keyName, 0, 0);
        if (status != 0)
        {
            // The Hello key is gone (PIN reset, new fingerprint setup), so the sealed copy can never open again.
            File.Delete(_blob);
            throw new HelloException("Windows Hello was reset on this PC. Unlock with your master password, then turn it on again in Settings.");
        }
        using (key)
        {
            SetPrompt(key, "Unlock Developer Keys");
            return Crypt(key, File.ReadAllBytes(_blob), encrypt: false);
        }
    });

    /// <summary>Removes the sealed key and the Windows Hello key. Safe to call when it's already off.</summary>
    public void Disable()
    {
        if (File.Exists(_blob)) File.Delete(_blob);
        if (NCryptOpenStorageProvider(out var provider, Provider, 0) != 0) return;
        using (provider)
        {
            if (NCryptOpenKey(provider, out var key, _keyName, 0, 0) != 0) return;
            // NCryptDeleteKey frees the handle itself on success.
            if (NCryptDeleteKey(key, 0) == 0) key.SetHandleAsInvalid();
            key.Dispose();
        }
    }

    async Task<T> Run<T>(Func<T> work)
    {
        await _gate.WaitAsync();
        try { return await Task.Run(work); }
        finally { _gate.Release(); }
    }

    Task Run(Action work) => Run(() => { work(); return true; });

    static SafeNCryptProviderHandle OpenProvider()
    {
        Check(NCryptOpenStorageProvider(out var provider, Provider, 0), "open Windows Hello");
        return provider;
    }

    static byte[] Crypt(SafeNCryptKeyHandle key, byte[] input, bool encrypt)
    {
        var op = encrypt ? (CryptFn)NCryptEncrypt : NCryptDecrypt;
        var what = encrypt ? "seal the vault key" : "unlock with Windows Hello";
        Check(op(key, input, input.Length, 0, null, 0, out var size, NcryptPadPkcs1), what);
        var output = new byte[size];
        Check(op(key, input, input.Length, 0, output, output.Length, out size, NcryptPadPkcs1), what);
        return output[..size];
    }

    static void SetInt(SafeNCryptKeyHandle key, string property, int value) =>
        Check(NCryptSetProperty(key, property, BitConverter.GetBytes(value), 4, 0), "set up the Windows Hello key");

    /// <summary>Parents the Windows Hello dialog to the window the person is using, with a line saying why it asks.</summary>
    static void SetPrompt(SafeNCryptKeyHandle key, string reason)
    {
        var hwnd = BitConverter.GetBytes((long)GetForegroundWindow());
        NCryptSetProperty(key, "HWND Handle", hwnd, hwnd.Length, 0);
        var text = System.Text.Encoding.Unicode.GetBytes(reason + "\0");
        NCryptSetProperty(key, "Use Context", text, text.Length, 0);
    }

    static void Check(int status, string what)
    {
        if (status == 0) return;
        throw (uint)status switch
        {
            0x80090036 or 0x800704C7 => new HelloException("Windows Hello was cancelled.", cancelled: true),
            0x80090029 or 0x80090030 or 0x80090031 =>
                new HelloException("Windows Hello isn’t set up on this PC. Set it up in Windows Settings → Accounts → Sign-in options, then try again."),
            _ => new HelloException($"Couldn’t {what} (error 0x{status:X8})."),
        };
    }

    delegate int CryptFn(SafeNCryptKeyHandle key, byte[] input, int inputSize, nint padding, byte[]? output, int outputSize, out int result, int flags);

    [DllImport("ncrypt.dll", CharSet = CharSet.Unicode)]
    static extern int NCryptOpenStorageProvider(out SafeNCryptProviderHandle provider, string name, int flags);

    [DllImport("ncrypt.dll", CharSet = CharSet.Unicode)]
    static extern int NCryptCreatePersistedKey(SafeNCryptProviderHandle provider, out SafeNCryptKeyHandle key, string algorithm, string keyName, int legacySpec, int flags);

    [DllImport("ncrypt.dll", CharSet = CharSet.Unicode)]
    static extern int NCryptOpenKey(SafeNCryptProviderHandle provider, out SafeNCryptKeyHandle key, string keyName, int legacySpec, int flags);

    [DllImport("ncrypt.dll", CharSet = CharSet.Unicode)]
    static extern int NCryptSetProperty(SafeNCryptHandle handle, string property, byte[] value, int size, int flags);

    [DllImport("ncrypt.dll")]
    static extern int NCryptFinalizeKey(SafeNCryptKeyHandle key, int flags);

    [DllImport("ncrypt.dll")]
    static extern int NCryptDeleteKey(SafeNCryptKeyHandle key, int flags);

    [DllImport("ncrypt.dll")]
    static extern int NCryptEncrypt(SafeNCryptKeyHandle key, byte[] input, int inputSize, nint padding, byte[]? output, int outputSize, out int result, int flags);

    [DllImport("ncrypt.dll")]
    static extern int NCryptDecrypt(SafeNCryptKeyHandle key, byte[] input, int inputSize, nint padding, byte[]? output, int outputSize, out int result, int flags);

    [DllImport("user32.dll")]
    static extern nint GetForegroundWindow();
}
