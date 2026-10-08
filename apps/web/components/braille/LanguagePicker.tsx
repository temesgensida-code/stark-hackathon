"use client";
import React from "react";
import { LANGUAGES, useLanguage, type Language } from "@/components/braille/AppBrailleProvider";

/** One setting for the Braille code and the language of AI summaries and answers. */
export function LanguagePicker() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="row" style={{ gap: 6 }}>
      <label htmlFor="language" className="muted">
        Language
      </label>
      <select id="language" value={language} onChange={(e) => setLanguage(e.target.value as Language)} style={{ minWidth: 0, flex: "none" }}>
        {LANGUAGES.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
