"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLive } from "@/lib/backend";
import LoginScreen from "./LoginScreen";

// Signed-in visitors never see it (a live page only mounts when signed in): they go to Today.
export default function SignInPage() {
  const live = useLive();
  const router = useRouter();
  useEffect(() => {
    if (live) router.replace("/today");
  }, [live, router]);
  return live ? null : <LoginScreen />;
}
