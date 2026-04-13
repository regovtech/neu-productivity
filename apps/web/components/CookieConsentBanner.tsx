"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "neu_cookie_consent";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setVisible(true);
    } catch {
      // localStorage not available (SSR hydration or private browsing) — hide banner
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "accepted");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white px-4 py-4 shadow-lg sm:flex sm:items-center sm:justify-between sm:px-8"
    >
      <p className="text-sm text-gray-600">
        We use strictly necessary cookies to keep you signed in. No tracking or analytics
        cookies are used.{" "}
        <Link href="/privacy" className="font-medium text-brand-600 hover:underline">
          Privacy Policy
        </Link>
      </p>
      <button
        onClick={dismiss}
        className="mt-3 w-full rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 sm:mt-0 sm:ml-6 sm:w-auto"
      >
        Accept &amp; close
      </button>
    </div>
  );
}
