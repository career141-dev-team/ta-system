"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

// Identifiers, not credentials: both are public in the page Meta's popup opens.
const META_APP_ID = "1526707445536881";
const SIGNUP_CONFIG_ID = "3026772220995087";

declare global {
  interface Window {
    FB?: {
      init: (o: object) => void;
      login: (cb: (r: unknown) => void, o: object) => void;
    };
    fbAsyncInit?: () => void;
  }
}

/**
 * Settings → WhatsApp numbers: Meta's signup for a number that stays on a TA's
 * WhatsApp Business app (coexistence, 1 Nov). The result only reports what Meta
 * returned; the number's row and "Finish connection" do the rest.
 */
export function WhatsAppConnect() {
  const [note, setNote] = useState("");

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/([a-z0-9-]+\.)*facebook\.com$/.test(e.origin)) return;
      let m: { type?: string; event?: string; data?: Record<string, string> };
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.type !== "WA_EMBEDDED_SIGNUP") return;
      if (m.event === "CANCEL") setNote(`Stopped at: ${m.data?.current_step ?? m.data?.error_message ?? "unknown step"}.`);
      else
        setNote(
          `Signed up. WhatsApp account ${m.data?.waba_id ?? "not given"}, phone ID ${m.data?.phone_number_id ?? "not given"}. ` +
            "Within 24 hours: assign the account to the system user, then press Finish connection.",
        );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const start = () => {
    if (!window.FB) return setNote("Meta's sign-up script has not loaded. Refresh the page and try again.");
    window.FB.login(() => {}, {
      config_id: SIGNUP_CONFIG_ID,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
    });
  };

  return (
    <div className="mt-6 rounded-2xl border border-rule bg-surface p-5">
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="afterInteractive"
        crossOrigin="anonymous"
        onLoad={() => window.FB?.init({ appId: META_APP_ID, autoLogAppEvents: false, xfbml: false, version: "v24.0" })}
      />
      <h3 className="text-[13.5px] font-semibold">Connect a TA&rsquo;s number</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
        Keep WhatsApp Business open on the TA&rsquo;s phone. Choose to connect the existing WhatsApp Business app, then follow
        the prompts. The number stays on the phone.
      </p>
      <button type="button" onClick={start} className="mt-3 rounded-full bg-brand px-3.5 py-1.5 text-[12px] font-medium text-white hover:opacity-90">
        Start Meta signup
      </button>
      {note && <p className="mt-2 text-[12.5px] text-ink-soft">{note}</p>}
    </div>
  );
}
