import React, { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'lifeos-state-v1';

const DEFAULT_HABITS = [
  'vitamins',
  'NSDR',
  'mobility',
  'skincare AM',
  'walk',
  'sprint',
];

const TRAINING_BY_DAY = {
  0: { name: 'BB CHEST + TRI', cardio: 'C25K RUN', note: 'CONDITIONAL — rest if sore' },
  1: { name: 'STRENGTH 1', cardio: 'PEAK 8 SPRINTS' },
  2: { name: 'BB BACK + BI', cardio: 'PEAK 8 SPRINTS' },
  3: { name: 'STRENGTH 2', cardio: 'PEAK 8 SPRINTS' },
  4: { name: 'STRENGTH 3', cardio: 'PEAK 8 SPRINTS', note: 'FAST STARTS NOON' },
  5: { name: 'BB SHOULDERS', cardio: 'C25K RUN' },
  6: { name: 'C25K FASTED', cardio: 'BREAK FAST AFTER' },
};

const COMMANDS = [
  { cmd: 'gm', label: 'GM' },
  { cmd: 'lift', label: 'LIFT' },
  { cmd: 'drift', label: 'DRIFT' },
  { cmd: 'focus', label: 'FOCUS' },
  { cmd: 'fuel', label: 'FUEL' },
  { cmd: 'learn', label: 'LEARN' },
  { cmd: 'brain', label: 'BRAIN' },
  { cmd: 'wrap', label: 'WRAP' },
];

const SYSTEM_PROMPT = `You are Bryan's Life OS Agent — not a chatbot, a background operator.

PRIME DIRECTIVES:
1. ACT, don't ask. Infer. Max 1 question if truly stuck.
2. PUSH format. Scannable notification, 10-sec read.
3. ONE topic at a time.
4. ADHD mode: simple, structured, no fluff, no disclaimers.
5. MOBILE-FIRST. One phone screen.
6. Surface streaks, celebrate consistency not intensity.

ABOUT BRYAN:
- Wake ~7:30 AM / Sleep ~midnight
- Work 8-5 remote (peak 10:30-3:30)
- MWF: kids drop-off 8:30, pickup 5:30
- Train 6-7 days, 45 min cap
- Study 90 min/day — Networking primary (AzStoreNet, Az-700)
- Fast Thu PM → Sat post-workout (~36-40 hr)
- Weight goal: 185 → 160 over 6 months
- Faith-rooted, structured, anti-inconsistency

TRAINING SPLIT (45 min cap):
Sun: BB Chest/Tri + C25K (conditional — rest if sore)
Mon: Strength 1 + Peak 8 sprints
Tue: BB Back/Bi + Peak 8
Wed: Strength 2 + Peak 8
Thu: Strength 3 + Peak 8 (fast starts noon)
Fri: BB Shoulders + C25K
Sat: C25K fasted → break fast

Strength sessions alternate A/B:
A: Safety Squat, Bent Row DB, Incline Bench DB, Pull-Up, Knee Raise
B: Trap Bar DL, OHP DB, Ab Wheel
All 3x5.

FUEL (~2000 kcal cut):
- Huel x2 (AM) ~950 kcal
- 4PM snack pack ~450
- Rice bowl dinner ~600
- AM supplements: Multi, D/K2, Magnesium, Creatine, Fish Oil
- Fast Thu PM → Sat post-WO

COMMAND FORMATS:
- gm: ☀️ date | 🎯 TOP 3 | ⏱ KEY BLOCKS | 🏋️ TRAIN | 📚 LEARN | ✅ HABITS | ⚠️ REMIND | 💡 INSIGHT. Each section ≤4 lines, delete empty ones.
- lift: today's strength (A or B) + sprint finisher, sets x reps
- drift: ONE next action. Nothing else. 1-2 lines max.
- focus: 25-min pomodoro framing for current task. Ask what task if not given.
- fuel: meal matching fasting state, protein-forward
- learn: ONE micro-lesson, high-school level, end with 1 recall question
- brain: what you know about Bryan's current state in <8 bullets
- wrap: evening review — what shipped, 1 improvement for tomorrow, sleep cue
- done: X: log it, note streak, give next action
- friction: 1 inefficiency this week + fix

OUTPUT RULES:
- PUSH format: emojis as section markers, short lines, scannable
- Max ~150 words unless deep work requested
- No preamble, no disclaimers, no "I'd recommend"
- Direct, operator-style
- Use today's date provided in context for currency`;

function callTimeAgo(iso) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatFastTimer(startIso) {
  if (!startIso) return null;
  const ms = Date.now() - new Date(startIso).getTime();
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function App() {
  const [now, setNow] = useState(new Date());
  const [state, setState] = useState({
    habits: {},
    streaks: {},
    fastStart: null,
    doneLog: [],
    lastResponse: null,
  });
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [activeCmd, setActiveCmd] = useState(null);
  const [stateLoaded, setStateLoaded] = useState(false);
  const responseRef = useRef(null);

  const today = now;
  const todayKey = today.toISOString().split('T')[0];
  const dayIdx = today.getDay();
  const dayName = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][dayIdx];
  const training = TRAINING_BY_DAY[dayIdx];
  const dateStr = today.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).toUpperCase();

  // Tick clock every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // Load state once
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r && r.value) {
          setState(JSON.parse(r.value));
        }
      } catch (e) {
        // No existing state — fresh install
      }
      setStateLoaded(true);
    })();
  }, []);

  const persist = async (next) => {
    setState(next);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.error('persist failed', e);
    }
  };

  const toggleHabit = async (habit) => {
    const dayHabits = state.habits[todayKey] || {};
    const wasChecked = !!dayHabits[habit];
    const nextDayHabits = { ...dayHabits, [habit]: !wasChecked };

    const streaks = { ...(state.streaks || {}) };
    const cur = streaks[habit] || { count: 0, lastDate: null };

    if (!wasChecked) {
      // Just checked
      if (cur.lastDate === todayKey) {
        // no-op (already counted today)
      } else {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        const yKey = y.toISOString().split('T')[0];
        streaks[habit] = {
          count: cur.lastDate === yKey ? cur.count + 1 : 1,
          lastDate: todayKey,
        };
      }
    } else {
      // Unchecking — revert today's contribution
      if (cur.lastDate === todayKey) {
        streaks[habit] = {
          count: Math.max(0, cur.count - 1),
          lastDate: null,
        };
      }
    }

    await persist({
      ...state,
      habits: { ...state.habits, [todayKey]: nextDayHabits },
      streaks,
    });
  };

  const toggleFast = async () => {
    if (state.fastStart) {
      await persist({ ...state, fastStart: null });
    } else {
      await persist({ ...state, fastStart: new Date().toISOString() });
    }
  };

  const callClaude = async (userMessage, cmdLabel) => {
    setLoading(true);
    setActiveCmd(cmdLabel || userMessage);
    try {
      const ctx = `\n\nTODAY: ${today.toDateString()} (${dayName})\nTODAY'S TRAINING: ${training.name} + ${training.cardio}${training.note ? ' — ' + training.note : ''}\nFAST ACTIVE: ${state.fastStart ? 'YES, ' + formatFastTimer(state.fastStart) + ' elapsed' : 'NO'}\nHABITS DONE TODAY: ${Object.entries(state.habits[todayKey] || {}).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'none yet'}`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: SYSTEM_PROMPT + ctx,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
      const data = await res.json();
      const text = (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      await persist({
        ...state,
        lastResponse: {
          cmd: cmdLabel || userMessage,
          text: text || '(empty response)',
          time: new Date().toISOString(),
        },
      });
    } catch (e) {
      await persist({
        ...state,
        lastResponse: {
          cmd: 'error',
          text: 'Connection failed. Check network and retry.',
          time: new Date().toISOString(),
        },
      });
    }
    setLoading(false);
    setActiveCmd(null);
    // Scroll response into view
    setTimeout(() => {
      if (responseRef.current) {
        responseRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  };

  const submitInput = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');

    if (msg.toLowerCase().startsWith('done:')) {
      const item = msg.slice(5).trim();
      const newLog = [{ item, time: new Date().toISOString() }, ...(state.doneLog || [])].slice(0, 30);
      // persist log first, then call
      setState((s) => ({ ...s, doneLog: newLog }));
      try {
        await window.storage.set(
          STORAGE_KEY,
          JSON.stringify({ ...state, doneLog: newLog })
        );
      } catch (e) {}
    }
    await callClaude(msg, msg.split(' ')[0]);
  };

  const todayHabits = state.habits[todayKey] || {};
  const habitsDone = DEFAULT_HABITS.filter((h) => todayHabits[h]).length;
  const fastDisplay = formatFastTimer(state.fastStart);

  // Highest active streak
  const topStreak = Object.entries(state.streaks || {})
    .map(([k, v]) => ({ name: k, count: v.count || 0 }))
    .sort((a, b) => b.count - a.count)[0];

  return (
    <div style={styles.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .lifeos-btn:active { transform: translateY(1px); }
        .lifeos-cmd { transition: all 0.08s ease; }
        .lifeos-cmd:hover { background: #ff6b1f !important; color: #000 !important; }
        .lifeos-cmd:disabled { opacity: 0.3; cursor: not-allowed; }
        .lifeos-habit { transition: all 0.08s ease; }
        .lifeos-habit:active { background: #1a1a1a; }
        .lifeos-input:focus { outline: none; border-color: #ff6b1f !important; }
        .blink { animation: blink 1.4s infinite; }
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0.2; } }
        .scroll-resp::-webkit-scrollbar { width: 4px; }
        .scroll-resp::-webkit-scrollbar-track { background: transparent; }
        .scroll-resp::-webkit-scrollbar-thumb { background: #2a2a2a; }
      `}</style>

      <div style={styles.shell}>
        {/* HEADER */}
        <div style={styles.header}>
          <div style={styles.headerTop}>
            <div style={styles.brand}>
              <span style={styles.brandDot} className="blink" />
              LIFE/OS
              <span style={styles.versionTag}>v1</span>
            </div>
            <div style={styles.dateBlock}>
              <div style={styles.dayName}>{dayName}</div>
              <div style={styles.dateStr}>{dateStr}</div>
            </div>
          </div>

          {/* Status row */}
          <div style={styles.statusRow}>
            <div style={styles.statusCell} onClick={toggleFast}>
              <div style={styles.statusLabel}>FAST</div>
              <div style={{
                ...styles.statusValue,
                color: state.fastStart ? '#ff6b1f' : '#444',
              }}>
                {fastDisplay || 'OFF'}
              </div>
            </div>
            <div style={styles.statusDivider} />
            <div style={styles.statusCell}>
              <div style={styles.statusLabel}>HABITS</div>
              <div style={styles.statusValue}>
                {habitsDone}<span style={styles.statusDim}>/{DEFAULT_HABITS.length}</span>
              </div>
            </div>
            <div style={styles.statusDivider} />
            <div style={styles.statusCell}>
              <div style={styles.statusLabel}>STREAK</div>
              <div style={styles.statusValue}>
                {topStreak && topStreak.count > 0 ? (
                  <>{topStreak.count}<span style={styles.statusDim}>d</span></>
                ) : (
                  <span style={{ color: '#444' }}>—</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* TODAY'S TRAINING */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionMark}>▸</span>
            TRAIN / {dayName}
          </div>
          <div style={styles.trainingCard}>
            <div style={styles.trainingMain}>{training.name}</div>
            <div style={styles.trainingCardio}>+ {training.cardio}</div>
            {training.note && (
              <div style={styles.trainingNote}>※ {training.note}</div>
            )}
          </div>
        </div>

        {/* COMMAND GRID */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionMark}>▸</span>
            COMMAND
          </div>
          <div style={styles.cmdGrid}>
            {COMMANDS.map((c) => (
              <button
                key={c.cmd}
                className="lifeos-cmd lifeos-btn"
                onClick={() => callClaude(c.cmd, c.label)}
                disabled={loading}
                style={{
                  ...styles.cmdBtn,
                  ...(activeCmd === c.label ? styles.cmdBtnActive : {}),
                }}
              >
                {activeCmd === c.label && loading ? (
                  <span className="blink">···</span>
                ) : (
                  c.label
                )}
              </button>
            ))}
          </div>
        </div>

        {/* HABITS */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionMark}>▸</span>
            HABITS / TODAY
          </div>
          <div style={styles.habitsGrid}>
            {DEFAULT_HABITS.map((h) => {
              const checked = !!todayHabits[h];
              const streak = state.streaks?.[h]?.count || 0;
              return (
                <button
                  key={h}
                  className="lifeos-habit lifeos-btn"
                  onClick={() => toggleHabit(h)}
                  style={{
                    ...styles.habitBtn,
                    ...(checked ? styles.habitBtnChecked : {}),
                  }}
                >
                  <div style={styles.habitRow}>
                    <span style={{
                      ...styles.habitBox,
                      ...(checked ? styles.habitBoxChecked : {}),
                    }}>
                      {checked ? '■' : '□'}
                    </span>
                    <span style={styles.habitName}>{h}</span>
                    {streak > 0 && (
                      <span style={styles.habitStreak}>{streak}d</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RESPONSE */}
        {(state.lastResponse || loading) && (
          <div style={styles.section} ref={responseRef}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionMark}>▸</span>
              OUTPUT
              {state.lastResponse && (
                <span style={styles.sectionMeta}>
                  / {state.lastResponse.cmd?.toUpperCase()} · {callTimeAgo(state.lastResponse.time)}
                </span>
              )}
            </div>
            <div className="scroll-resp" style={styles.responseBox}>
              {loading ? (
                <div style={styles.loadingBox}>
                  <span className="blink">▮</span> processing...
                </div>
              ) : (
                <pre style={styles.responseText}>{state.lastResponse.text}</pre>
              )}
            </div>
          </div>
        )}

        {/* DONE LOG (collapsed preview) */}
        {state.doneLog && state.doneLog.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionMark}>▸</span>
              LOG
              <span style={styles.sectionMeta}>/ {state.doneLog.length} done</span>
            </div>
            <div style={styles.logBox}>
              {state.doneLog.slice(0, 3).map((d, i) => (
                <div key={i} style={styles.logRow}>
                  <span style={styles.logCheck}>✓</span>
                  <span style={styles.logItem}>{d.item}</span>
                  <span style={styles.logTime}>{callTimeAgo(d.time)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INPUT */}
        <div style={styles.inputBar}>
          <div style={styles.inputPrompt}>$</div>
          <input
            className="lifeos-input"
            style={styles.input}
            placeholder='done: vitamins / research: vlan trunking / ...'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitInput()}
            disabled={loading}
          />
          <button
            className="lifeos-btn"
            style={{
              ...styles.sendBtn,
              opacity: input.trim() && !loading ? 1 : 0.3,
            }}
            onClick={submitInput}
            disabled={!input.trim() || loading}
          >
            →
          </button>
        </div>

        <div style={styles.footer}>
          PRIME DIRECTIVE / ACT, DON'T ASK
        </div>
      </div>
    </div>
  );
}

const FONT = "'JetBrains Mono', ui-monospace, monospace";

const styles = {
  root: {
    fontFamily: FONT,
    background: '#000',
    color: '#e8e8e8',
    minHeight: '100vh',
    width: '100%',
    padding: '0',
    fontSize: '13px',
    lineHeight: 1.4,
    WebkitFontSmoothing: 'antialiased',
  },
  shell: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '16px 14px 100px',
    background: '#0a0a0a',
    minHeight: '100vh',
    borderLeft: '1px solid #1a1a1a',
    borderRight: '1px solid #1a1a1a',
  },
  header: {
    marginBottom: 20,
  },
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  brand: {
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '0.12em',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  brandDot: {
    width: 8,
    height: 8,
    background: '#ff6b1f',
    display: 'inline-block',
  },
  versionTag: {
    fontSize: 9,
    color: '#666',
    fontWeight: 400,
    letterSpacing: '0.1em',
    marginLeft: 4,
    border: '1px solid #2a2a2a',
    padding: '1px 4px',
  },
  dateBlock: {
    textAlign: 'right',
  },
  dayName: {
    fontSize: 11,
    fontWeight: 700,
    color: '#ff6b1f',
    letterSpacing: '0.18em',
  },
  dateStr: {
    fontSize: 10,
    color: '#666',
    letterSpacing: '0.1em',
    marginTop: 2,
  },
  statusRow: {
    display: 'flex',
    border: '1px solid #1f1f1f',
    background: '#0d0d0d',
  },
  statusCell: {
    flex: 1,
    padding: '10px 8px',
    cursor: 'pointer',
  },
  statusDivider: {
    width: 1,
    background: '#1f1f1f',
  },
  statusLabel: {
    fontSize: 9,
    color: '#555',
    letterSpacing: '0.16em',
    fontWeight: 600,
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 18,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.04em',
    color: '#fff',
  },
  statusDim: {
    fontSize: 11,
    color: '#555',
    fontWeight: 400,
  },
  section: {
    marginBottom: 18,
  },
  sectionHeader: {
    fontSize: 10,
    color: '#787878',
    letterSpacing: '0.16em',
    fontWeight: 600,
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  sectionMark: {
    color: '#ff6b1f',
    fontSize: 11,
  },
  sectionMeta: {
    color: '#444',
    fontSize: 9,
    fontWeight: 400,
    letterSpacing: '0.1em',
    marginLeft: 'auto',
  },
  trainingCard: {
    border: '1px solid #1f1f1f',
    background: '#0d0d0d',
    padding: '12px 14px',
    borderLeft: '3px solid #ff6b1f',
  },
  trainingMain: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: '#fff',
  },
  trainingCardio: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
    letterSpacing: '0.06em',
  },
  trainingNote: {
    fontSize: 10,
    color: '#ff6b1f',
    marginTop: 6,
    letterSpacing: '0.06em',
  },
  cmdGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 6,
  },
  cmdBtn: {
    background: '#141414',
    color: '#e8e8e8',
    border: '1px solid #232323',
    padding: '14px 4px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.1em',
    cursor: 'pointer',
    fontFamily: FONT,
    minHeight: 44,
  },
  cmdBtnActive: {
    background: '#ff6b1f',
    color: '#000',
    borderColor: '#ff6b1f',
  },
  habitsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 4,
  },
  habitBtn: {
    background: '#0d0d0d',
    border: '1px solid #1f1f1f',
    padding: '10px 10px',
    cursor: 'pointer',
    fontFamily: FONT,
    color: '#e8e8e8',
    textAlign: 'left',
  },
  habitBtnChecked: {
    background: '#141414',
    borderColor: '#ff6b1f',
  },
  habitRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  habitBox: {
    color: '#444',
    fontSize: 14,
    fontWeight: 700,
    width: 14,
  },
  habitBoxChecked: {
    color: '#ff6b1f',
  },
  habitName: {
    fontSize: 11,
    letterSpacing: '0.04em',
    flex: 1,
  },
  habitStreak: {
    fontSize: 10,
    color: '#ff6b1f',
    fontWeight: 700,
    letterSpacing: '0.05em',
  },
  responseBox: {
    border: '1px solid #1f1f1f',
    background: '#0d0d0d',
    padding: '12px 14px',
    maxHeight: 380,
    overflowY: 'auto',
  },
  responseText: {
    fontFamily: FONT,
    fontSize: 12,
    color: '#e8e8e8',
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: 1.55,
  },
  loadingBox: {
    color: '#ff6b1f',
    fontSize: 12,
    letterSpacing: '0.1em',
  },
  logBox: {
    border: '1px solid #1f1f1f',
    background: '#0d0d0d',
  },
  logRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    borderBottom: '1px solid #161616',
    fontSize: 11,
  },
  logCheck: {
    color: '#ff6b1f',
    fontWeight: 700,
  },
  logItem: {
    flex: 1,
    color: '#ccc',
  },
  logTime: {
    color: '#555',
    fontSize: 9,
    letterSpacing: '0.08em',
  },
  inputBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    maxWidth: 480,
    margin: '0 auto',
    background: '#000',
    borderTop: '1px solid #1f1f1f',
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    gap: 8,
  },
  inputPrompt: {
    color: '#ff6b1f',
    fontWeight: 700,
    fontSize: 14,
  },
  input: {
    flex: 1,
    background: '#0d0d0d',
    border: '1px solid #232323',
    color: '#e8e8e8',
    padding: '10px 12px',
    fontFamily: FONT,
    fontSize: 12,
    letterSpacing: '0.02em',
  },
  sendBtn: {
    background: '#ff6b1f',
    color: '#000',
    border: 'none',
    padding: '10px 14px',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    fontFamily: FONT,
  },
  footer: {
    textAlign: 'center',
    color: '#333',
    fontSize: 9,
    letterSpacing: '0.2em',
    marginTop: 28,
    paddingBottom: 12,
  },
};
