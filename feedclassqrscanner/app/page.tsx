"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ScanResponse =
  | {
      found: true;
      badge: {
        id: number;
        qrCode: string;
        name: string;
        status: string;
        role: string;
      };
      source: string;
      scannedAt: string;
    }
  | {
      found: false;
      message: string;
      source: string;
    };

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const zxingReaderRef = useRef<any>(null);
  const zxingControlsRef = useRef<any>(null);
  const scanningRef = useRef(true);
  const busyRef = useRef(false);
  const lastCodeRef = useRef<string | null>(null);

  const [status, setStatus] = useState("Idle");
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [scanningEnabled, setScanningEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  const detectorSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return "BarcodeDetector" in window;
  }, []);

  useEffect(() => {
    scanningRef.current = scanningEnabled;
  }, [scanningEnabled]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function startWithBarcodeDetector() {
      try {
        setStatus("Requesting camera access");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStatus("Camera ready");
        }

        detectorRef.current = new (window as any).BarcodeDetector({
          formats: ["qr_code"],
        });

        intervalId = setInterval(async () => {
          if (!scanningRef.current || busyRef.current) return;
          if (!videoRef.current || !detectorRef.current) return;

          try {
            const barcodes = await detectorRef.current.detect(videoRef.current);
            if (!barcodes || barcodes.length === 0) return;

            const rawValue = barcodes[0]?.rawValue || "";
            if (!rawValue || rawValue === lastCodeRef.current) return;

            await handleScan(rawValue);
          } catch (scanError) {
            console.error(scanError);
          }
        }, 500);
      } catch (err) {
        console.error(err);
        setError("Camera access was denied or unavailable.");
        setStatus("Camera unavailable");
      }
    }

    async function startWithZXing() {
      try {
        setStatus("Requesting camera access");
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        zxingReaderRef.current = reader;

        if (!videoRef.current) {
          setError("Camera preview is not available yet.");
          setStatus("Camera unavailable");
          return;
        }

        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current,
          async (result: any) => {
            if (!scanningRef.current || busyRef.current) return;
            const rawValue =
              result?.getText?.() ?? result?.text ?? result?.toString?.() ?? "";
            if (!rawValue || rawValue === lastCodeRef.current) return;
            await handleScan(rawValue);
          }
        );

        zxingControlsRef.current = controls;
        setStatus("Camera ready");
      } catch (err) {
        console.error(err);
        setError("Camera access was denied or unavailable.");
        setStatus("Camera unavailable");
      }
    }

    if (detectorSupported) {
      startWithBarcodeDetector();
    } else {
      startWithZXing();
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (zxingControlsRef.current) {
        zxingControlsRef.current.stop();
      }
      if (zxingReaderRef.current?.reset) {
        zxingReaderRef.current.reset();
      }
    };
  }, [detectorSupported]);

  async function handleScan(code: string) {
    busyRef.current = true;
    lastCodeRef.current = code;
    setBusy(true);
    setLastCode(code);
    setStatus("Checking badge");
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode: code }),
      });

      const payload = (await response.json()) as ScanResponse;
      if (!response.ok) {
        setScanResult(payload);
        setStatus("Badge not found");
        return;
      }

      setScanResult(payload);
      setStatus("Badge verified");
    } catch (err) {
      console.error(err);
      setError("Failed to reach the scanner API.");
      setStatus("Network error");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleManualSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!manualCode.trim()) return;
    await handleScan(manualCode.trim());
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(239,71,111,0.25),_transparent_55%),radial-gradient(circle_at_20%_80%,_rgba(255,183,3,0.2),_transparent_60%)]">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,_rgba(17,17,17,0.04)_0%,_rgba(17,17,17,0)_40%,_rgba(17,17,17,0.06)_100%)]" />
      <main className="relative mx-auto flex min-h-screen w-full max-w-none flex-col gap-12 px-8 py-14 sm:px-12 lg:px-20">
        <section className="w-full">
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-black/60">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            Feedclass QR Scanner
          </div>
          <h1 className="mt-3 text-4xl font-semibold leading-tight text-[var(--surface-contrast)] sm:text-5xl">
            Feedclass QR Scanner.
            <span className="block font-serif text-[var(--accent-strong)]">
              Validate in real time.
            </span>
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-black/70">
            Point the camera at a QR badge to check against the MySQL roster. The
            demo falls back to dummy data when the database is offline.
          </p>
        </section>

        <section className="grid w-full grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start lg:gap-16">
          <div className="flex w-full flex-col gap-6">
            <div className="min-h-[420px] rounded-3xl border border-black/10 bg-[var(--surface)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.12)] lg:min-h-[520px]">
              <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-black/50">
                  Scanner Status
                </p>
                <p className="text-xl font-medium text-black">{status}</p>
              </div>
              <button
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  scanningEnabled
                    ? "bg-black text-white hover:bg-black/85"
                    : "bg-white text-black ring-1 ring-black/20 hover:bg-black/5"
                }`}
                onClick={() => setScanningEnabled((prev) => !prev)}
                type="button"
              >
                {scanningEnabled ? "Pause" : "Resume"}
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <div className="flex items-center justify-between rounded-2xl bg-black/5 px-4 py-3">
                <span className="text-sm text-black/60">Detector</span>
                <span className="text-sm font-semibold text-black">
                  {detectorSupported ? "BarcodeDetector" : "ZXing (fallback)"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-black/5 px-4 py-3">
                <span className="text-sm text-black/60">Last QR Code</span>
                <span className="text-sm font-semibold text-black">
                  {lastCode || "—"}
                </span>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form
              onSubmit={handleManualSubmit}
              className="mt-6 flex flex-col gap-3"
            >
              <label className="text-sm font-semibold text-black">
                Manual entry
              </label>
              <div className="flex gap-3">
                <input
                  className="flex-1 rounded-2xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="BADGE-ALPHA-001"
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                />
                <button
                  className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95"
                  type="submit"
                >
                  Check
                </button>
              </div>
            </form>
          </div>
          </div>

          <div className="flex w-full flex-col gap-6">
            <div className="relative h-[420px] w-full max-w-4xl overflow-hidden rounded-[32px] border border-black/10 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.25)] lg:h-[520px]">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[70%] w-[70%] rounded-3xl border border-white/40">
                <div className="absolute -left-1 -top-1 h-6 w-6 border-l-4 border-t-4 border-white" />
                <div className="absolute -right-1 -top-1 h-6 w-6 border-r-4 border-t-4 border-white" />
                <div className="absolute -bottom-1 -left-1 h-6 w-6 border-b-4 border-l-4 border-white" />
                <div className="absolute -bottom-1 -right-1 h-6 w-6 border-b-4 border-r-4 border-white" />
                <div className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-[linear-gradient(90deg,_transparent,_rgba(255,255,255,0.9),_transparent)]" />
              </div>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full">
          <div className="rounded-3xl border border-black/10 bg-[var(--surface)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-black/50">
                  Validation
                </p>
                <p className="text-2xl font-semibold text-black">
                  {scanResult
                    ? scanResult.found
                      ? "Access granted"
                      : "Access denied"
                    : "Awaiting scan"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                  scanResult
                    ? scanResult.found
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                    : "bg-black/10 text-black/60"
                }`}
              >
                {scanResult
                  ? scanResult.found
                    ? "Verified"
                    : "Denied"
                  : "Idle"}
              </span>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-black/5 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-black/50">
                  Name
                </p>
                <p className="text-lg font-semibold text-black">
                  {scanResult && scanResult.found
                    ? scanResult.badge.name
                    : "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-black/5 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-black/50">
                  Role
                </p>
                <p className="text-lg font-semibold text-black">
                  {scanResult && scanResult.found
                    ? scanResult.badge.role
                    : "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-black/5 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-black/50">
                  Status
                </p>
                <p className="text-lg font-semibold text-black">
                  {scanResult && scanResult.found
                    ? scanResult.badge.status
                    : "—"}
                </p>
              </div>
              <div className="rounded-2xl bg-black/5 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-black/50">
                  Source
                </p>
                <p className="text-lg font-semibold text-black">
                  {scanResult ? scanResult.source : "—"}
                </p>
              </div>
            </div>

            <p className="mt-6 text-sm text-black/60">
              Tip: Try dummy codes like <strong>BADGE-ALPHA-001</strong> or
              <strong> BADGE-BETA-014</strong>.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
