import React, { useState } from "react";

export default function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        <div className="absolute z-20 top-full mt-2 max-w-xs rounded-lg border bg-white p-3 text-xs text-slate-700 shadow-lg">
          {text}
        </div>
      )}
    </span>
  );
}
