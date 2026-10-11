// Native Windows SIP verifies the PE digest; SignedCms verifies the embedded signature
// independently of chain trust. No certificate is installed in any trust store.
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.Pkcs;
using System.Security.Cryptography.X509Certificates;

namespace MineDock.Signing {
    public sealed class IntegrityResult {
        public X509Certificate2 Certificate;
        public bool Rfc3161TimestampPresent;
    }
    public static class AuthenticodeIntegrity {
        const string Sha256 = "2.16.840.1.101.3.4.2.1";
        [StructLayout(LayoutKind.Sequential)] struct Blob { public uint Size; public IntPtr Data; }
        [StructLayout(LayoutKind.Sequential)] struct Algorithm { public IntPtr Oid; public Blob Parameters; }
        [StructLayout(LayoutKind.Sequential)] struct Attribute { public IntPtr Oid; public Blob Value; }
        [StructLayout(LayoutKind.Sequential)] struct Indirect { public Attribute Data; public Algorithm DigestAlgorithm; public Blob Digest; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct Subject {
            public uint Size; public IntPtr Type; public IntPtr File;
            [MarshalAs(UnmanagedType.LPWStr)] public string FileName;
            [MarshalAs(UnmanagedType.LPWStr)] public string DisplayName;
            public uint Reserved1; public uint Version; public IntPtr Provider;
            public Algorithm DigestAlgorithm;
            public uint Flags, Encoding, Reserved2, CapiSettings, SecuritySettings, Index, UnionChoice;
            public IntPtr Union, ClientData;
        }
        [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool CryptSIPRetrieveSubjectGuid(string fileName, IntPtr file, out Guid type);
        [DllImport("crypt32.dll", SetLastError = true)]
        static extern bool CryptSIPGetSignedDataMsg(ref Subject subject, out uint encoding, uint index, ref uint size, byte[] data);
        [DllImport("crypt32.dll", SetLastError = true)]
        static extern bool CryptSIPVerifyIndirectData(ref Subject subject, ref Indirect data);
        [DllImport("crypt32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
        static extern bool CryptDecodeObjectEx(uint encoding, string type, byte[] encoded, uint length, uint flags, IntPtr parameters, out IntPtr decoded, ref uint size);
        [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
        static void Require(bool ok, string operation) {
            if (!ok) throw new CryptographicException(operation + " failed (Windows error " + Marshal.GetLastWin32Error() + ").");
        }
        public static IntegrityResult Verify(string path) {
            Guid type;
            Require(CryptSIPRetrieveSubjectGuid(path, IntPtr.Zero, out type), "PE subject lookup");
            IntPtr guid = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Guid)));
            IntPtr oid = Marshal.StringToCoTaskMemAnsi(Sha256);
            IntPtr decoded = IntPtr.Zero;
            try {
                Marshal.StructureToPtr(type, guid, false);
                Subject subject = new Subject {
                    Size = (uint)Marshal.SizeOf(typeof(Subject)), Type = guid,
                    File = new IntPtr(-1), FileName = path, Encoding = 0x10001,
                    DigestAlgorithm = new Algorithm { Oid = oid }
                };
                uint size = 0, encoding;
                Require(CryptSIPGetSignedDataMsg(ref subject, out encoding, 0, ref size, null), "Embedded signature lookup");
                if (size == 0 || size > 16 * 1024 * 1024) throw new CryptographicException("Invalid embedded signature size.");
                byte[] signature = new byte[size];
                Require(CryptSIPGetSignedDataMsg(ref subject, out encoding, 0, ref size, signature), "Embedded signature read");
                SignedCms cms = new SignedCms();
                cms.Decode(signature);
                if (cms.SignerInfos.Count != 1) throw new CryptographicException("Expected one SHA-256 signer.");
                SignerInfo signer = cms.SignerInfos[0];
                if (signer.DigestAlgorithm.Value != Sha256 || cms.ContentInfo.ContentType.Value != "1.3.6.1.4.1.311.2.1.4")
                    throw new CryptographicException("Expected Authenticode with SHA-256.");
                cms.CheckSignature(true); // Signature only: intentionally no chain-trust assertion.
                byte[] content = cms.ContentInfo.Content;
                uint decodedSize = 0;
                Require(CryptDecodeObjectEx(0x10001, "1.3.6.1.4.1.311.2.1.4", content, (uint)content.Length, 0x8000, IntPtr.Zero, out decoded, ref decodedSize), "Indirect digest decode");
                Indirect indirect = (Indirect)Marshal.PtrToStructure(decoded, typeof(Indirect));
                if (Marshal.PtrToStringAnsi(indirect.DigestAlgorithm.Oid) != Sha256)
                    throw new CryptographicException("The file digest must use SHA-256.");
                Require(CryptSIPVerifyIndirectData(ref subject, ref indirect), "PE file digest verification");
                bool timestamp = false;
                foreach (CryptographicAttributeObject attribute in signer.UnsignedAttributes)
                    if (attribute.Oid.Value == "1.3.6.1.4.1.311.3.3.1") timestamp = true;
                if (signer.Certificate == null) throw new CryptographicException("Missing signer certificate.");
                return new IntegrityResult { Certificate = signer.Certificate, Rfc3161TimestampPresent = timestamp };
            }
            finally {
                if (decoded != IntPtr.Zero) LocalFree(decoded);
                Marshal.FreeHGlobal(guid); Marshal.FreeCoTaskMem(oid);
            }
        }
    }
}
