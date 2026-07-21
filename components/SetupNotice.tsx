import React, { useState } from 'react';

interface SetupNoticeProps {
  missing: readonly string[];
}

/**
 * Banner shown above the app when the Firebase environment variables are absent.
 * The UI still renders, but every Firestore read fails, so lists come up empty.
 */
const SetupNotice: React.FC<SetupNoticeProps> = ({ missing }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950 dark:text-amber-100">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">Firebase is not configured</span>
        <span className="text-amber-800 dark:text-amber-200/80">
          The interface renders, but no data will load. Fill in <code className="font-mono">.env</code> and restart the dev server.
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto underline underline-offset-2 hover:no-underline"
        >
          {expanded ? 'Hide' : `${missing.length} missing variables`}
        </button>
      </div>

      {expanded && (
        <ul className="mx-auto mt-2 max-w-5xl space-y-0.5 font-mono text-xs">
          {missing.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SetupNotice;
