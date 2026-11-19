"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { LIVE, errorText, useDoorSignIn } from "@/lib/backend";
import { gsap, motionOK, useSwap } from "@/lib/gsap";
import Notch from "../openings/[id]/Notch";

// The sign-in screen (owner's design, 19 Nov 2026): the board with a "Sign in" tab, AURA's
// card on the left and the welcome form on the right. Clerk does the signing in (the same
// accounts as AURA): email + password, and a small email-code reset behind "Forgot password?".
// Shown over everything (fixed), so the top bar never sits above it - both when a signed-out
// visitor opens any address (src/lib/backend.tsx) and on /signin.

type Step = "in" | "forgot" | "reset";

const WORDS: Record<Step, [string, string]> = {
  in: ["Welcome back", "Sign in to your talent acquisition desk."],
  forgot: ["Reset password", "We will email you a code to set a new one."],
  reset: ["Enter the code", "We emailed you a code. Enter it and choose a new password."],
};

const ICON = "size-[max(1rem,14px)] shrink-0 text-ink-3";
const SVG = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const MailIcon = () => (
  <svg {...SVG} className={ICON}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m21 7.5-8.2 5.2a1.5 1.5 0 0 1-1.6 0L3 7.5" />
  </svg>
);
const LockIcon = () => (
  <svg {...SVG} className={ICON}>
    <rect x="4.5" y="11" width="15" height="9.5" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
const KeyIcon = () => (
  <svg {...SVG} className={ICON}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 8-8m-3 3 3 3" />
  </svg>
);
const EyeIcon = ({ off }: { off: boolean }) => (
  <svg {...SVG} className="size-[max(1.125rem,15px)]">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="m4 4 16 16" />}
  </svg>
);

/** One rounded field: an icon, the text box, and optionally something at the right edge. */
function Field({ icon, end, ...input }: { icon: ReactNode; end?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex h-[max(3.75rem,48px)] w-full items-center gap-3.5 rounded-full bg-canvas px-[max(1.5rem,16px)] ring-brand/30 transition-shadow focus-within:ring-2">
      {icon}
      <input
        {...input}
        className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3 focus:outline-none"
      />
      {end}
    </label>
  );
}

export default function LoginScreen() {
  const { isLoaded, signIn, setActive } = useDoorSignIn();
  const [step, setStep] = useState<Step>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const keep = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ bad: boolean; text: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  useSwap(panel, step);

  // What "Keep me signed in" was last time (src/lib/backend.tsx acts on it).
  useEffect(() => {
    try {
      if (keep.current) keep.current.checked = localStorage.getItem("ta-ui:keep") !== "0";
    } catch {}
  }, []);

  // AURA's light under the card breathes slowly; never smaller than drawn. Less motion: still.
  useEffect(() => {
    const el = glow.current;
    if (!el || !motionOK()) return;
    const t = gsap.to(el, { opacity: 0.8, scale: 1.05, duration: 4.5, ease: "sine.inOut", repeat: -1, yoyo: true, transformOrigin: "50% 100%" });
    return () => void t.kill();
  }, []);

  const go = (s: Step) => {
    setMsg(null);
    setStep(s);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!LIVE) return setMsg({ bad: false, text: "This is the design preview: signing in needs the live backend." });
    if (!isLoaded || !signIn || !setActive) return;
    setBusy(true);
    setMsg(null);
    try {
      if (step === "in") {
        const r = await signIn.create({ identifier: email.trim(), password });
        if (r.status === "complete") {
          try {
            localStorage.setItem("ta-ui:keep", keep.current?.checked === false ? "0" : "1");
            sessionStorage.setItem("ta-ui:here", "1");
          } catch {}
          await setActive({ session: r.createdSessionId });
        } else setMsg({ bad: true, text: "This account needs one more step. Sign in on AURA first." });
      } else if (step === "forgot") {
        await signIn.create({ strategy: "reset_password_email_code", identifier: email.trim() });
        setCode("");
        setPassword("");
        go("reset");
      } else {
        const r = await signIn.attemptFirstFactor({ strategy: "reset_password_email_code", code: code.trim(), password });
        if (r.status === "complete") await setActive({ session: r.createdSessionId });
        else setMsg({ bad: true, text: "Could not finish. Try the code again." });
      }
    } catch (err) {
      setMsg({ bad: true, text: errorText(err) });
    }
    setBusy(false);
  }

  const [title, sub] = WORDS[step];
  const eye = (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      aria-label={show ? "Hide password" : "Show password"}
      className="-mr-1 flex size-8 items-center justify-center rounded-full text-ink-3 hover:text-ink"
    >
      <EyeIcon off={show} />
    </button>
  );
  const link = "text-small font-medium text-brand hover:text-brand-strong";

  return (
    <div className="board fixed inset-0 z-[60] flex overflow-y-auto pt-8 font-sans text-ink max-md:pt-0">
      <main className="enter-board relative mx-[max(6.5625rem,12px)] my-auto flex min-h-[min(49.1875rem,100%)] w-full flex-1 items-center justify-center rounded-lg bg-white pb-[max(3.3rem,20px)] pl-[max(3.06rem,20px)] pr-3 pt-[max(5.125rem,64px)] shadow-card max-md:mx-3 max-md:pr-5">
        <Notch big label="Sign in" />

        {/* AURA's card. */}
        <aside className="relative hidden aspect-[780/652] w-[48.75rem] min-w-0 shrink overflow-hidden rounded-xl bg-aura-night text-white lg:block">
          <div
            ref={glow}
            className="pointer-events-none absolute inset-0"
            style={{
              background: [
                "radial-gradient(62% 56% at 4% 106%, color-mix(in srgb, var(--color-aura-1) 78%, transparent), transparent 72%)",
                "radial-gradient(80% 58% at 46% 110%, color-mix(in srgb, var(--color-aura-2) 80%, transparent), transparent 72%)",
                "radial-gradient(58% 52% at 104% 106%, color-mix(in srgb, var(--color-aura-4) 50%, transparent), transparent 72%)",
                "radial-gradient(50% 40% at 78% 112%, color-mix(in srgb, var(--color-aura-3) 45%, transparent), transparent 72%)",
              ].join(","),
            }}
          />
          <Image src="/aura-logo.png" alt="AURA" width={188} height={148} priority className="absolute left-1/2 top-[24.5%] w-[24%] -translate-x-1/2" />
          <div className="absolute inset-x-0 top-[56.5%] px-8 text-center">
            <h2 className="text-h1 font-light text-white">Your AI recruiter is ready.</h2>
            <p className="mt-3.5 text-body text-white/65">Search LinkedIn, screen CVs and run every strategy in one place.</p>
          </div>
        </aside>

        {/* The welcome form. */}
        <section className="flex min-w-0 flex-1 items-center justify-center px-[max(1.5rem,0px)] max-lg:px-0">
          <div ref={panel} className="w-full max-w-[max(28.75rem,330px)]">
            <Image src="/career141-lockup.png" alt="Career141, 20 years" width={151} height={48} priority className="mx-auto h-auto w-[max(10.375rem,120px)]" />
            <h1 className="-mx-12 mt-[max(2.75rem,16px)] whitespace-nowrap text-center text-display font-light text-ink max-sm:mx-0 max-sm:text-h1">{title}</h1>
            <p className="mt-1.5 text-center text-h3 font-normal text-ink-2">{sub}</p>

            <form onSubmit={submit} className="relative mt-[max(2.5rem,18px)] flex flex-col gap-3">
              {step !== "reset" ? (
                <Field icon={<MailIcon />} type="email" name="email" autoComplete="email" placeholder="Work email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              ) : (
                <Field icon={<KeyIcon />} type="text" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Code from the email" required value={code} onChange={(e) => setCode(e.target.value)} />
              )}
              {step !== "forgot" && (
                <Field
                  icon={<LockIcon />}
                  end={eye}
                  type={show ? "text" : "password"}
                  name="password"
                  autoComplete={step === "in" ? "current-password" : "new-password"}
                  placeholder={step === "in" ? "Password" : "New password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}

              <div className="mt-1.5 flex min-h-6 items-center justify-between gap-3">
                {step === "in" ? (
                  <>
                    <label className="flex cursor-pointer items-center gap-2.5 text-small text-ink-2">
                      <input ref={keep} type="checkbox" defaultChecked className="peer sr-only" />
                      <span aria-hidden className="relative h-5 w-9 shrink-0 rounded-full bg-border-strong transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-card after:transition-transform peer-checked:after:translate-x-4" />
                      Keep me signed in
                    </label>
                    <button type="button" onClick={() => go("forgot")} className={link}>
                      Forgot password?
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => go("in")} className={link}>
                    Back to sign in
                  </button>
                )}
              </div>

              <div className="relative mt-3">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex h-[max(3.75rem,48px)] w-full items-center justify-between rounded-full bg-ink pl-[max(1.75rem,20px)] pr-2 text-h3 font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)] hover:bg-black disabled:opacity-70"
                >
                  {busy ? "Please wait…" : step === "in" ? "Sign in" : step === "forgot" ? "Send code" : "Reset password"}
                  <span className="flex size-[max(2.75rem,36px)] items-center justify-center rounded-full bg-white text-ink">
                    {busy ? (
                      <span className="size-5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
                    ) : (
                      <svg {...SVG} strokeWidth={1.65} className="size-[max(1.125rem,15px)]" data-nudge>
                        <path d="M5 12h14m-5.25-5.25L19 12l-5.25 5.25" />
                      </svg>
                    )}
                  </span>
                </button>
                {/* Under the button, out of the flow, so a message never moves the form. */}
                <p role="status" aria-live="polite" className={`absolute inset-x-0 top-full mt-3 text-center text-small ${msg?.bad ? "text-danger" : "text-ink-2"}`}>
                  {msg?.text}
                </p>
              </div>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
