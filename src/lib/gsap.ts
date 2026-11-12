"use client";

// The one door to GSAP. Every animated component imports `gsap` and `useGSAP`
// from here, never from "gsap" directly, so plugins are registered once and
// before anything runs.
//
// How to animate in this app:
//   - Only in client components ("use client"), inside useGSAP(() => { ... },
//     { scope: ref }). The hook reverts everything on unmount, and the scope
//     keeps selectors like ".row" inside that component.
//   - A handler that animates later (a click, a hover) is wrapped in
//     contextSafe() from the hook, so it is cleaned up too.
//   - Sequences ("video flow") are a gsap.timeline(), not chained delays.
//
// A plugin is added when a screen first needs it: import it below and add it
// to registerPlugin. They all ship in the gsap package already, nothing more
// to install: ScrollTrigger, ScrollSmoother, Flip (zoom / shared-element
// moves), SplitText, CustomEase, Observer, MotionPathPlugin, Draggable,
// InertiaPlugin, DrawSVGPlugin, MorphSVGPlugin, ScrollToPlugin, TextPlugin.
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };
