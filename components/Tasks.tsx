import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirebase } from '../contexts/FirebaseContext';
import { useStellarWallet } from '../contexts/StellarWalletContext';
import { TASKS, type TaskDef } from '../services/taskCatalog';
import { subscribeToCompletedTasks, completeTask, TaskError } from '../services/taskService';
import { subscribeToPoints, type PointsData } from '../services/pointsService';
import { submitTaskTx, ClaimTxError } from '../services/stellarTx';
import { WalletPicker } from './WalletButton';

const fmt = (n: number) => n.toLocaleString('en-US');

// Small round glyph per task type.
const TaskIcon: React.FC<{ type: TaskDef['type'] }> = ({ type }) => {
  const common = 'w-5 h-5';
  if (type === 'onchain') {
    return (
      <svg className={common} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h13m0 0-3-3m3 3-3 3M20 17H7m0 0 3-3m-3 3 3 3" />
      </svg>
    );
  }
  if (type === 'link') {
    return (
      <svg className={common} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
      </svg>
    );
  }
  return (
    <svg className={common} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
};

const TaskRow: React.FC<{
  task: TaskDef;
  done: boolean;
  started: boolean;
  busy: boolean;
  onStart: () => void;
  onClaim: () => void;
}> = ({ task, done, started, busy, onStart, onClaim }) => {
  const button = () => {
    if (done) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-semibold">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Done
        </span>
      );
    }
    if (task.type === 'onchain') {
      return (
        <button
          onClick={onClaim}
          disabled={busy}
          className="px-3.5 h-9 flex items-center gap-2 rounded-lg bg-gray-900 hover:bg-black text-white text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {busy && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
          {busy ? 'Confirming…' : task.cta}
        </button>
      );
    }
    // visit / link: start first, then claim.
    if (!started) {
      return (
        <button
          onClick={onStart}
          className="px-3.5 h-9 flex items-center rounded-lg bg-gray-900 hover:bg-black text-white text-sm font-semibold transition-colors"
        >
          {task.cta}
        </button>
      );
    }
    return (
      <button
        onClick={onClaim}
        disabled={busy}
        className="px-3.5 h-9 flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
      >
        {busy && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
        {busy ? 'Claiming…' : `Claim +${task.points}`}
      </button>
    );
  };

  return (
    <div className={`group bg-white rounded-2xl border shadow-sm transition-all p-5 ${done ? 'border-emerald-100' : 'border-gray-200 hover:border-gray-300 hover:shadow-md'}`}>
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-600'}`}>
          <TaskIcon type={task.type} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-gray-900">{task.title}</h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-semibold">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 16.9 5.7 21.4 8 14 2 9.4h7.6z" />
              </svg>
              +{task.points}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">{task.description}</p>
        </div>

        <div className="flex-shrink-0 self-center">{button()}</div>
      </div>
    </div>
  );
};

const Tasks: React.FC = () => {
  const { user } = useFirebase();
  const { address, signTransaction } = useStellarWallet();
  const navigate = useNavigate();

  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [points, setPoints] = useState<PointsData | null>(null);
  const [started, setStarted] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) { setCompleted(new Set()); setPoints(null); return; }
    const unsubTasks = subscribeToCompletedTasks(user.uid, setCompleted);
    const unsubPoints = subscribeToPoints(user.uid, setPoints);
    return () => { unsubTasks(); unsubPoints(); };
  }, [user?.uid]);

  // "Started" (visit/link) state persists across navigation so a returning user
  // sees the Claim button instead of the initial CTA. Keyed per user.
  const startedKey = user?.uid ? `rivarly:tasksStarted:${user.uid}` : null;
  useEffect(() => {
    if (!startedKey) { setStarted(new Set()); return; }
    try {
      const raw = localStorage.getItem(startedKey);
      setStarted(new Set(raw ? JSON.parse(raw) : []));
    } catch { setStarted(new Set()); }
  }, [startedKey]);

  const doneCount = useMemo(() => TASKS.filter((t) => completed.has(t.id)).length, [completed]);
  const totalReward = useMemo(() => TASKS.reduce((s, t) => s + t.points, 0), []);

  const flashMsg = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 3500); };

  const handleStart = (task: TaskDef) => {
    setStarted((s) => {
      const next = new Set(s).add(task.id);
      if (startedKey) { try { localStorage.setItem(startedKey, JSON.stringify([...next])); } catch { /* ignore */ } }
      return next;
    });
    if (task.type === 'link' && task.href) {
      window.open(task.href, '_blank', 'noopener,noreferrer');
    } else if (task.type === 'visit' && task.route) {
      navigate(task.route);
    }
  };

  const handleClaim = async (task: TaskDef) => {
    if (!user?.uid || busyId) return;
    setError(null);

    // On-chain task needs a wallet + a signed tx first.
    if (task.type === 'onchain' && !address) { setPickerOpen(true); return; }

    setBusyId(task.id);
    try {
      let txHash: string | undefined;
      if (task.type === 'onchain') {
        txHash = await submitTaskTx(address!, user.uid, task.id, signTransaction);
      }
      const { awarded } = await completeTask(task.id, txHash);
      flashMsg(`+${fmt(awarded)} points earned!`);
    } catch (e) {
      setError(e instanceof ClaimTxError || e instanceof TaskError ? e.message : e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Tasks</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {doneCount}/{TASKS.length} done · up to {fmt(totalReward)} points to earn
              </p>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gray-900 text-white">
              <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4L12 16.9 5.7 21.4 8 14 2 9.4h7.6z" />
              </svg>
              <span className="text-sm font-bold tabular-nums">{fmt(points?.points ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6">
        {(flash || error) && (
          <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${flash ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
            {flash || error}
          </div>
        )}

        <div className="space-y-3">
          {TASKS.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              done={completed.has(task.id)}
              started={started.has(task.id)}
              busy={busyId === task.id}
              onStart={() => handleStart(task)}
              onClaim={() => handleClaim(task)}
            />
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Points are awarded server-side. On-chain tasks are verified on Stellar.
        </p>
      </div>

      {pickerOpen && <WalletPicker onClose={() => setPickerOpen(false)} />}
    </div>
  );
};

export default Tasks;
