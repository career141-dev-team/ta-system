"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Rec = {
  lang: string;
  continuous: boolean;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  onend: () => void;
  onerror: (e: { error: string }) => void;
  start: () => void;
  stop: () => void;
};

let ctx: AudioContext | null = null;
/** A short soft two-note blip: rising to start, falling to stop. Made in the browser, no file. */
function blip(up: boolean) {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    (up ? [660, 880] : [880, 560]).forEach((hz, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = "sine";
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.12);
      o.connect(g).connect(ctx!.destination);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.14);
    });
  } catch {
    // no audio here: stay silent
  }
}

/** The browser's own speech-to-text for a mic button. `onText` gets each phrase said.
 *  It listens until the user presses the button again (the browser ends a session on a
 *  pause; we start it again). ok = this browser can listen; on = listening now. */
export function useSpeech(onText: (t: string) => void) {
  const rec = useRef<Rec | null>(null);
  const said = useRef(onText);
  const want = useRef(false); // the user has not pressed stop
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    said.current = onText;
  });
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const R = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!R) return;
    const r = new R();
    r.lang = "en-GB";
    r.continuous = true;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) said.current(e.results[i][0].transcript.trim());
    };
    r.onerror = (e) => {
      // Silence or a dropped connection: keep going. Blocked mic: give up.
      if (e.error !== "no-speech" && e.error !== "aborted" && e.error !== "network") want.current = false;
    };
    r.onend = () => {
      if (want.current) {
        try {
          r.start();
          return;
        } catch {
          want.current = false;
        }
      }
      setOn(false);
    };
    rec.current = r;
    queueMicrotask(() => setOk(true));
    return () => {
      want.current = false;
      r.stop();
    };
  }, []);
  const toggle = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    if (want.current) {
      want.current = false;
      r.stop();
      setOn(false);
      blip(false);
    } else {
      try {
        want.current = true;
        r.start();
        setOn(true);
        blip(true);
      } catch {
        want.current = false;
      }
    }
  }, []);
  return { ok, on, toggle };
}
