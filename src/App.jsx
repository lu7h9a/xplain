
import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_TOPICS = [
  { slug: "api", title: "API", category: "Software", shortSummary: "How software systems communicate through structured requests and responses." },
  { slug: "black-holes", title: "Black Holes", category: "Physics", shortSummary: "Extreme regions of space where gravity is strong enough that light cannot escape." },
  { slug: "blockchain", title: "Blockchain", category: "Technology", shortSummary: "A shared tamper-resistant record built from linked blocks of data." },
  { slug: "climate-change", title: "Climate Change", category: "Environment", shortSummary: "Long-term climate shifts driven largely by greenhouse gas emissions." },
  { slug: "compound-interest", title: "Compound Interest", category: "Finance", shortSummary: "Growth that happens when earnings start earning more earnings." },
  { slug: "cybersecurity-basics", title: "Cybersecurity Basics", category: "Security", shortSummary: "Protecting systems, accounts, and data from attacks and misuse." },
  { slug: "data-structures", title: "Data Structures", category: "Computer Science", shortSummary: "Ways to organize data so programs can access and update it efficiently." },
  { slug: "dna-replication", title: "DNA Replication", category: "Biology", shortSummary: "How cells copy DNA before dividing." },
  { slug: "electric-circuits", title: "Electric Circuits", category: "Physics", shortSummary: "Closed paths that allow electric current to flow through components." },
  { slug: "machine-learning", title: "Machine Learning", category: "AI", shortSummary: "Systems that learn patterns from data instead of following only fixed rules." },
  { slug: "natural-selection", title: "Natural Selection", category: "Biology", shortSummary: "How helpful inherited traits become more common across generations." },
  { slug: "neural-networks", title: "Neural Networks", category: "AI", shortSummary: "Layered models that learn weighted patterns from data." },
  { slug: "photosynthesis", title: "Photosynthesis", category: "Biology", shortSummary: "How plants turn sunlight, water, and carbon dioxide into food." },
  { slug: "recursion", title: "Recursion", category: "Computer Science", shortSummary: "Solving a problem by reducing it into smaller versions of itself." },
  { slug: "supply-and-demand", title: "Supply and Demand", category: "Economics", shortSummary: "How availability and desire influence prices and quantities." },
];

const LEVELS = [
  { id: "child", label: "Elementary", sublabel: "Ages 6-10", accent: "var(--sun)", description: "Simple language, vivid analogies" },
  { id: "beginner", label: "Foundational", sublabel: "No prior knowledge", accent: "var(--lime)", description: "Structured, jargon-free clarity" },
  { id: "expert", label: "Advanced", sublabel: "Domain expertise", accent: "var(--sky)", description: "Technical depth and nuance" },
];

const MOODS = ["focused", "curious", "overwhelmed", "tired"];
const STYLES = ["analogy", "story", "technical", "simple"];

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [concept, setConcept] = useState("");
  const [topics, setTopics] = useState(DEFAULT_TOPICS);
  const [activeLevel, setActiveLevel] = useState("beginner");
  const [learnerName, setLearnerName] = useState("");
  const [mood, setMood] = useState("focused");
  const [preferredStyle, setPreferredStyle] = useState("analogy");
  const [confusionPattern, setConfusionPattern] = useState("");
  const [previousBehavior, setPreviousBehavior] = useState("");
  const [lesson, setLesson] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [understood, setUnderstood] = useState(true);
  const [learnerExplanation, setLearnerExplanation] = useState("");
  const [confusionArea, setConfusionArea] = useState("");
  const [error, setError] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    void loadTopics();
  }, []);

  async function loadTopics() {
    try {
      const res = await fetch("/api/topics");
      if (!res.ok) throw new Error("Topic API unavailable");
      const data = await res.json();
      setTopics(data.topics?.length ? data.topics : DEFAULT_TOPICS);
    } catch {
      setTopics(DEFAULT_TOPICS);
    }
  }

  async function handleExplain() {
    if (!concept.trim()) return;
    setError("");
    setFeedback(null);
    setLoading(true);

    const matchedTopic = topics.find((topic) => topic.title.toLowerCase() === concept.trim().toLowerCase());

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicSlug: matchedTopic?.slug,
          customTopic: matchedTopic ? "" : concept.trim(),
          learnerName,
          learnerLevel: activeLevel,
          mood,
          preferredStyle,
          confusionPattern,
          previousBehavior,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate lesson");
      setSessionId(data.sessionId);
      setLesson(data.lesson);
      setLearnerExplanation("");
      setConfusionArea("");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch {
      const fallbackLesson = createLocalLesson({
        topic: matchedTopic || { title: concept.trim(), category: "Custom", shortSummary: `A guided explanation for ${concept.trim()}.` },
        learnerLevel: activeLevel,
        mood,
        preferredStyle,
        confusionPattern,
        previousBehavior,
      });
      setSessionId(`local-${Date.now()}`);
      setLesson(fallbackLesson);
      setLearnerExplanation("");
      setConfusionArea("");
      setError("Live API unavailable, showing Eggsy demo mode.");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } finally {
      setLoading(false);
    }
  }

  async function handleFeedbackSubmit() {
    if (!sessionId) return;
    setFeedbackLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, understood, learnerExplanation, confusionArea }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save feedback");
      setFeedback(data);
    } catch {
      setFeedback(createLocalFeedback({ understood, learnerExplanation, confusionArea, lesson }));
    } finally {
      setFeedbackLoading(false);
    }
  }

  const currentLevel = LEVELS.find((level) => level.id === activeLevel);
  const activeLevelText = useMemo(() => lesson?.levelExplanations?.[activeLevel] || "", [lesson, activeLevel]);

  return (
    <div className="app-shell">
      <style>{styles}</style>
      <div className="background-orb orb-one" />
      <div className="background-orb orb-two" />
      <div className="page-frame">
        <header className="topbar">
          <div className="brand-wrap">
            <div className="brand-chip"><EggsyMascot theme={theme} compact /></div>
            <div>
              <div className="brand-title">Eggsy</div>
              <div className="brand-subtitle">Your cheerful concept coach</div>
            </div>
          </div>
          <button className="theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}>
            <span>{theme === "dark" ? "Dark Quest" : "Sunny Quest"}</span>
            <span>{theme === "dark" ? "Moon On" : "Sun On"}</span>
          </button>
        </header>
        <section className="hero-panel">
          <div className="hero-copy">
            <div className="pill-row">
              <span className="pill">Eggsy Mode</span>
              <span className="pill pill-green">15 topic starter pack</span>
              <span className="pill pill-blue">Dark-mode ready</span>
            </div>
            <h1>Meet Eggsy, the tiny tutor that turns confusion into streaks.</h1>
            <p>
              The experience now leans into a playful, rounded learning style inspired by modern language-learning apps: bold cards, clear progress cues, friendly copy, and a mascot that reacts beautifully in dark mode.
            </p>
            <div className="hero-stats">
              <StatCard value="3" label="Explanation levels" />
              <StatCard value="5" label="Lesson stages" />
              <StatCard value="15" label="Built-in topics" />
            </div>
          </div>
          <div className="hero-mascot-card">
            <div className="mascot-badge">Mascot online</div>
            <EggsyMascot theme={theme} />
            <div className="mascot-caption">
              <strong>Eggsy adapts with the theme.</strong>
              <span>Soft shell in light mode, moonlit shell and brighter yolk glow in dark mode.</span>
            </div>
          </div>
        </section>

        <section className="mission-strip">
          <div className="mission-card lime"><span className="mission-eyebrow">How it feels</span><strong>Playful, bold, and guided</strong><p>Rounded surfaces, strong contrast, supportive microcopy, and big-action buttons.</p></div>
          <div className="mission-card yellow"><span className="mission-eyebrow">How it teaches</span><strong>Step by step, never overwhelming</strong><p>Foundation first, then process, then example, then a teach-back loop.</p></div>
          <div className="mission-card blue"><span className="mission-eyebrow">How it adapts</span><strong>Mood-aware and level-aware</strong><p>The lesson path changes with learner mood, explanation style, and confidence.</p></div>
        </section>

        <section className="panel profile-panel">
          <div className="section-heading"><span className="eyebrow">Learner Setup</span><h2>Tell Eggsy how you learn best</h2></div>
          <div className="grid two-up">
            <Field label="Learner name"><input className="input" value={learnerName} onChange={(event) => setLearnerName(event.target.value)} placeholder="Optional" /></Field>
            <Field label="Current mental state"><select className="input" value={mood} onChange={(event) => setMood(event.target.value)}>{MOODS.map((option) => <option key={option} value={option}>{capitalize(option)}</option>)}</select></Field>
            <Field label="Preferred explanation style"><select className="input" value={preferredStyle} onChange={(event) => setPreferredStyle(event.target.value)}>{STYLES.map((option) => <option key={option} value={option}>{capitalize(option)}</option>)}</select></Field>
            <Field label="Known confusion pattern"><input className="input" value={confusionPattern} onChange={(event) => setConfusionPattern(event.target.value)} placeholder="Example: loses track during multi-step processes" /></Field>
          </div>
          <Field label="Previous learning behavior"><textarea className="input textarea" value={previousBehavior} onChange={(event) => setPreviousBehavior(event.target.value)} placeholder="Example: understands analogies quickly but gets lost in formulas" rows={3} /></Field>
        </section>

        <section className="panel concept-panel">
          <div className="section-heading"><span className="eyebrow">Choose A Concept</span><h2>Pick a topic and let Eggsy hatch a lesson</h2></div>
          <div className={`input-shell ${inputFocused ? "focused" : ""}`}>
            <input
              ref={inputRef}
              className="concept-input"
              value={concept}
              onChange={(event) => setConcept(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void handleExplain()}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Pick one of the 15 predefined topics or type your own concept"
            />
            <button className="cta-button" onClick={() => void handleExplain()} disabled={!concept.trim() || loading}>{loading ? "Hatching..." : "Teach Me"}</button>
          </div>
          <div className="topic-grid">
            {topics.map((topic) => (
              <button key={topic.slug} className="topic-chip" onClick={() => { setConcept(topic.title); inputRef.current?.focus(); }}>
                <span>{topic.title}</span><small>{topic.category}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="level-grid">
          {LEVELS.map((level) => (
            <button key={level.id} className={`level-card ${activeLevel === level.id ? "active" : ""}`} onClick={() => setActiveLevel(level.id)}>
              <div className="level-bar" style={{ background: level.accent }} />
              <strong>{level.label}</strong>
              <span>{level.sublabel}</span>
              <p>{level.description}</p>
            </button>
          ))}
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        {lesson ? (
          <div ref={resultsRef} className="lesson-stack">
            <section className="panel lesson-hero">
              <div><span className="eyebrow">Current Mission</span><h2>{lesson.topic.title}</h2><p>{lesson.topic.shortSummary}</p></div>
              <div className="snapshot-card">
                <span className="eyebrow">Learner snapshot</span>
                <div className="snapshot-line"><span>Level</span><strong>{capitalize(lesson.learnerSnapshot.level)}</strong></div>
                <div className="snapshot-line"><span>Mood</span><strong>{capitalize(lesson.learnerSnapshot.mood)}</strong></div>
                <div className="snapshot-line"><span>Style</span><strong>{capitalize(lesson.learnerSnapshot.preferredStyle)}</strong></div>
              </div>
            </section>

            <section className="panel active-explainer">
              <div className="tabs">
                {LEVELS.map((level) => (
                  <button key={level.id} className={`tab ${activeLevel === level.id ? "active" : ""}`} onClick={() => setActiveLevel(level.id)}>
                    <span className="dot" style={{ background: level.accent }} />
                    <div><strong>{level.label}</strong><small>{level.sublabel}</small></div>
                  </button>
                ))}
              </div>
              <div className="explanation-card" style={{ borderColor: currentLevel?.accent }}><span className="eyebrow">{currentLevel?.label} explanation</span><p>{activeLevelText}</p></div>
            </section>
            <section className="grid lesson-stage-grid">
              {lesson.stages.map((stage) => (
                <article key={stage.id} className="stage-card"><span className="eyebrow">{stage.title}</span><p>{stage.body}</p></article>
              ))}
            </section>

            <section className="grid two-up">
              <article className="panel info-panel"><span className="eyebrow">Confusion hotspots</span><div className="bullet-stack">{lesson.confusionHotspots.map((item) => <div key={item} className="bullet-card">{item}</div>)}</div></article>
              <article className="panel info-panel"><span className="eyebrow">Adaptive coaching</span><div className="bullet-stack">{lesson.adaptiveTips.map((item) => <div key={item} className="bullet-card">{item}</div>)}</div></article>
            </section>

            <section className="panel feedback-panel">
              <div className="section-heading"><span className="eyebrow">Understanding Check</span><h2>Teach it back to Eggsy</h2></div>
              <div className="grid two-up">
                <div className="question-box">
                  {lesson.checkInQuestions.map((question) => <div key={question} className="question-row">{question}</div>)}
                  <div className="toggle-row">
                    <button className={`toggle-pill ${understood ? "active" : ""}`} onClick={() => setUnderstood(true)}>Yes, mostly</button>
                    <button className={`toggle-pill ${!understood ? "active danger" : ""}`} onClick={() => setUnderstood(false)}>Not yet</button>
                  </div>
                </div>
                <div>
                  <textarea className="input textarea dark" value={learnerExplanation} onChange={(event) => setLearnerExplanation(event.target.value)} rows={5} placeholder="Explain the topic back in your own words." />
                  <input className="input dark" value={confusionArea} onChange={(event) => setConfusionArea(event.target.value)} placeholder="Still confused about..." />
                  <button className="cta-button wide" onClick={() => void handleFeedbackSubmit()} disabled={feedbackLoading}>{feedbackLoading ? "Checking..." : "Evaluate Understanding"}</button>
                </div>
              </div>
              {feedback ? <div className="coach-response"><span className="eyebrow">Eggsy says</span><p>{feedback.coachingResponse}</p><small>Concept overlap score: {feedback.overlapScore}</small></div> : null}
            </section>
          </div>
        ) : (
          <section className="panel library-panel">
            <div className="section-heading"><span className="eyebrow">Starter Library</span><h2>Browse Eggsy's ready-made quests</h2></div>
            <div className="grid two-up">
              {topics.slice(0, 8).map((topic) => (
                <article key={topic.slug} className="library-card"><small>{topic.category}</small><strong>{topic.title}</strong><p>{topic.shortSummary}</p></article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function EggsyMascot({ theme, compact = false }) {
  return (
    <svg viewBox="0 0 220 220" className={compact ? "eggsy compact" : "eggsy"} aria-label="Eggsy mascot">
      <defs>
        <linearGradient id={`yolk-${theme}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={theme === "dark" ? "#ffd84d" : "#ffd84a"} />
          <stop offset="100%" stopColor={theme === "dark" ? "#ffb703" : "#ffca3a"} />
        </linearGradient>
      </defs>
      <ellipse cx="110" cy="198" rx="52" ry="10" fill={theme === "dark" ? "rgba(0,0,0,0.28)" : "rgba(18,26,20,0.12)"} />
      <path d="M110 20C73 20 48 60 48 111v21c0 39 28 68 62 68s62-29 62-68v-21c0-51-25-91-62-91Z" fill={theme === "dark" ? "#edf2ff" : "#fffaf0"} stroke={theme === "dark" ? "#c7d2fe" : "#32415f"} strokeWidth="8" />
      <path d="M48 128c14 18 39 30 62 30s48-12 62-30v6c0 39-28 66-62 66s-62-27-62-66Z" fill={`url(#yolk-${theme})`} stroke={theme === "dark" ? "#c7d2fe" : "#32415f"} strokeWidth="8" strokeLinejoin="round" />
      <path d="M44 136c-16 8-24 18-24 28 0 8 6 13 15 13 10 0 18-5 26-15" fill={theme === "dark" ? "#ffcc33" : "#ffd54f"} stroke={theme === "dark" ? "#c7d2fe" : "#32415f"} strokeWidth="8" strokeLinecap="round" />
      <path d="M176 136c16 8 24 18 24 28 0 8-6 13-15 13-10 0-18-5-26-15" fill={theme === "dark" ? "#ffcc33" : "#ffd54f"} stroke={theme === "dark" ? "#c7d2fe" : "#32415f"} strokeWidth="8" strokeLinecap="round" />
      <path d="M80 80c-10-6-19-5-28 2" fill="none" stroke="#32415f" strokeWidth="7" strokeLinecap="round" />
      <path d="M140 80c10-6 19-5 28 2" fill="none" stroke="#32415f" strokeWidth="7" strokeLinecap="round" />
      <circle cx="77" cy="112" r="16" fill="#32415f" />
      <circle cx="143" cy="112" r="16" fill="#32415f" />
      <circle cx="83" cy="106" r="5" fill="#ffffff" />
      <circle cx="149" cy="106" r="5" fill="#ffffff" />
      <path d="M96 136c0 10 8 18 14 18s14-8 14-18c-7 2-12 3-14 3s-7-1-14-3Z" fill="#32415f" />
      <path d="M99 149c3 5 8 8 11 8s8-3 11-8c-4-2-8-3-11-3s-7 1-11 3Z" fill="#ff7b7b" />
      <ellipse cx="77" cy="128" rx="8" ry="4" fill={theme === "dark" ? "#475569" : "#4d5d79"} opacity="0.5" />
      <ellipse cx="143" cy="128" rx="8" ry="4" fill={theme === "dark" ? "#475569" : "#4d5d79"} opacity="0.5" />
    </svg>
  );
}

function Field({ label, children }) {
  return <label className="field-wrap"><span className="field-label">{label}</span>{children}</label>;
}

function StatCard({ value, label }) {
  return <div className="stat-card"><strong>{value}</strong><span>{label}</span></div>;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function createLocalLesson({ topic, learnerLevel, mood, preferredStyle, confusionPattern, previousBehavior }) {
  const tone = getMoodTone(mood);
  const styleLens = getStyleLens(preferredStyle);
  const levelGuide = getLevelGuide(learnerLevel);
  const title = topic.title;
  const summary = topic.shortSummary || `${title} is easier to learn when you move from purpose to process to example.`;
  return {
    topic: {
      slug: topic.slug || null, title, category: topic.category || "Custom", shortSummary: summary,
      foundation: `${title} starts making sense once we define what it is, why it matters, and what problem it solves.`,
      coreIdea: `${title} is best understood by focusing on its main purpose, the key parts involved, and the outcome it creates.`,
      howItWorks: `Break ${title} into a simple sequence: inputs, transformation, output, and what changes at each step.`,
      realWorldExample: `Imagine using ${title} in a practical real-life scenario where its result becomes easy to observe.`,
      summary: `${title} becomes easier when you connect the big idea, the process, and one concrete example.`,
    },
    learnerSnapshot: { level: learnerLevel, mood, preferredStyle, confusionPattern, previousBehavior },
    stages: [
      { id: "foundation", title: "Foundation", body: `${levelGuide.foundationLead} ${title} matters because it helps explain or solve something important.` },
      { id: "core", title: "Core Idea", body: `${styleLens.coreFraming} ${title} has a core purpose and a set of parts that work together toward a result.` },
      { id: "how", title: "How It Works", body: `${levelGuide.processHint} First identify the starting point, then follow the steps, then look at the final effect.` },
      { id: "example", title: "Real-World Example", body: `${styleLens.exampleLead} ${summary}` },
      { id: "summary", title: "Summary", body: `${tone.memoryCue} ${title} is easiest to remember as purpose + process + example.` },
    ],
    levelExplanations: {
      child: `${tone.encouragement} Think of ${title} like a helpful tool with one big job. First we learn what it does, then we see the steps, then we try a simple example.`,
      beginner: `${styleLens.beginnerLead} ${title} makes more sense when you define the key idea clearly, follow the steps in order, and connect it to a real use case.`,
      expert: `${levelGuide.expertLead} A solid explanation of ${title} should identify the mechanism, system boundaries, assumptions, and possible limitations.`,
    },
    adaptiveTips: [
      tone.studyTip,
      styleLens.studyAdvice,
      confusionPattern ? `Watch for this confusion pattern: ${confusionPattern}. Slow down when you reach that point.` : "Pause after each stage and restate it in one sentence before moving on.",
    ],
    confusionHotspots: ["Jumping to the result before understanding the process", "Using a label without defining what it means", "Remembering the example but not the mechanism"],
    checkInQuestions: [`In one sentence, what is the main job of ${title}?`, "Which part still feels unclear: the idea, the process, or the example?", `Teach ${title} back as if you were helping a classmate.`],
  };
}

function createLocalFeedback({ understood, learnerExplanation, confusionArea, lesson }) {
  const overlapScore = scoreExplanation(learnerExplanation, `${lesson?.topic?.summary || ""} ${lesson?.topic?.shortSummary || ""}`);
  if (confusionArea.trim()) return { overlapScore, nextAction: "reteach", coachingResponse: `Focus on "${confusionArea}" first. Re-read the core idea and explain it again in two short sentences.` };
  if (understood && overlapScore >= 0.2) return { overlapScore, nextAction: "advance", coachingResponse: "Nice work. Your explanation is capturing the main idea. Try comparing the foundation stage to the process stage to deepen your understanding." };
  return { overlapScore, nextAction: "reteach", coachingResponse: `Let's simplify it one more step. Start with the purpose of ${lesson?.topic?.title || "the topic"}, then describe only one key step in the process.` };
}

function getMoodTone(mood) {
  const tones = {
    focused: { encouragement: "You are in a strong place to go deeper.", memoryCue: "Memory cue:", studyTip: "Stay with the exact mechanism instead of only the final answer." },
    overwhelmed: { encouragement: "We will keep this gentle and one step at a time.", memoryCue: "Small takeaway:", studyTip: "Read one stage, pause, and paraphrase it before moving on." },
    curious: { encouragement: "Let curiosity lead and connect each idea to a question.", memoryCue: "Interesting takeaway:", studyTip: "Ask what would happen if one part of the process changed." },
    tired: { encouragement: "We will keep the explanation compact and low-friction.", memoryCue: "Quick takeaway:", studyTip: "Focus on the foundation and summary first, then revisit details." },
  };
  return tones[mood] || tones.focused;
}

function getStyleLens(style) {
  const stylesMap = {
    analogy: { coreFraming: "Here is the big idea through a mental picture.", exampleLead: "Picture it like this in daily life.", beginnerLead: "Using an analogy-first explanation:", studyAdvice: "If you get stuck, map each analogy part to the real concept." },
    story: { coreFraming: "Think of the concept as a sequence with characters and roles.", exampleLead: "Now place it inside a short story-like situation.", beginnerLead: "Using a story-driven explanation:", studyAdvice: "Retell the process as a short story with cause and effect." },
    technical: { coreFraming: "We will define the system precisely before simplifying it.", exampleLead: "Now anchor the abstraction in a practical use case.", beginnerLead: "Using a structure-first explanation:", studyAdvice: "List the components, then note what each one does." },
    simple: { coreFraming: "Strip away extra detail and keep only the essential idea.", exampleLead: "Use one practical example to lock it in.", beginnerLead: "Using the simplest clear explanation:", studyAdvice: "Turn each stage into one short sentence in your own words." },
  };
  return stylesMap[style] || stylesMap.analogy;
}

function getLevelGuide(level) {
  const levelsMap = {
    child: { foundationLead: "Start from zero and use familiar words.", processHint: "Walk through the steps slowly and visibly.", expertLead: "Even at a high-detail level, keep the explanation intuitive first." },
    beginner: { foundationLead: "Assume no background and define the basic pieces first.", processHint: "Follow the process in a clean step-by-step order.", expertLead: "Add precision while still connecting each detail to the learner's mental model." },
    expert: { foundationLead: "Use the foundation to align terminology before adding nuance.", processHint: "Focus on the internal mechanism, dependencies, and edge cases.", expertLead: "Here is the deeper technical framing." },
  };
  return levelsMap[level] || levelsMap.beginner;
}

function scoreExplanation(learnerText, referenceText) {
  const learnerTokens = tokenize(learnerText);
  const referenceTokens = new Set(tokenize(referenceText));
  if (!learnerTokens.length) return 0;
  let matches = 0;
  for (const token of learnerTokens) if (referenceTokens.has(token)) matches += 1;
  return Number((matches / learnerTokens.length).toFixed(2));
}

function tokenize(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length > 2);
}

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800;900&display=swap');
:root { --bg:#0e1510; --bg-soft:#16201a; --panel:#18231c; --panel-2:#202d25; --panel-3:#25352a; --text:#f6fff7; --muted:#adc5b3; --line:rgba(255,255,255,0.09); --shadow:0 18px 50px rgba(0,0,0,0.28); --lime:#58cc02; --lime-deep:#46a302; --sun:#ffd84a; --sky:#66a9ff; --danger:#ff6b6b; }
:root[data-theme="light"] { --bg:#f4f7ee; --bg-soft:#eef5df; --panel:#ffffff; --panel-2:#fbfff6; --panel-3:#f3f8ea; --text:#1d241d; --muted:#6f7d73; --line:rgba(34,44,34,0.09); --shadow:0 18px 50px rgba(60,94,55,0.12); --lime:#58cc02; --lime-deep:#46a302; --sun:#ffca3a; --sky:#4d8ff7; --danger:#f25f5c; }
*{box-sizing:border-box} body{margin:0;font-family:'Nunito',sans-serif;background:var(--bg);color:var(--text)} button,input,textarea,select{font:inherit}
.app-shell{min-height:100vh;background:radial-gradient(circle at top left, rgba(88,204,2,0.18), transparent 24%),radial-gradient(circle at 80% 10%, rgba(102,169,255,0.14), transparent 22%),linear-gradient(180deg, var(--bg) 0%, var(--bg-soft) 100%);color:var(--text);position:relative;overflow-x:hidden}
.background-orb{position:fixed;border-radius:999px;filter:blur(80px);opacity:.25;pointer-events:none}.orb-one{width:340px;height:340px;background:var(--lime);top:-100px;left:-80px}.orb-two{width:280px;height:280px;background:var(--sun);right:-80px;top:160px}
.page-frame{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:28px 0 72px;position:relative;z-index:1}.topbar,.hero-panel,.mission-strip,.grid,.level-grid,.tabs,.toggle-row,.hero-stats,.pill-row,.brand-wrap{display:flex;gap:16px}.topbar,.hero-panel,.mission-strip,.toggle-row{align-items:center}.topbar,.hero-panel{justify-content:space-between}.hero-panel,.mission-strip,.lesson-stack{margin-top:22px}.grid,.level-grid,.topic-grid,.bullet-stack{display:grid}
.brand-chip,.theme-toggle,.panel,.mission-card,.level-card,.topic-chip,.stat-card,.library-card,.stage-card,.bullet-card,.error-banner,.snapshot-card,.explanation-card,.question-box,.coach-response{border:2px solid var(--line);box-shadow:var(--shadow)}
.brand-chip{width:66px;height:66px;border-radius:22px;background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);display:grid;place-items:center}.brand-title{font-size:34px;font-weight:900;line-height:1}.brand-subtitle{color:var(--muted);font-size:14px}.theme-toggle{border-radius:999px;background:var(--panel);color:var(--text);padding:12px 18px;display:flex;gap:18px;align-items:center;cursor:pointer;font-weight:800}
.hero-panel{align-items:stretch;gap:24px}.hero-copy,.hero-mascot-card,.panel,.mission-card,.lesson-hero,.active-explainer,.feedback-panel{background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);border-radius:28px;padding:26px}.hero-copy{flex:1.2;min-width:0}.hero-copy h1{margin:12px 0 14px;font-size:clamp(42px,6vw,72px);line-height:.95;letter-spacing:-.04em}.hero-copy p{color:var(--muted);font-size:18px;line-height:1.7;max-width:680px}.hero-mascot-card{flex:.8;min-width:320px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center}
.mascot-badge,.pill,.eyebrow,.field-label,.mission-eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:11px;font-weight:900}.mascot-badge,.pill{background:rgba(255,255,255,.06);color:var(--text);border-radius:999px;padding:10px 14px}.pill-green{background:rgba(88,204,2,.18)}.pill-blue{background:rgba(102,169,255,.18)}.hero-stats{margin-top:24px;flex-wrap:wrap}.stat-card{min-width:120px;border-radius:24px;background:var(--panel-3);padding:18px}.stat-card strong{display:block;font-size:30px;font-weight:900}.stat-card span{color:var(--muted)}.mascot-caption{display:grid;gap:6px;margin-top:10px}.mascot-caption span{color:var(--muted);line-height:1.6}
.mission-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.mission-card{min-height:164px}.mission-card strong{display:block;font-size:23px;margin:12px 0 8px}.mission-card p{color:var(--muted);margin:0;line-height:1.6}.mission-card.lime{background:linear-gradient(180deg,rgba(88,204,2,.18),var(--panel))}.mission-card.yellow{background:linear-gradient(180deg,rgba(255,216,74,.18),var(--panel))}.mission-card.blue{background:linear-gradient(180deg,rgba(102,169,255,.18),var(--panel))}
.panel{margin-top:22px}.section-heading{margin-bottom:18px}.section-heading h2{margin:8px 0 0;font-size:32px}.eyebrow,.field-label,.mission-eyebrow{color:var(--muted)}.grid.two-up{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.lesson-stage-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.field-wrap{display:grid;gap:8px}
.input-shell{display:flex;border:2px solid var(--line);background:var(--panel-3);border-radius:24px;overflow:hidden;transition:.2s ease}.input-shell.focused{transform:translateY(-1px);border-color:rgba(88,204,2,.45);box-shadow:0 0 0 4px rgba(88,204,2,.12)}.input,.concept-input{width:100%;border:2px solid var(--line);border-radius:20px;background:var(--panel-3);color:var(--text);padding:15px 16px;outline:none}.concept-input{border:0;border-radius:0;background:transparent;padding:19px 20px}.input::placeholder,.concept-input::placeholder,.textarea::placeholder{color:var(--muted)}.textarea{resize:vertical;min-height:120px}.dark{background:rgba(255,255,255,.05)}
.cta-button{border:0;border-bottom:5px solid var(--lime-deep);border-radius:18px;background:var(--lime);color:#fff;padding:16px 22px;font-weight:900;letter-spacing:.02em;cursor:pointer;align-self:flex-start}.cta-button:disabled{cursor:not-allowed;opacity:.65}.cta-button.wide{width:100%;margin-top:14px}
.topic-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px}.topic-chip{background:var(--panel-3);color:var(--text);border-radius:22px;padding:14px 16px;text-align:left;cursor:pointer}.topic-chip span{display:block;font-weight:800;margin-bottom:4px}.topic-chip small{color:var(--muted)}
.level-grid{margin-top:22px;grid-template-columns:repeat(3,minmax(0,1fr))}.level-card{background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);color:var(--text);border-radius:26px;padding:24px;text-align:left;cursor:pointer}.level-card.active{transform:translateY(-4px);box-shadow:0 22px 52px rgba(0,0,0,.28)}.level-bar{width:42px;height:6px;border-radius:999px;margin-bottom:16px}.level-card strong{font-size:24px;display:block}.level-card span,.level-card p{color:var(--muted)}
.error-banner{margin-top:18px;background:rgba(255,107,107,.14);border-radius:18px;padding:16px 18px;color:#ffdede}.lesson-stack{display:grid;gap:22px}.lesson-hero{display:flex;justify-content:space-between;gap:20px;align-items:start}.lesson-hero h2{margin:8px 0 10px;font-size:38px}.lesson-hero p{color:var(--muted);line-height:1.7;max-width:680px}.snapshot-card{min-width:220px;border-radius:24px;background:var(--panel-3);padding:18px}.snapshot-line{display:flex;justify-content:space-between;margin-top:10px;gap:12px}.snapshot-line span{color:var(--muted)}
.tabs{flex-wrap:wrap;margin-bottom:16px}.tab{border:2px solid var(--line);background:var(--panel-3);color:var(--text);border-radius:18px;padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer}.tab.active{background:rgba(88,204,2,.14)}.tab small{color:var(--muted);display:block}.dot{width:12px;height:12px;border-radius:999px}.explanation-card{border-width:2px;border-style:solid;border-radius:26px;background:var(--panel-3);padding:24px}.explanation-card p{margin:10px 0 0;color:var(--text);line-height:1.9;font-size:17px}
.stage-card,.info-panel,.library-card{border-radius:24px;background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);padding:22px}.stage-card p,.library-card p{color:var(--muted);line-height:1.7}.library-card strong{display:block;font-size:24px;margin:8px 0}.library-card small{color:var(--sun);font-weight:800}.bullet-stack{gap:10px;margin-top:12px}.bullet-card{border-radius:18px;background:var(--panel-3);padding:14px 15px;line-height:1.5}
.feedback-panel{margin-bottom:10px}.question-box{border-radius:24px;background:var(--panel-3);padding:18px}.question-row{padding:12px 0;border-bottom:1px solid var(--line);line-height:1.6}.question-row:last-child{border-bottom:0}.toggle-row{margin-top:18px;flex-wrap:wrap}.toggle-pill{border:2px solid var(--line);border-radius:999px;background:var(--panel);color:var(--text);padding:12px 16px;font-weight:800;cursor:pointer}.toggle-pill.active{background:rgba(88,204,2,.16);border-color:rgba(88,204,2,.38)}.toggle-pill.danger.active{background:rgba(255,107,107,.14);border-color:rgba(255,107,107,.35)}
.coach-response{margin-top:20px;border-radius:24px;background:rgba(88,204,2,.12);padding:18px}.coach-response p{margin:8px 0;line-height:1.7}.coach-response small{color:var(--muted)}.eggsy{width:240px;max-width:100%}.eggsy.compact{width:42px}
@media (max-width:960px){.hero-panel,.lesson-hero{flex-direction:column}.mission-strip,.level-grid,.grid.two-up,.lesson-stage-grid{grid-template-columns:1fr}.hero-mascot-card{min-width:0}}
@media (max-width:720px){.page-frame{width:min(100% - 20px,1180px)}.topbar{flex-direction:column;align-items:flex-start}.brand-title{font-size:28px}.hero-copy h1{font-size:42px}.cta-button{width:100%}.input-shell{flex-direction:column}}
`;
