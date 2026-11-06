"""Run FridgeMate over HTTPS so a phone's browser allows the camera.

Browsers (Android Chrome, iOS Safari) only expose the camera on secure pages: https:// or http://localhost.
A phone that opens http://192.168.x.x:8000 therefore gets no camera at all. This script creates a local
self-signed certificate that is valid for this computer's LAN addresses and starts the normal app with it.

    python run_https.py                 # https://<your-LAN-IP>:8443
    python run_https.py --port 9443     # another port
    CERT_HOSTS=myhost.local python run_https.py   # extra names/IPs to put in the certificate

The first time the phone opens the link Chrome warns that the certificate is not trusted (it is your own).
Tap "Advanced" -> "Proceed to <ip> (unsafe)". The camera works after that. For a warning-free link use an
https tunnel instead (ngrok http 8000 / cloudflared) - see the README.
Your database, users and items are untouched: this only changes how the server is reached.
"""
import argparse, datetime as dt, ipaddress, os, socket, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CERT_DIR = Path(os.getenv("CERT_DIR", HERE / "certs"))


def lan_ips() -> list[str]:
    """IPv4 addresses of this computer that a phone on the same Wi-Fi could use."""
    found: set[str] = set()
    for target in ("8.8.8.8", "10.255.255.255", "192.168.255.255"):  # UDP connect sends nothing; it just picks the route
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s: s.connect((target, 80)); found.add(s.getsockname()[0])
        except OSError: pass
    try: found.update(i[4][0] for i in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET))
    except OSError: pass
    return sorted(ip for ip in found if not ip.startswith(("127.", "169.254.")) and ip != "0.0.0.0")


def wanted_hosts() -> list[str]:
    extra = [h.strip() for h in os.getenv("CERT_HOSTS", "").split(",") if h.strip()]
    return sorted(set(["localhost", "127.0.0.1", *lan_ips(), *extra]))


def _san(hosts):
    from cryptography import x509
    out = []
    for h in hosts:
        try: out.append(x509.IPAddress(ipaddress.ip_address(h)))
        except ValueError: out.append(x509.DNSName(h))
    return out


def ensure_cert(cert_dir: Path, hosts: list[str], valid_days: int = 397) -> tuple[Path, Path]:
    """Create (or reuse) a self-signed cert covering `hosts`. Reused while it still covers every host and has >30 days left,
    so the phone is not asked to trust a new certificate on every start."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
    cert_dir.mkdir(parents=True, exist_ok=True); crt, key = cert_dir / "fridgemate-local.crt", cert_dir / "fridgemate-local.key"
    if crt.exists() and key.exists():
        try:
            c = x509.load_pem_x509_certificate(crt.read_bytes())
            have = {str(v.value) for v in c.extensions.get_extension_for_class(x509.SubjectAlternativeName).value}
            left = c.not_valid_after_utc - dt.datetime.now(dt.timezone.utc)
            if set(hosts) <= have and left > dt.timedelta(days=30): return crt, key
        except Exception: pass  # unreadable/old cert -> make a new one
    k = ec.generate_private_key(ec.SECP256R1()); name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "FridgeMate local HTTPS")])
    now = dt.datetime.now(dt.timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(k.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - dt.timedelta(days=1)).not_valid_after(now + dt.timedelta(days=valid_days))
            .add_extension(x509.SubjectAlternativeName(_san(hosts)), critical=False)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
            .sign(k, hashes.SHA256()))
    crt.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key.write_bytes(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    try: key.chmod(0o600)
    except OSError: pass
    return crt, key


def banner(port: int, ips: list[str]):
    urls = [f"https://{ip}:{port}" for ip in ips] or [f"https://localhost:{port}"]
    print("\n" + "=" * 64 + "\n FridgeMate over HTTPS (camera-ready for phones)\n" + "=" * 64)
    print(" On this computer :", f"https://localhost:{port}")
    for u in urls: print(" On your phone    :", u, " (same Wi-Fi)")
    print("\n First visit on the phone: Chrome says 'Your connection is not private' (it is your own certificate)."
          "\n Tap  Advanced  ->  Proceed to <address> (unsafe), then Scan -> Start camera -> Allow.")
    print(" Windows: if the phone cannot connect, allow Python through the firewall (Private networks).")
    pub = os.getenv("PUBLIC_URL", "").strip()
    if pub and not pub.startswith("https://"): print(f"\n NOTE: PUBLIC_URL is '{pub}'. Labels will use it; unset it (or make it https) so QR codes open the secure address.")
    try:  # QR of the phone URL so you can open it with the phone's camera app
        import qrcode; q = qrcode.QRCode(border=1); q.add_data(urls[0]); q.make(fit=True); print("\n Scan this with your phone's camera app to open the link:\n"); q.print_ascii(invert=True)
    except Exception: pass
    print("=" * 64 + "\n", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0]); ap.add_argument("--port", type=int, default=int(os.getenv("HTTPS_PORT", "8443"))); ap.add_argument("--host", default="0.0.0.0")
    a = ap.parse_args(); os.chdir(HERE); sys.path.insert(0, str(HERE))
    try: import cryptography  # noqa: F401
    except ImportError: sys.exit("Missing package. Run:  pip install -r requirements.txt   (needs 'cryptography')")
    hosts = wanted_hosts(); crt, key = ensure_cert(CERT_DIR, hosts); banner(a.port, [h for h in hosts if h not in ("localhost", "127.0.0.1") and ":" not in h and h[0].isdigit()])
    import uvicorn
    uvicorn.run("main:app", host=a.host, port=a.port, ssl_certfile=str(crt), ssl_keyfile=str(key), proxy_headers=True, forwarded_allow_ips="*")


if __name__ == "__main__": main()
