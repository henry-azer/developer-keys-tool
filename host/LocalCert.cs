using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace DeveloperKeys.Host;

/// <summary>
/// The HTTPS certificate for https://localhost. Teams only loads tabs over
/// HTTPS, so the host makes its own certificate and trusts it for this user.
/// The private key lives in the user's certificate store, not in a file.
/// </summary>
static class LocalCert
{
    const string Subject = "CN=Developer Keys localhost";
    static readonly TimeSpan Lifetime = TimeSpan.FromDays(730);
    static readonly TimeSpan RenewBefore = TimeSpan.FromDays(30);

    /// Returns a valid certificate, creating and trusting one if needed.
    /// Creating one shows a Windows prompt to trust it, once.
    public static X509Certificate2 Ensure()
    {
        using var my = new X509Store(StoreName.My, StoreLocation.CurrentUser);
        my.Open(OpenFlags.ReadWrite);

        var current = my.Certificates
            .Find(X509FindType.FindBySubjectDistinguishedName, Subject, validOnly: false)
            .Where(c => c.HasPrivateKey && c.NotAfter - DateTime.Now > RenewBefore)
            .OrderByDescending(c => c.NotAfter)
            .FirstOrDefault();
        if (current is not null) return current;

        var cert = Create();
        my.Add(cert);
        Trust(cert);
        return cert;
    }

    /// Removes Developer Keys certificates from the personal and trusted root stores.
    public static void Remove()
    {
        foreach (var name in new[] { StoreName.My, StoreName.Root })
        {
            using var store = new X509Store(name, StoreLocation.CurrentUser);
            store.Open(OpenFlags.ReadWrite);
            var ours = store.Certificates.Find(X509FindType.FindBySubjectDistinguishedName, Subject, false);
            if (ours.Count > 0) store.RemoveRange(ours);
        }
    }

    static X509Certificate2 Create()
    {
        using var key = RSA.Create(2048);
        var req = new CertificateRequest(Subject, key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);

        var san = new SubjectAlternativeNameBuilder();
        san.AddDnsName("localhost");
        san.AddIpAddress(IPAddress.Loopback);
        req.CertificateExtensions.Add(san.Build());
        req.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
        req.CertificateExtensions.Add(new X509KeyUsageExtension(
            X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
        req.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(
            [new Oid("1.3.6.1.5.5.7.3.1")], true)); // server authentication only

        var now = DateTimeOffset.UtcNow;
        using var ephemeral = req.CreateSelfSigned(now.AddMinutes(-5), now.Add(Lifetime));

        // Re-import so the private key is persisted in the user's key store.
        return X509CertificateLoader.LoadPkcs12(
            ephemeral.Export(X509ContentType.Pkcs12), null,
            X509KeyStorageFlags.PersistKeySet | X509KeyStorageFlags.UserKeySet);
    }

    static void Trust(X509Certificate2 cert)
    {
        using var root = new X509Store(StoreName.Root, StoreLocation.CurrentUser);
        root.Open(OpenFlags.ReadWrite);
        // Public part only. Windows asks the user to confirm this.
        root.Add(X509CertificateLoader.LoadCertificate(cert.RawData));
    }
}
