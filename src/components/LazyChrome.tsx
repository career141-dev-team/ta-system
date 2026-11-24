"use client";

import dynamic from "next/dynamic";

// The desk assistant and the feedback widget sit on every page but are opened
// by a click. Loading them in their own chunks after the page (23 Nov) keeps
// their ~37 KB out of what every page has to download first. `ssr: false` is
// only allowed in a client file, hence this wrapper for the root layout.
export const LazyDeskAssistant = dynamic(() => import("./DeskAssistant").then((m) => m.DeskAssistant), { ssr: false });
export const LazyFeedbackWidget = dynamic(() => import("./FeedbackWidget").then((m) => m.FeedbackWidget), { ssr: false });
