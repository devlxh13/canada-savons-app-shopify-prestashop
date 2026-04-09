"use client";

import { useState, useEffect } from "react";

export function RetryBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    function fetchCount() {
      fetch("/api/retry?limit=0")
        .then((r) => r.json())
        .then((d) => setCount(d.pendingCount ?? 0))
        .catch(() => {});
    }

    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (count === 0) return null;

  return (
    <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}
