import { useEffect, useMemo, useRef, useState } from "react";
import { LOCAL_TOPIC_LIBRARY } from "./topicLibrary.js";
import { DEFAULT_UI_COPY } from "../shared/localization.js";

const DEFAULT_TOPICS = LOCAL_TOPIC_LIBRARY;
const BUILT_IN_TOPIC_COUNT = DEFAULT_TOPICS.length;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

const LEVELS = [
  { id: "child", label: "Elementary", sublabel: "Ages 6-10", accent: "var(--sun)", description: "Simple language, vivid analogies" },
  { id: "beginner", label: "Intermediate", sublabel: "Build the basics", accent: "var(--lime)", description: "Structured, jargon-free clarity" },
  { id: "expert", label: "Advanced", sublabel: "Domain expertise", accent: "var(--sky)", description: "Technical depth and nuance" },
];

const MOODS = ["focused", "curious", "overwhelmed", "tired"];
const STYLES = ["analogy", "story", "technical", "simple"];

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [concept, setConcept] = useState("");
  const [topics, setTopics] = useState(DEFAULT_TOPICS);
  const [languageOptions, setLanguageOptions] = useState([{ code: "en", name: "English", nativeName: "English" }]);
  const [uiCopy, setUiCopy] = useState(DEFAULT_UI_COPY);
  const [activeLevel, setActiveLevel] = useState("beginner");
  const [learnerName, setLearnerName] = useState("");
  const [interest, setInterest] = useState("");
  const [language, setLanguage] = useState("en");
  const [mood, setMood] = useState("focused");
  const [preferredStyle, setPreferredStyle] = useState("analogy");
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
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [slowQuestions, setSlowQuestions] = useState([]);
  const [hoverInsight, setHoverInsight] = useState("");
  const hoverTimerRef = useRef(null);
  const hoverStartRef = useRef({});
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const previousLanguageRef = useRef("en");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    void Promise.all([loadTopics(), loadLanguages()]);
  }, []);

  useEffect(() => {
    setActiveStageIndex(0);
    setActiveCardIndex(0);
    setFlashcardFlipped(false);
    setQuizAnswers({});
    setSlowQuestions([]);
    setHoverInsight("");
  }, [lesson]);

  useEffect(() => {
    void loadUiCopy(language);
    if (previousLanguageRef.current !== language && lesson && concept.trim()) {
      previousLanguageRef.current = language;
      void handleExplain();
      return;
    }
    previousLanguageRef.current = language;
  }, [language]);

  async function loadLanguages() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/languages`);
      if (!res.ok) throw new Error("Language API unavailable");
      const data = await res.json();
      if (data.languages?.length) {
        setLanguageOptions(data.languages);
      }
    } catch {
      setLanguageOptions([{ code: "en", name: "English", nativeName: "English" }]);
    }
  }

  async function loadUiCopy(languageCode) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ui-copy?language=${languageCode}`);
      if (!res.ok) throw new Error("UI copy unavailable");
      const data = await res.json();
      setUiCopy({
        ...DEFAULT_UI_COPY,
        ...(data.copy || {}),
        moods: { ...DEFAULT_UI_COPY.moods, ...(data.copy?.moods || {}) },
        styles: { ...DEFAULT_UI_COPY.styles, ...(data.copy?.styles || {}) },
      });
    } catch {
      setUiCopy(DEFAULT_UI_COPY);
    }
  }
  async function loadTopics() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/topics`);
      if (!res.ok) throw new Error("Topic API unavailable");
      const data = await res.json();
      setTopics(data.topics?.length ? mergeTopicDetails(data.topics) : DEFAULT_TOPICS);
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
      const res = await fetch(`${API_BASE_URL}/api/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicSlug: matchedTopic?.slug,
          customTopic: matchedTopic ? "" : concept.trim(),
          learnerName,
          learnerLevel: activeLevel,
          mood,
          preferredStyle,
          interest: activeLevel === "child" ? interest : "",
          language: currentLanguageOption?.name || "English",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate lesson");
      setSessionId(data.sessionId);
      setLesson(enrichLesson(data.lesson, activeLevel === "child" ? interest : ""));
      setLearnerExplanation("");
      setConfusionArea("");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch {
      const fallbackLesson = createLocalLesson({
        topic: matchedTopic || { title: concept.trim(), category: "Custom", shortSummary: `A guided explanation for ${concept.trim()}.` },
        learnerLevel: activeLevel,
        mood,
        preferredStyle,
        interest: activeLevel === "child" ? interest : "",
        language: currentLanguageOption?.name || "English",
      });
      setSessionId(`local-${Date.now()}`);
      setLesson(enrichLesson(fallbackLesson, activeLevel === "child" ? interest : ""));
      setLearnerExplanation("");
      setConfusionArea("");
      setError("Live API unavailable, so Eggzy switched to the built-in knowledge library.");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } finally {
      setLoading(false);
    }
  }

  async function handleFeedbackSubmit() {
    if (!sessionId || !lesson) return;
    setFeedbackLoading(true);
    const localAnalysis = analyzeTeachBack(lesson, learnerExplanation, confusionArea, interest, slowQuestions);

    try {
      const res = await fetch(`${API_BASE_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, understood, learnerExplanation, confusionArea }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save feedback");
      setFeedback({ ...data, ...localAnalysis });
    } catch {
      setFeedback(createLocalFeedback({ understood, learnerExplanation, confusionArea, lesson, interest, slowQuestions }));
    } finally {
      setFeedbackLoading(false);
    }
  }

  function handleQuizHover(item) {
    hoverStartRef.current[item.id] = Date.now();
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setHoverInsight(item.hint);
      setSlowQuestions((current) => (current.includes(item.id) ? current : [...current, item.id]));
    }, 2600);
  }

  function clearQuizHover(itemId) {
    window.clearTimeout(hoverTimerRef.current);
    const start = hoverStartRef.current[itemId];
    if (start && Date.now() - start > 2600) {
      setSlowQuestions((current) => (current.includes(itemId) ? current : [...current, itemId]));
    }
  }

  const localizedLevels = useMemo(() => LEVELS.map((level) => ({
    ...level,
    label: level.id === "child" ? uiCopy.elementary : level.id === "beginner" ? uiCopy.intermediate : uiCopy.advanced,
    sublabel: level.id === "child" ? uiCopy.elementarySublabel : level.id === "beginner" ? uiCopy.intermediateSublabel : uiCopy.advancedSublabel,
    description: level.id === "child" ? uiCopy.elementaryDescription : level.id === "beginner" ? uiCopy.intermediateDescription : uiCopy.advancedDescription,
  })), [uiCopy]);
  const currentLanguageOption = languageOptions.find((option) => option.code === language) || languageOptions[0];
  const currentLevel = localizedLevels.find((level) => level.id === activeLevel);
  const activeLevelText = useMemo(() => lesson?.levelExplanations?.[activeLevel] || "", [lesson, activeLevel]);
  const activeStage = lesson?.stages?.[activeStageIndex] || null;
  const activeExplanationLabel = activeLevel === "child" ? uiCopy.elementaryExplanation : activeLevel === "beginner" ? uiCopy.intermediateExplanation : uiCopy.advancedExplanation;
  const flashcards = lesson?.flashcards || [];
  const activeFlashcard = flashcards[activeCardIndex] || null;
  const quizItems = lesson?.quizQuestions || [];
  const quizScore = quizItems.reduce((total, item) => total + (quizAnswers[item.id] === item.correctAnswer ? 1 : 0), 0);

  return (
    <div className="app-shell">
      <style>{styles}</style>
      <div className="background-orb orb-one" />
      <div className="background-orb orb-two" />
      <div className="page-frame">
        <header className="topbar">
          <div className="brand-wrap">
            <div className="brand-chip"><EggzyMascot theme={theme} compact /></div>
            <div>
              <div className="brand-title">Eggzy</div>
              <div className="brand-subtitle">{uiCopy.tagline}</div>
            </div>
          </div>
          <button className="theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}>
            <span>{theme === "dark" ? uiCopy.themeDarkQuest : uiCopy.themeSunnyQuest}</span>
            <span>{theme === "dark" ? uiCopy.themeMoonOn : uiCopy.themeSunOn}</span>
          </button>
        </header>

        <section className="hero-panel">
          <div className="hero-copy">

            <h1>{uiCopy.heroTitle}</h1>
            <p>
              {uiCopy.heroBody}
            </p>
            <div className="hero-stats">
              <StatCard value="5" label={uiCopy.heroLessons} />
              <StatCard value="MCQ" label={uiCopy.heroQuiz} />
              <StatCard value="Revise" label={uiCopy.heroRevise} />
            </div>
          </div>
          <div className="hero-mascot-card">
            <EggzyMascot theme={theme} />
            <div className="mascot-caption">
              <strong>{uiCopy.heroMascotTitle}</strong>
              <span>{uiCopy.heroMascotBody}</span>
            </div>
          </div>
        </section>

        <section className="panel profile-panel">
          <div className="section-heading"><span className="eyebrow">{uiCopy.learnerSetupEyebrow}</span><h2>{uiCopy.learnerSetupTitle}</h2></div>
          <div className="grid two-up">
            {activeLevel === "child" ? <Field label={uiCopy.interestHook}><input className="input" value={interest} onChange={(event) => setInterest(event.target.value)} placeholder="Example: cricket lover, gamer, artist" /></Field> : <div />}
            <Field label={uiCopy.language}><select className="input" value={language} onChange={(event) => setLanguage(event.target.value)}>{languageOptions.map((option) => <option key={option.code} value={option.code}>{option.nativeName} ({option.name})</option>)}</select></Field>
            <Field label={uiCopy.learnerName}><input className="input" value={learnerName} onChange={(event) => setLearnerName(event.target.value)} placeholder={uiCopy.optional} /></Field>
            <Field label={uiCopy.currentMentalState}><select className="input" value={mood} onChange={(event) => setMood(event.target.value)}>{MOODS.map((option) => <option key={option} value={option}>{uiCopy.moods?.[option] || capitalize(option)}</option>)}</select></Field>
            {activeLevel !== "child" ? <Field label={uiCopy.explanationStyle}><select className="input" value={preferredStyle} onChange={(event) => setPreferredStyle(event.target.value)}>{STYLES.map((option) => <option key={option} value={option}>{uiCopy.styles?.[option] || capitalize(option)}</option>)}</select></Field> : null}
          </div>
        </section>

        <section className="panel concept-panel">
          <div className="section-heading"><span className="eyebrow">{uiCopy.chooseConceptEyebrow}</span><h2>{uiCopy.chooseConceptTitle}</h2></div>
          <div className={`input-shell ${inputFocused ? "focused" : ""}`}>
            <input
              ref={inputRef}
              className="concept-input"
              value={concept}
              onChange={(event) => setConcept(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void handleExplain()}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={uiCopy.conceptPlaceholder}
            />
            <button className="cta-button" onClick={() => void handleExplain()} disabled={!concept.trim() || loading}>{loading ? uiCopy.teaching : uiCopy.teachMe}</button>
          </div>
          <div className="topic-grid">
            {topics.slice(0, 12).map((topic) => (
              <button key={topic.slug} className="topic-chip" onClick={() => { setConcept(topic.title); inputRef.current?.focus(); }}>
                <span>{topic.title}</span><small>{topic.category}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="level-grid">
          {localizedLevels.map((level) => (
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
              <div>
                <span className="eyebrow">{uiCopy.currentMission}</span>
                <h2>{lesson.topic.title}</h2>
                <p>{lesson.topic.shortSummary}</p>
              </div>
              <div className="snapshot-card">
                <span className="eyebrow">{uiCopy.learnerSnapshot}</span>
                <div className="snapshot-line"><span>{uiCopy.level}</span><strong>{capitalize(lesson.learnerSnapshot.level)}</strong></div>
                <div className="snapshot-line"><span>{uiCopy.mood}</span><strong>{uiCopy.moods?.[lesson.learnerSnapshot.mood] || capitalize(lesson.learnerSnapshot.mood)}</strong></div>
                {lesson.learnerSnapshot.level !== "child" ? <div className="snapshot-line"><span>{uiCopy.style}</span><strong>{uiCopy.styles?.[lesson.learnerSnapshot.preferredStyle] || capitalize(lesson.learnerSnapshot.preferredStyle)}</strong></div> : null}
                <div className="snapshot-line"><span>{uiCopy.language}</span><strong>{lesson.learnerSnapshot.language || "English"}</strong></div>
                {lesson.learnerSnapshot.level === "child" ? <div className="snapshot-line"><span>{uiCopy.interest}</span><strong>{lesson.learnerSnapshot.interest || "General"}</strong></div> : null}
              </div>
            </section>

            <section className="panel deep-explainer">
              <div className="tabs">
                {localizedLevels.map((level) => (
                  <button key={level.id} className={`tab ${activeLevel === level.id ? "active" : ""}`} onClick={() => setActiveLevel(level.id)}>
                    <span className="dot" style={{ background: level.accent }} />
                    <div><strong>{level.label}</strong><small>{level.sublabel}</small></div>
                  </button>
                ))}
              </div>
              <div className="explanation-card long-form" style={{ borderColor: currentLevel?.accent }}>
                <span className="eyebrow">{activeExplanationLabel}</span>
                <p>{activeLevelText}</p>
              </div>
              {activeLevel !== "child" ? (
                <div className="learning-modes grid three-up">
                  <ModeCard title={uiCopy.analogyLens} body={lesson.learningModes.analogy} />
                  <ModeCard title={uiCopy.stepByStepLens} body={lesson.learningModes.stepByStep} />
                  <ModeCard title={uiCopy.realLifeLens} body={lesson.learningModes.realLife} />
                </div>
              ) : null}
            </section>

            <section className="panel navigator-panel">
              <div className="section-heading"><span className="eyebrow">{uiCopy.lessonNavigationEyebrow}</span><h2>{uiCopy.lessonNavigationTitle}</h2></div>
              <div className="slide-shell">
                <button className="nav-arrow" onClick={() => setActiveStageIndex((current) => Math.max(0, current - 1))} disabled={activeStageIndex === 0}>‹</button>
                <div className="slide-card">
                  <div className="slide-progress">{activeStageIndex + 1} / {lesson.stages.length}</div>
                  <h3>{activeStage?.title}</h3>
                  <p>{activeStage?.body}</p>
                </div>
                <button className="nav-arrow" onClick={() => setActiveStageIndex((current) => Math.min(lesson.stages.length - 1, current + 1))} disabled={activeStageIndex === lesson.stages.length - 1}>›</button>
              </div>
              <div className="progress-dots">
                {lesson.stages.map((stage, index) => (
                  <button key={stage.id} className={`progress-dot ${index === activeStageIndex ? "active" : ""}`} onClick={() => setActiveStageIndex(index)}>{stage.title}</button>
                ))}
              </div>
            </section>

            <section className="grid two-up">
              <article className="panel info-panel"><span className="eyebrow">{uiCopy.confusionHotspots}</span><div className="bullet-stack">{lesson.confusionHotspots.map((item) => <div key={item} className="bullet-card">{item}</div>)}</div></article>
              <article className="panel info-panel"><span className="eyebrow">{uiCopy.adaptiveCoaching}</span><div className="bullet-stack">{lesson.adaptiveTips.map((item) => <div key={item} className="bullet-card">{item}</div>)}</div></article>
            </section>

            <section className="grid two-up">
              <article className="panel info-panel flashcards-panel">
                <div className="section-heading"><span className="eyebrow">{uiCopy.flashcards}</span><h2>{uiCopy.reviseQuick}</h2></div>
                {activeFlashcard ? (
                  <>
                    <button className={`flashcard ${flashcardFlipped ? "flipped" : ""}`} onClick={() => setFlashcardFlipped((current) => !current)}>
                      <span className="flashcard-face">{flashcardFlipped ? activeFlashcard.back : activeFlashcard.front}</span>
                      <small>{flashcardFlipped ? uiCopy.tapPrompt : uiCopy.tapReveal}</small>
                    </button>
                    <div className="flashcard-nav">
                      <button className="mini-button" onClick={() => { setActiveCardIndex((current) => Math.max(0, current - 1)); setFlashcardFlipped(false); }} disabled={activeCardIndex === 0}>{uiCopy.previous}</button>
                      <span>{activeCardIndex + 1} / {flashcards.length}</span>
                      <button className="mini-button" onClick={() => { setActiveCardIndex((current) => Math.min(flashcards.length - 1, current + 1)); setFlashcardFlipped(false); }} disabled={activeCardIndex === flashcards.length - 1}>{uiCopy.next}</button>
                    </div>
                  </>
                ) : null}
              </article>

              <article className="panel info-panel quiz-panel">
                <div className="section-heading"><span className="eyebrow">{uiCopy.quizMode}</span><h2>{uiCopy.quizTitle}</h2></div>
                <div className="quiz-score">{uiCopy.score}: {quizScore} / {quizItems.length}</div>
                <div className="quiz-list">
                  {quizItems.map((item, index) => (
                    <div key={item.id} className="quiz-question" onMouseEnter={() => handleQuizHover(item)} onMouseLeave={() => clearQuizHover(item.id)}>
                      <div className="quiz-question-head">
                        <strong>Q{index + 1}. {item.prompt}</strong>
                        {slowQuestions.includes(item.id) ? <span className="slow-chip">{uiCopy.needsReteach}</span> : null}
                      </div>
                      <div className="quiz-options">
                        {item.options.map((option, optionIndex) => {
                          const selected = quizAnswers[item.id] === optionIndex;
                          const correct = quizAnswers[item.id] != null && optionIndex === item.correctAnswer;
                          const wrong = selected && quizAnswers[item.id] !== item.correctAnswer;
                          return (
                            <button key={option} className={`quiz-option ${selected ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}`} onClick={() => setQuizAnswers((current) => ({ ...current, [item.id]: optionIndex }))}>
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {hoverInsight ? <div className="coach-response"><span className="eyebrow">{uiCopy.hesitationTitle}</span><p>{hoverInsight}</p></div> : null}
              </article>
            </section>

            <section className="panel feedback-panel">
              <div className="section-heading"><span className="eyebrow">{uiCopy.teachTopicEyebrow}</span><h2>{uiCopy.teachTopicTitle}</h2></div>
              <div className="grid two-up">
                <div className="question-box">
                  {lesson.checkInQuestions.map((question) => <div key={question} className="question-row">{question}</div>)}
                  <div className="toggle-row">
                    <button className={`toggle-pill ${understood ? "active" : ""}`} onClick={() => setUnderstood(true)}>{uiCopy.yesMostly}</button>
                    <button className={`toggle-pill ${!understood ? "active danger" : ""}`} onClick={() => setUnderstood(false)}>{uiCopy.notYet}</button>
                  </div>
                  <div className="slow-summary">{uiCopy.slowQuestions}: {slowQuestions.length ? slowQuestions.length : uiCopy.noneYet}</div>
                </div>
                <div>
                  <textarea className="input textarea dark" value={learnerExplanation} onChange={(event) => setLearnerExplanation(event.target.value)} rows={8} placeholder={uiCopy.teachBackPlaceholder} />
                  <input className="input dark" value={confusionArea} onChange={(event) => setConfusionArea(event.target.value)} placeholder={uiCopy.confusionPlaceholder} />
                  <button className="cta-button wide" onClick={() => void handleFeedbackSubmit()} disabled={feedbackLoading}>{feedbackLoading ? uiCopy.checking : uiCopy.evaluateUnderstanding}</button>
                </div>
              </div>

              {feedback ? (
                <div className="teachback-grid grid two-up">
                  <div className="coach-response"><span className="eyebrow">{uiCopy.eggzySays}</span><p>{feedback.coachingResponse}</p><small>{uiCopy.overlapScore}: {feedback.overlapScore}</small></div>
                  <div className="panel insight-panel">
                    <span className="eyebrow">{uiCopy.teachBackAnalysis}</span>
                    <div className="bullet-stack">
                      {feedback.strongPoints?.map((item) => <div key={item} className="bullet-card success-card">{uiCopy.strong}: {item}</div>)}
                      {feedback.missedConcepts?.map((item) => <div key={item} className="bullet-card warning-card">{uiCopy.missing}: {item}</div>)}
                      {feedback.reteachSteps?.map((item) => <div key={item} className="bullet-card">{uiCopy.reteach}: {item}</div>)}
                    </div>
                  </div>
                </div>
              ) : null}

              {feedback?.questionBank?.length ? (
                <div className="question-bank panel">
                  <div className="section-heading"><span className="eyebrow">{uiCopy.reverseTeachingBank}</span><h2>{uiCopy.reverseTeachingTitle}</h2></div>
                  <div className="bullet-stack">{feedback.questionBank.map((item) => <div key={item} className="bullet-card">{item}</div>)}</div>
                </div>
              ) : null}
            </section>
          </div>
        ) : (
          <section className="panel library-panel">
            <div className="section-heading"><span className="eyebrow">{uiCopy.starterLibraryEyebrow}</span><h2>{uiCopy.starterLibraryTitle}</h2></div>
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

function EggzyMascot({ theme, compact = false }) {
  const shellStroke = theme === "dark" ? "#d6e2da" : "#31415c";
  const shellFill = theme === "dark" ? "#fffef7" : "#fffdfa";
  const wingFill = theme === "dark" ? "#ffd85a" : "#ffd454";

  return (
    <svg viewBox="0 0 220 220" className={compact ? "eggzy compact" : "eggzy"} aria-label="Eggzy mascot">
      <ellipse cx="110" cy="190" rx="62" ry="12" fill={theme === "dark" ? "rgba(0,0,0,0.22)" : "rgba(54,41,18,0.12)"} />
      <ellipse cx="55" cy="132" rx="20" ry="30" fill={wingFill} stroke={shellStroke} strokeWidth="6" />
      <ellipse cx="165" cy="132" rx="20" ry="30" fill={wingFill} stroke={shellStroke} strokeWidth="6" />
      <path d="M110 25C74 25 53 55 53 109c0 52 24 82 57 82s57-30 57-82c0-54-21-84-57-84Z" fill={shellFill} stroke={shellStroke} strokeWidth="8" />
      <path d="M54 133c13 30 34 49 56 49 24 0 45-19 57-49-16 13-37 20-57 20-21 0-42-7-56-20Z" fill={wingFill} stroke={shellStroke} strokeWidth="8" strokeLinejoin="round" />
      <path d="M85 88c-9 0-16 9-16 19s7 18 16 18 16-8 16-18-7-19-16-19Zm50 0c-9 0-16 9-16 19s7 18 16 18 16-8 16-18-7-19-16-19Z" fill="#26324a" />
      <circle cx="80" cy="102" r="4" fill="#ffffff" />
      <circle cx="130" cy="102" r="4" fill="#ffffff" />
      <path d="M91 141c7 8 26 8 34 0v-8c0-6-4-8-8-6l-8 4-8-4c-4-2-10 0-10 6Z" fill="#26324a" />
      <path d="M97 142c4 6 18 6 22 0-4-2-8-3-11-3s-7 1-11 3Z" fill="#ff7f7b" />
      <path d="M74 77c8-10 20-11 29-6" fill="none" stroke={shellStroke} strokeWidth="6" strokeLinecap="round" />
      <path d="M145 77c-8-10-20-11-29-6" fill="none" stroke={shellStroke} strokeWidth="6" strokeLinecap="round" />
      <path d="M66 55h87l-4-14H71Z" fill="#20263a" stroke="#161c2d" strokeWidth="5" strokeLinejoin="round" />
      <path d="M72 41h77l15 13H57Z" fill="#2f3550" stroke="#161c2d" strokeWidth="5" strokeLinejoin="round" />
      <path d="M146 41h8v22l-5 7h-7l4-7Z" fill="#ffcb32" stroke="#8e6200" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

function Field({ label, children }) {
  return <label className="field-wrap"><span className="field-label">{label}</span>{children}</label>;
}

function StatCard({ value, label }) {
  return <div className="stat-card"><strong>{value}</strong><span>{label}</span></div>;
}

function ModeCard({ title, body }) {
  return <article className="mode-card"><span className="eyebrow">{title}</span><p>{body}</p></article>;
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function mergeTopicDetails(shallowTopics) {
  return shallowTopics.map((topic) => DEFAULT_TOPICS.find((item) => item.slug === topic.slug) || topic);
}

function enrichLesson(lesson, interest) {
  return {
    ...lesson,
    flashcards: lesson.flashcards?.length ? lesson.flashcards : buildFlashcards(lesson),
    quizQuestions: lesson.quizQuestions?.length ? lesson.quizQuestions : buildQuizQuestions(lesson, interest),
  };
}

function buildFlashcards(lesson) {
  const topic = lesson?.topic?.title || "the topic";
  const stages = lesson?.stages || [];
  const cards = stages.map((stage) => ({ front: `${stage.title}: what matters here?`, back: stage.body }));
  const extras = (lesson?.confusionHotspots || []).slice(0, 2).map((item) => ({ front: `Common confusion in ${topic}`, back: item }));
  return [...cards, ...extras];
}

function createLocalLesson({ topic, learnerLevel, mood, preferredStyle, interest, language }) {
  const tone = getMoodTone(mood);
  const styleLens = getStyleLens(preferredStyle);
  const levelGuide = getLevelGuide(learnerLevel);
  const title = topic.title;
  const foundation = topic.foundation || `${title} starts making sense once we define what it is, why it matters, and what problem it solves.`;
  const coreIdea = topic.coreIdea || `${title} is best understood by focusing on its main purpose, the key parts involved, and the outcome it creates.`;
  const howItWorks = topic.howItWorks || `Break ${title} into a simple sequence: inputs, transformation, output, and what changes at each step.`;
  const realWorldExample = topic.realWorldExample || `Imagine using ${title} in a practical real-life scenario where its result becomes easy to observe.`;
  const summary = topic.summary || topic.shortSummary || `${title} becomes easier when you connect the big idea, the process, and one concrete example.`;
  const shortSummary = topic.shortSummary || summary;
  const childAnalogy = topic.childAnalogy || `Think of ${title} like a helpful tool with one big job.`;
  const beginnerAnalogy = topic.beginnerAnalogy || `${title} becomes easier when you first focus on the main idea and the order of steps.`;
  const expertNuance = topic.expertNuance || `A solid explanation of ${title} should identify the mechanism, system boundaries, assumptions, and possible limitations.`;
  const confusionHotspots = topic.commonConfusions?.length ? topic.commonConfusions : ["Jumping to the result before understanding the process", "Using a label without defining what it means", "Remembering the example but not the mechanism"];
  const reversePrompt = topic.reversePrompt || `Teach ${title} back as if you were helping a classmate.`;

  return {
    topic: { slug: topic.slug || null, title, category: topic.category || "Custom", shortSummary, foundation, coreIdea, howItWorks, realWorldExample, summary },
    learnerSnapshot: { level: learnerLevel, mood, preferredStyle, interest, language },
    stages: [
      { id: "foundation", title: "Foundation", body: `${levelGuide.foundationLead} ${foundation} Start by naming the problem this concept solves and why that problem matters in the real world.` },
      { id: "core", title: "Core Idea", body: `${styleLens.coreFraming} ${coreIdea} Focus on the central mechanism, then explain how the parts work together.` },
      { id: "how", title: "How It Works", body: `${levelGuide.processHint} ${howItWorks} Walk through the process from start to finish, and pause after each step to ask what changed.` },
      { id: "example", title: "Real-World Example", body: `${styleLens.exampleLead} ${realWorldExample} Now compare the example back to the core idea so the learner sees how theory becomes practice.` },
      { id: "summary", title: "Summary", body: `${tone.memoryCue} ${summary} To remember it, hold onto this chain: purpose -> mechanism -> steps -> real-world result.` },
    ],
    learningModes: {
      analogy: `${styleLens.beginnerLead} ${childAnalogy}`,
      stepByStep: `${levelGuide.processHint} ${howItWorks} First understand the setup, then the action, then the result.`,
      realLife: `${styleLens.exampleLead} ${realWorldExample} Ask where this shows up in school, work, or daily life.`,
    },
    levelExplanations: {
      child: `${tone.encouragement} ${childAnalogy} ${foundation} Then we follow the steps gently and use one simple example tied to ${interest || "everyday life"} to make it stick.`,
      beginner: `${styleLens.beginnerLead} ${coreIdea} ${beginnerAnalogy} ${howItWorks} The goal is to leave with both meaning and mechanism.`,
      expert: `${levelGuide.expertLead} ${coreIdea} ${expertNuance} ${howItWorks} Frame the concept in terms of assumptions, architecture, tradeoffs, and failure modes where relevant.`,
    },
    adaptiveTips: [
      tone.studyTip,
      styleLens.studyAdvice,
      "Pause after each stage and restate it in one sentence before moving on.",
    ],
    confusionHotspots,
    checkInQuestions: [`In one sentence, what is the main job of ${title}?`, "Which part still feels unclear: the idea, the process, or the example?", reversePrompt],
  };
}

function createLocalFeedback({ understood, learnerExplanation, confusionArea, lesson, interest, slowQuestions }) {
  const analysis = analyzeTeachBack(lesson, learnerExplanation, confusionArea, interest, slowQuestions);
  if (confusionArea.trim()) {
    return { ...analysis, nextAction: "reteach", coachingResponse: `Focus on "${confusionArea}" first. Re-read the core idea, then reteach it using one concrete example and one step-by-step explanation.` };
  }
  if (understood && analysis.overlapScore >= 0.25) {
    return { ...analysis, nextAction: "advance", coachingResponse: "Nice work. You captured important ideas. Now tighten your understanding by revisiting the concepts Eggzy marked as missing and the quiz items where you hesitated." };
  }
  return { ...analysis, nextAction: "reteach", coachingResponse: `Let's rebuild it carefully. Start with the purpose of ${lesson?.topic?.title || "the topic"}, then explain the mechanism, then end with one real-world example.` };
}

function analyzeTeachBack(lesson, learnerExplanation, confusionArea, interest, slowQuestions) {
  const reference = `${lesson?.topic?.foundation || ""} ${lesson?.topic?.coreIdea || ""} ${lesson?.topic?.howItWorks || ""} ${lesson?.topic?.realWorldExample || ""} ${lesson?.topic?.summary || ""}`;
  const overlapScore = scoreExplanation(learnerExplanation, reference);
  const keywords = extractKeywords(lesson);
  const learnerTokens = new Set(tokenize(learnerExplanation));
  const missedConcepts = keywords.filter((item) => !learnerTokens.has(item.token)).slice(0, 4).map((item) => item.label);
  const strongPoints = keywords.filter((item) => learnerTokens.has(item.token)).slice(0, 3).map((item) => item.label);
  const slowPrompts = (lesson?.quizQuestions || buildQuizQuestions(lesson, interest)).filter((item) => slowQuestions.includes(item.id)).map((item) => item.prompt);
  const reteachSteps = [
    `Return to the ${findRelevantStage(confusionArea, lesson)} slide and explain it in simpler words.`,
    missedConcepts[0] ? `Make sure you include this missing idea next time: ${missedConcepts[0]}.` : `Rebuild the explanation in the order purpose -> mechanism -> example.`,
    slowPrompts[0] ? `Revisit this tricky quiz idea: ${slowPrompts[0]}` : `Use one real-life example tied to ${interest || "daily life"}.`,
  ];
  const questionBank = buildQuestionBank(lesson, confusionArea, missedConcepts, slowPrompts);
  return { overlapScore, strongPoints, missedConcepts, reteachSteps, questionBank, slowPrompts };
}

function extractKeywords(lesson) {
  const raw = [lesson?.topic?.title, lesson?.topic?.coreIdea, lesson?.topic?.howItWorks, ...(lesson?.confusionHotspots || [])].filter(Boolean).join(" ");
  return tokenize(raw).filter((token) => token.length > 4).slice(0, 8).map((token) => ({ token, label: token }));
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

function buildQuestionBank(lesson, confusionArea, missedConcepts = [], slowPrompts = []) {
  const title = lesson?.topic?.title || "the topic";
  const weakSpot = confusionArea || lesson?.confusionHotspots?.[0] || "the core idea";
  return [
    `What is the main purpose of ${title}?`,
    `Explain ${weakSpot} in your own words.`,
    missedConcepts[0] ? `Where does ${missedConcepts[0]} fit into ${title}?` : `How would you connect ${title} to a real-life example?`,
    slowPrompts[0] ? `Retry this confusing quiz idea: ${slowPrompts[0]}` : `What would you teach first to a beginner learning ${title}?`,
  ];
}

function buildQuizQuestions(lesson, interest) {
  const title = lesson?.topic?.title || "the topic";
  const summary = lesson?.topic?.summary || lesson?.topic?.shortSummary || `The idea behind ${title} matters.`;
  return [
    { id: "q1", prompt: `Which choice best describes the main job of ${title}?`, options: [summary, "Only memorizing jargon", "Ignoring process", "Avoiding examples"], correctAnswer: 0, hint: `Pause here means Eggzy should reteach the purpose of ${title} before going deeper.` },
    { id: "q2", prompt: `What should come early when teaching ${title}?`, options: ["Advanced edge cases", "Foundation and purpose", "Only formulas", "Only trivia"], correctAnswer: 1, hint: `If this felt slow, revisit the foundation slide before the mechanism slide.` },
    { id: "q3", prompt: `How does Eggzy help lock in ${title}?`, options: ["Analogy, steps, and real-life example", "Only one final answer", "Skipping confusion checks", "Avoiding teach-back"], correctAnswer: 0, hint: `This checks layered understanding. Use analogy, sequence, and a real-world case tied to ${interest || "daily life"}.` },
  ];
}

function scoreExplanation(learnerText, referenceText) {
  const learnerTokens = tokenize(learnerText);
  const referenceTokens = new Set(tokenize(referenceText));
  if (!learnerTokens.length) return 0;
  let matches = 0;
  for (const token of learnerTokens) if (referenceTokens.has(token)) matches += 1;
  return Number((matches / learnerTokens.length).toFixed(2));
}

function findRelevantStage(confusionArea, lesson) {
  if (!confusionArea.trim()) return "Core Idea";
  const lower = confusionArea.toLowerCase();
  const stage = lesson?.stages?.find((item) => item.body.toLowerCase().includes(lower) || item.title.toLowerCase().includes(lower));
  return stage ? stage.title : "Core Idea";
}

function tokenize(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length > 2);
}

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800;900&family=Schoolbell&display=swap');
:root { --bg:#08130f; --bg-soft:#10211a; --panel:#14271f; --panel-2:#183126; --panel-3:#20392d; --text:#f6fff7; --muted:#b2c7b8; --line:rgba(223,241,228,0.12); --shadow:0 18px 50px rgba(0,0,0,0.30); --lime:#58cc02; --lime-deep:#46a302; --sun:#ffd84a; --sky:#7cb8ff; --danger:#ff6b6b; }
:root[data-theme="light"] { --bg:#f7f1de; --bg-soft:#efe6cb; --panel:#fffdf5; --panel-2:#faf4e3; --panel-3:#f3ecd8; --text:#1d241d; --muted:#6f7668; --line:rgba(72,61,38,0.10); --shadow:0 18px 50px rgba(96,82,49,0.10); --lime:#58cc02; --lime-deep:#46a302; --sun:#ffca3a; --sky:#4d8ff7; --danger:#f25f5c; }
*{box-sizing:border-box} body{margin:0;font-family:'Nunito',sans-serif;background:var(--bg);color:var(--text)} button,input,textarea,select{font:inherit}
.app-shell{min-height:100vh;background:radial-gradient(circle at top left, rgba(88,204,2,0.10), transparent 24%),radial-gradient(circle at 80% 10%, rgba(255,216,74,0.10), transparent 22%),repeating-linear-gradient(0deg, rgba(255,255,255,0.018) 0, rgba(255,255,255,0.018) 2px, transparent 2px, transparent 44px),linear-gradient(180deg, var(--bg) 0%, var(--bg-soft) 100%);color:var(--text);position:relative;overflow-x:hidden}
.background-orb{position:fixed;border-radius:999px;filter:blur(80px);opacity:.25;pointer-events:none}.orb-one{width:340px;height:340px;background:var(--lime);top:-100px;left:-80px}.orb-two{width:280px;height:280px;background:var(--sun);right:-80px;top:160px}
.page-frame{width:min(1240px,calc(100% - 32px));margin:0 auto;padding:28px 0 72px;position:relative;z-index:1}.topbar,.hero-panel,.grid,.level-grid,.tabs,.toggle-row,.hero-stats,.pill-row,.brand-wrap,.flashcard-nav,.slide-shell,.progress-dots,.quiz-question-head{display:flex;gap:16px}.topbar,.hero-panel,.toggle-row,.slide-shell,.flashcard-nav,.quiz-question-head{align-items:center}.topbar,.hero-panel{justify-content:space-between}.grid,.level-grid,.topic-grid,.bullet-stack,.quiz-options,.quiz-list,.learning-modes,.teachback-grid{display:grid}.hero-panel,.lesson-stack{margin-top:22px}
.brand-chip,.theme-toggle,.panel,.level-card,.topic-chip,.stat-card,.library-card,.bullet-card,.error-banner,.snapshot-card,.explanation-card,.question-box,.coach-response,.mode-card,.slide-card,.flashcard,.quiz-question,.insight-panel{border:2px solid var(--line);box-shadow:var(--shadow)}
.brand-chip{width:66px;height:66px;border-radius:22px;background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);display:grid;place-items:center}.brand-title{font-size:34px;font-weight:900;line-height:1;font-family:'Schoolbell',cursive}.brand-subtitle{color:var(--muted);font-size:14px}.theme-toggle{border-radius:999px;background:var(--panel);color:var(--text);padding:12px 18px;display:flex;gap:18px;align-items:center;cursor:pointer;font-weight:800}
.hero-copy,.hero-mascot-card,.panel{background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);border-radius:28px;padding:26px;position:relative}.hero-copy{flex:1.2;min-width:0}.hero-copy h1{margin:12px 0 14px;font-size:clamp(40px,5vw,66px);line-height:1;font-family:'Schoolbell',cursive}.hero-copy p,.slide-card p,.mode-card p,.question-box,.coach-response p,.library-card p{color:var(--muted);line-height:1.7}.hero-mascot-card{flex:.8;min-width:320px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center}
.mascot-badge,.pill,.eyebrow,.field-label{text-transform:uppercase;letter-spacing:.16em;font-size:11px;font-weight:900}.mascot-badge,.pill{background:rgba(255,255,255,.06);color:var(--text);border-radius:999px;padding:10px 14px}.pill-green{background:rgba(88,204,2,.18)}.pill-blue{background:rgba(102,169,255,.18)}.hero-stats{margin-top:24px;flex-wrap:wrap}.stat-card{min-width:120px;border-radius:24px;background:var(--panel-3);padding:18px}.stat-card strong{display:block;font-size:30px;font-weight:900}.stat-card span{color:var(--muted)}.mascot-caption{display:grid;gap:6px;margin-top:10px}.mascot-caption span{color:var(--muted);line-height:1.6}
.panel{margin-top:22px}.section-heading{margin-bottom:18px}.section-heading h2{margin:8px 0 0;font-size:32px;font-family:'Schoolbell',cursive}.eyebrow,.field-label{color:var(--muted)}.grid.two-up{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.grid.three-up{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.field-wrap{display:grid;gap:8px}
.input-shell{display:flex;border:2px solid var(--line);background:var(--panel-3);border-radius:24px;overflow:hidden;transition:.2s ease}.input-shell.focused{transform:translateY(-1px);border-color:rgba(88,204,2,.45);box-shadow:0 0 0 4px rgba(88,204,2,.12)}.input,.concept-input{width:100%;border:2px solid var(--line);border-radius:20px;background:var(--panel-3);color:var(--text);padding:15px 16px;outline:none}.concept-input{border:0;border-radius:0;background:transparent;padding:19px 20px}.input::placeholder,.concept-input::placeholder,.textarea::placeholder{color:var(--muted)}.textarea{resize:vertical;min-height:120px}.dark{background:rgba(255,255,255,.05)}
.cta-button,.mini-button,.nav-arrow,.quiz-option,.progress-dot{border:0;border-bottom:5px solid var(--lime-deep);border-radius:18px;background:var(--lime);color:#fff;padding:16px 22px;font-weight:900;cursor:pointer}.mini-button{padding:10px 14px;border-bottom-width:4px}.nav-arrow{min-width:56px;font-size:24px;padding:16px 0}.cta-button:disabled,.mini-button:disabled,.nav-arrow:disabled{cursor:not-allowed;opacity:.55}.cta-button.wide{width:100%;margin-top:14px}
.topic-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px}.topic-chip{background:var(--panel-3);color:var(--text);border-radius:22px;padding:14px 16px;text-align:left;cursor:pointer}.topic-chip span{display:block;font-weight:800;margin-bottom:4px}.topic-chip small{color:var(--muted)}
.level-grid{margin-top:22px;grid-template-columns:repeat(3,minmax(0,1fr))}.level-card{background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);color:var(--text);border-radius:26px;padding:24px;text-align:left;cursor:pointer}.level-card.active{transform:translateY(-4px)}.level-bar{width:42px;height:6px;border-radius:999px;margin-bottom:16px}.level-card strong{font-size:24px;display:block}.level-card span,.level-card p{color:var(--muted)}
.error-banner{margin-top:18px;background:rgba(255,107,107,.14);border-radius:18px;padding:16px 18px;color:#ffdede}.lesson-stack{display:grid;gap:22px}.lesson-hero{display:flex;justify-content:space-between;gap:20px;align-items:start}.lesson-hero h2{margin:8px 0 10px;font-size:44px;font-family:'Schoolbell',cursive}.snapshot-card{min-width:220px;border-radius:24px;background:var(--panel-3);padding:18px}.snapshot-line{display:flex;justify-content:space-between;margin-top:10px;gap:12px}.snapshot-line span{color:var(--muted)}
.tabs{flex-wrap:wrap;margin-bottom:16px}.tab{border:2px solid var(--line);background:var(--panel-3);color:var(--text);border-radius:18px;padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer}.tab.active{background:rgba(88,204,2,.14)}.tab small{color:var(--muted);display:block}.dot{width:12px;height:12px;border-radius:999px}.explanation-card{border-width:2px;border-style:solid;border-radius:26px;background:var(--panel-3);padding:24px}.explanation-card.long-form p{margin:10px 0 0;color:var(--text);line-height:2.05;font-size:18px;white-space:pre-wrap}.mode-card,.slide-card,.flashcard,.quiz-question,.insight-panel{border-radius:24px;background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);padding:22px}
.slide-shell{align-items:stretch}.slide-card{flex:1;min-height:420px;display:flex;flex-direction:column;justify-content:center;padding:38px}.slide-card h3{font-family:'Schoolbell',cursive;font-size:52px;margin:0 0 18px}.slide-card p{font-size:22px;color:var(--text);line-height:2}.slide-progress{color:var(--sun);font-weight:900;text-transform:uppercase;letter-spacing:.14em;margin-bottom:12px}.progress-dots{flex-wrap:wrap;margin-top:14px}.progress-dot{background:var(--panel-3);border-bottom-color:rgba(255,255,255,.18);padding:10px 14px}.progress-dot.active{background:var(--lime)}
.bullet-stack{gap:10px;margin-top:12px}.bullet-card{border-radius:18px;background:var(--panel-3);padding:14px 15px;line-height:1.6}.success-card{background:rgba(88,204,2,.14)}.warning-card{background:rgba(255,216,74,.12)}
.flashcards-panel .flashcard{width:100%;min-height:260px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:var(--panel-3);color:var(--text);cursor:pointer}.flashcard-face{font-size:28px;line-height:1.6}.flashcard small{margin-top:16px;color:var(--muted)}.flashcard.flipped{border-color:rgba(255,216,74,.45)}.flashcard-nav{justify-content:space-between;margin-top:14px}
.quiz-score{font-weight:900;color:var(--sun);margin-bottom:14px}.quiz-list{gap:14px}.quiz-question{display:grid;gap:14px}.quiz-options{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.quiz-option{background:var(--panel-3);border-bottom-color:rgba(255,255,255,.18);text-align:left}.quiz-option.selected{outline:2px solid rgba(255,255,255,.18)}.quiz-option.correct{background:rgba(88,204,2,.18);border-bottom-color:var(--lime)}.quiz-option.wrong{background:rgba(255,107,107,.16);border-bottom-color:#db5a5a}.slow-chip{background:rgba(255,216,74,.16);color:var(--sun);padding:6px 10px;border-radius:999px;font-size:12px;font-weight:800}
.question-box{border-radius:24px;background:var(--panel-3);padding:18px}.question-row{padding:12px 0;border-bottom:1px solid var(--line);line-height:1.6}.question-row:last-child{border-bottom:0}.toggle-row{margin-top:18px;flex-wrap:wrap}.toggle-pill{border:2px solid var(--line);border-radius:999px;background:var(--panel);color:var(--text);padding:12px 16px;font-weight:800;cursor:pointer}.toggle-pill.active{background:rgba(88,204,2,.16);border-color:rgba(88,204,2,.38)}.toggle-pill.danger.active{background:rgba(255,107,107,.14);border-color:rgba(255,107,107,.35)}.slow-summary{margin-top:18px;color:var(--muted)}
.coach-response{margin-top:20px;border-radius:24px;background:rgba(88,204,2,.12);padding:18px}.coach-response small{color:var(--muted)}.teachback-grid{margin-top:16px}.eggzy{width:260px;max-width:100%}.eggzy.compact{width:42px}
@media (max-width:1080px){.grid.three-up,.quiz-options,.level-grid,.grid.two-up,.teachback-grid{grid-template-columns:1fr}.hero-panel,.lesson-hero,.slide-shell{flex-direction:column}.nav-arrow{width:100%}.slide-card{min-height:320px}.slide-card h3{font-size:38px}.slide-card p{font-size:18px}}
@media (max-width:720px){.page-frame{width:min(100% - 20px,1240px)}.topbar{flex-direction:column;align-items:flex-start}.brand-title{font-size:28px}.hero-copy h1{font-size:42px}.cta-button{width:100%}.input-shell{flex-direction:column}.flashcard-face{font-size:22px}}
`;














