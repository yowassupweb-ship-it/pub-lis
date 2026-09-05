"use client";
import { useEffect, useState } from "react";

function toDigits(start: string, end: string): string {
  const sd = start.replace(/\D/g, "").slice(0, 4);
  const ed = end.replace(/\D/g, "").slice(0, 4);
  if (sd.length === 4 && ed.length === 4) return sd + ed;
  if (sd.length === 4) return sd;
  return sd;
}

function formatDigits(d: string): string {
  let r = "";
  for (let i = 0; i < d.length; i++) {
    if (i === 2) r += ":";
    else if (i === 4) r += " – ";
    else if (i === 6) r += ":";
    r += d[i];
  }
  return r;
}

function parseDigits(d: string): [string, string] {
  if (d.length < 4) return ["", ""];
  const s = `${d.slice(0, 2)}:${d.slice(2, 4)}`;
  if (d.length < 8) return [s, ""];
  const e = `${d.slice(4, 6)}:${d.slice(6, 8)}`;
  return [s, e];
}

export default function TimeRangeInput({
  start,
  end,
  onChange,
  className,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  className?: string;
}) {
  const [digits, setDigits] = useState(() => toDigits(start, end));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- отражаем внешние start/end в буфер набора, пока поле не в фокусе
      setDigits(toDigits(start, end));
    }
  }, [start, end, focused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    setDigits(raw.slice(0, 8));
  };

  const handleBlur = () => {
    setFocused(false);
    const [s, e] = parseDigits(digits);
    onChange(s, e);
    setDigits(toDigits(s, e));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={focused ? formatDigits(digits) : formatDigits(toDigits(start, end))}
      placeholder="18:00 – 20:00"
      onFocus={() => {
        setFocused(true);
        setDigits(toDigits(start, end));
      }}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={className}
    />
  );
}
