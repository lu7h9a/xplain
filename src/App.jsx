import { useEffect, useMemo, useRef, useState } from "react";
import { LOCAL_TOPIC_LIBRARY } from "./topicLibrary.js";
import { registerWithEmail, signInWithEmail, signOutUser, watchAuthState } from "./supabase.js";
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
const FLASHCARD_OPTIONS = [5, 8, 10, 12];
const QUIZ_OPTIONS = [4, 6, 8, 10];

export default function App() {
  const [theme, setTheme] = useState("dark");
  const [authUser, setAuthUser] = useState(null);
  const [authToken, setAuthToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState([]);
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
  const [flashcardTarget, setFlashcardTarget] = useState(5);
  const [quizTarget, setQuizTarget] = useState(4);
  const [lesson, setLesson] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [remoteSessionId, setRemoteSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [lessonPhase, setLessonPhase] = useState("explanation");
  const [quizSubmitted, setQuizSubmitted] = useState(false);
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
  const popupDismissedRef = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    popupDismissedRef.current = window.localStorage.getItem("eggzy-auth-dismissed") === "true";
    const unsubscribe = watchAuthState(async (user) => {
      setAuthUser(user);
      setAuthToken(user ? await user.getIdToken() : "");
      setAuthLoading(false);
      if (!user && !popupDismissedRef.current) {
        setAuthModalOpen(true);
      }
      if (user) {
        setAuthModalOpen(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void Promise.all([loadTopics(), loadLanguages()]);
  }, []);

  useEffect(() => {
    setActiveStageIndex(0);
    setActiveCardIndex(0);
    setFlashcardFlipped(false);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setSlowQuestions([]);
    setHoverInsight("");
    setLessonPhase("explanation");
  }, [lesson]);

  useEffect(() => {
    if (authUser?.displayName && !learnerName) {
      setLearnerName(authUser.displayName);
    }
  }, [authUser, learnerName]);

  useEffect(() => {
    void loadUiCopy(language);
    if (previousLanguageRef.current !== language && lesson && concept.trim()) {
      previousLanguageRef.current = language;
      void handleExplain();
      return;
    }
    previousLanguageRef.current = language;
  }, [language]);

  function dismissAuthModal() {
    popupDismissedRef.current = true;
    window.localStorage.setItem("eggzy-auth-dismissed", "true");
    setAuthModalOpen(false);
  }

  function getAuthHeaders() {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  }

  async function loadDashboard() {
    if (!authToken) {
      setAuthModalOpen(true);
      return;
    }

    setDashboardLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load dashboard");
      setDashboardData(data.dashboard || null);
      setDashboardOpen(true);
    } catch (err) {
      setError(err.message || "Unable to load dashboard right now.");
    } finally {
      setDashboardLoading(false);
    }
  }

  async function loadHistory() {
    if (!authToken) {
      setAuthModalOpen(true);
      return;
    }

    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load history");
      setHistoryData(data.history || []);
      setHistoryOpen(true);
    } catch (err) {
      setError(err.message || "Unable to load history right now.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await signOutUser();
      setDashboardOpen(false);
      setHistoryOpen(false);
      setDashboardData(null);
      setHistoryData([]);
      setAuthToken("");
    } catch (err) {
      setError(err.message || "Unable to logout right now.");
    }
  }

  async function handleEmailAuth() {
    const email = authEmail.trim();
    const username = authUsername.trim();

    if (!email || !authPassword) {
      setError("Enter your email and password first.");
      return;
    }

    if (authMode === "signup") {
      if (!username) {
        setError("Choose a username to create your account.");
        return;
      }
      if (authPassword !== authConfirmPassword) {
        setError("Password and confirm password must match.");
        return;
      }
    }

    setError("");

    try {
      if (authMode === "signup") {
        await registerWithEmail(email, authPassword, username);
        setLearnerName(username);
      } else {
        await signInWithEmail(email, authPassword);
      }

      setAuthEmail("");
      setAuthUsername("");
      setAuthPassword("");
      setAuthConfirmPassword("");
      setAuthModalOpen(false);
      popupDismissedRef.current = false;
      window.localStorage.removeItem("eggzy-auth-dismissed");
    } catch (err) {
      setError(err.message || "Authentication failed. Please try again.");
    }
  }

  async function loadLanguages() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/languages`, { headers: { ...getAuthHeaders() } });
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
      const res = await fetch(`${API_BASE_URL}/api/ui-copy?language=${languageCode}`, { headers: { ...getAuthHeaders() } });
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
      const res = await fetch(`${API_BASE_URL}/api/topics`, { headers: { ...getAuthHeaders() } });
      if (!res.ok) throw new Error("Topic API unavailable");
      const data = await res.json();
      setTopics(data.topics?.length ? mergeTopicDetails(data.topics) : DEFAULT_TOPICS);
    } catch {
      setTopics(DEFAULT_TOPICS);
    }
  }

  function buildPerformanceSignals() {
    const wrongQuestions = quizItems
      .filter((item) => quizAnswers[item.id] != null && quizAnswers[item.id] !== item.correctAnswer)
      .map((item) => item.prompt);

    return {
      slowQuestions,
      wrongQuestions,
      lessonPhase,
      quizScore,
      totalQuestions: quizItems.length,
      overlapScore: feedback?.overlapScore ?? null,
      missedConcepts: feedback?.missedConcepts || [],
      confusionArea,
      learnerExplanation,
    };
  }

  async function requestLesson({ mode = "lesson", nextPhase = "explanation", seed = `${Date.now()}`, performanceSignals = buildPerformanceSignals(), conceptOverride = "" } = {}) {
    const requestedConcept = (conceptOverride || concept).trim();
    if (!requestedConcept) return;
    setError("");
    setFeedback(null);
    setLoading(true);

    const matchedTopic = topics.find((topic) => topic.title.toLowerCase() === requestedConcept.toLowerCase());

    try {
      const res = await fetch(`${API_BASE_URL}/api/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          topicSlug: matchedTopic?.slug,
          customTopic: matchedTopic ? "" : requestedConcept,
          learnerName,
          learnerLevel: activeLevel,
          mood,
          preferredStyle,
          interest: activeLevel === "child" ? interest : "",
          language: currentLanguageOption?.name || "English",
          generationMode: mode,
          regenerationSeed: seed,
          flashcardCount: flashcardTarget,
          quizQuestionCount: quizTarget,
          performanceSignals,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate lesson");
      setSessionId(data.sessionId);
      setRemoteSessionId(data.remoteSessionId || null);
      setLesson(enrichLesson(data.lesson, activeLevel === "child" ? interest : "", seed));
      setLearnerExplanation("");
      setConfusionArea("");
      setLessonPhase(nextPhase);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch {
      const fallbackLesson = createLocalLesson({
        topic: matchedTopic || { title: requestedConcept, category: "Custom", shortSummary: `A guided explanation for ${requestedConcept}.` },
        learnerLevel: activeLevel,
        mood,
        preferredStyle,
        interest: activeLevel === "child" ? interest : "",
        language: currentLanguageOption?.name || "English",
        generationMode: mode,
        flashcardCount: flashcardTarget,
        quizQuestionCount: quizTarget,
        performanceSignals,
        materialSeed: seed,
      });
      setSessionId(`local-${Date.now()}`);
      setRemoteSessionId(null);
      setLesson(enrichLesson(fallbackLesson, activeLevel === "child" ? interest : "", seed));
      setLearnerExplanation("");
      setConfusionArea("");
      setLessonPhase(nextPhase);
      setError("Live API unavailable, so Eggzy switched to the built-in knowledge library.");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } finally {
      setLoading(false);
    }
  }

  async function handleExplain(topicOverride = "") {
    await requestLesson({ mode: "lesson", nextPhase: "explanation", conceptOverride: topicOverride });
  }

  async function handleRefreshQuiz() {
    await requestLesson({ mode: "quiz_refresh", nextPhase: "quiz", seed: `quiz-${Date.now()}` });
  }

  async function handleRefreshFlashcards() {
    await requestLesson({ mode: "flashcards_refresh", nextPhase: "flashcards", seed: `flash-${Date.now()}` });
  }

  async function handleReteachDifferent() {
    await requestLesson({ mode: "reteach", nextPhase: "explanation", seed: `reteach-${Date.now()}` });
  }

  async function openQuizMode() {
    if ((lesson?.quizQuestions?.length || 0) < quizTarget) {
      await handleRefreshQuiz();
      return;
    }
    setLessonPhase("quiz");
  }

  async function openFlashcardsMode() {
    if ((lesson?.flashcards?.length || 0) < flashcardTarget) {
      await handleRefreshFlashcards();
      return;
    }
    setLessonPhase("flashcards");
  }

  async function handleFeedbackSubmit() {
    if (!sessionId || !lesson) return;
    setFeedbackLoading(true);
    const localAnalysis = analyzeTeachBack(lesson, learnerExplanation, confusionArea, interest, slowQuestions);

    try {
      const res = await fetch(`${API_BASE_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ sessionId, remoteSessionId, understood, learnerExplanation, confusionArea, performanceSignals: buildPerformanceSignals() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to save feedback");
      setFeedback({ ...data, ...localAnalysis });
      setLessonPhase("teachback");
    } catch {
      setFeedback(createLocalFeedback({ understood, learnerExplanation, confusionArea, lesson, interest, slowQuestions }));
      setLessonPhase("teachback");
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
  const activeLevelText = useMemo(() => {
    if (!lesson) return "";
    return [
      lesson.levelExplanations?.[activeLevel] || "",
      lesson.topic?.foundation || "",
      lesson.topic?.coreIdea || "",
      lesson.topic?.howItWorks || "",
      lesson.topic?.realWorldExample || "",
      lesson.topic?.summary || "",
    ].filter(Boolean).join("\n\n");
  }, [lesson, activeLevel]);
  const activeStage = lesson?.stages?.[activeStageIndex] || null;
  const activeExplanationLabel = activeLevel === "child" ? uiCopy.elementaryExplanation : activeLevel === "beginner" ? uiCopy.intermediateExplanation : uiCopy.advancedExplanation;
  const flashcards = (lesson?.flashcards || []).slice(0, flashcardTarget);
  const activeFlashcard = flashcards[activeCardIndex] || null;
  const quizItems = (lesson?.quizQuestions || []).slice(0, quizTarget);
  const quizScore = quizItems.reduce((total, item) => total + (quizAnswers[item.id] === item.correctAnswer ? 1 : 0), 0);
  const allQuestionsAnswered = quizItems.length > 0 && quizItems.every((item) => quizAnswers[item.id] != null);
  const quizPerfect = allQuestionsAnswered && quizScore === quizItems.length;
  const quizNeedsRevision = quizSubmitted && allQuestionsAnswered && !quizPerfect;
  const showRevisionHub = lessonPhase !== "explanation";
  const showQuiz = lessonPhase === "quiz" || lessonPhase === "teachback";
  const showFlashcards = lessonPhase === "flashcards" || lessonPhase === "teachback";
  const showTeachBack = lessonPhase === "teachback";
  const showExplanationPhase = lessonPhase === "explanation";

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
          <div className="topbar-actions">
            {authUser ? <button className="auth-button" onClick={() => void loadDashboard()} disabled={dashboardLoading}>{dashboardLoading ? "Loading dashboard..." : "Dashboard"}</button> : null}
            {authUser ? <button className="auth-button" onClick={() => void loadHistory()} disabled={historyLoading}>{historyLoading ? "Loading history..." : "History"}</button> : null}
            <button className="auth-button" onClick={() => authUser ? void handleLogout() : setAuthModalOpen(true)} disabled={authLoading}>
              {authLoading ? "Loading..." : authUser ? `Logout ${authUser.displayName?.split(" ")[0] || "Learner"}` : "Login"}
            </button>
            <button className="theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}>
              <span>{theme === "dark" ? uiCopy.themeDarkQuest : uiCopy.themeSunnyQuest}</span>
              <span>{theme === "dark" ? uiCopy.themeMoonOn : uiCopy.themeSunOn}</span>
            </button>
          </div>
        </header>

        {dashboardOpen ? (
          <div className="modal-backdrop">
            <div className="auth-modal panel dashboard-modal">
              <button className="modal-close" onClick={() => setDashboardOpen(false)}>x</button>
              <span className="eyebrow">Learner Dashboard</span>
              <h2>{authUser?.displayName || "Your progress"}</h2>
              <div className="dashboard-grid">
                <div className="panel dashboard-card">
                  <span className="eyebrow">Weak Topics</span>
                  <div className="bullet-stack">{dashboardData?.weakTopics?.length ? dashboardData.weakTopics.map((item) => <div key={item.topic} className="bullet-card"><strong>{item.topic}</strong><small> Slow: {item.slowCount} | Wrong: {item.wrongCount} | Teach-back misses: {item.teachBackMisses}</small></div>) : <div className="bullet-card">No weak topics tracked yet.</div>}</div>
                </div>
                <div className="panel dashboard-card">
                  <span className="eyebrow">Recent Learning</span>
                  <div className="bullet-stack">{dashboardData?.recentEvents?.length ? dashboardData.recentEvents.map((item, index) => <div key={`${item.eventType}-${index}`} className="bullet-card"><strong>{item.topic || "Session"}</strong><small>{item.eventType} | {item.language || "English"}</small></div>) : <div className="bullet-card">No saved learning events yet.</div>}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {historyOpen ? (
          <div className="modal-backdrop">
            <div className="auth-modal panel dashboard-modal">
              <button className="modal-close" onClick={() => setHistoryOpen(false)}>x</button>
              <span className="eyebrow">Learning History</span>
              <h2>Your previous learning</h2>
              <p className="support-copy">A focused history of the topics you opened, with the best saved quiz snapshot for each one.</p>
              <div className="history-stack">
                {historyData.length ? historyData.map((item) => (
                  <div key={item.id} className="panel dashboard-card history-card">
                    <div className="history-head">
                      <div>
                        <strong>{item.topic || "Untitled topic"}</strong>
                        <small>{new Date(item.createdAt).toLocaleString()}</small>
                      </div>
                      <div className="history-meta">
                        <span>{item.learnerLevel || "beginner"}</span>
                        <span>{item.language || "English"}</span>
                        {item.bestQuizScore != null ? <span>Quiz {item.bestQuizScore}/{item.bestQuizTotal}</span> : <span>No quiz yet</span>}
                      </div>
                    </div>
                    <p>{item.lessonSummary || "No summary saved yet."}</p>
                    <div className="action-row">
                      <button type="button" className="mini-button secondary-button" onClick={() => { setHistoryOpen(false); setConcept(item.topic || ""); void handleExplain(item.topic || ""); }}>Open topic again</button>
                    </div>
                  </div>
                )) : <div className="bullet-card">No saved lesson history yet.</div>}
              </div>
            </div>
          </div>
        ) : null}

        {authModalOpen ? (
          <div className="modal-backdrop">
            <div className="auth-modal panel">
              <button className="modal-close" onClick={dismissAuthModal}>x</button>
              <span className="eyebrow">Secure Login</span>
              <h2>Save your Eggzy progress</h2>
              <p className="support-copy">Login to save weak topics, revision history, quiz results, and teach-back notes under your own profile.</p>
              <div className="toggle-row">
                <button className={`toggle-pill ${authMode === "login" ? "active" : ""}`} onClick={() => setAuthMode("login")}>Login</button>
                <button className={`toggle-pill ${authMode === "signup" ? "active" : ""}`} onClick={() => setAuthMode("signup")}>Sign up</button>
              </div>
              <div className="auth-form">
                {authMode === "signup" ? <input className="input" value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} placeholder="Username" /> : null}
                <input className="input" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Email" />
                <input className="input" type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Password" />
                {authMode === "signup" ? <input className="input" type="password" value={authConfirmPassword} onChange={(event) => setAuthConfirmPassword(event.target.value)} placeholder="Confirm password" /> : null}
              </div>
              <div className="action-row">
                <button className="cta-button secondary-cta" onClick={() => void handleEmailAuth()}>{authMode === "signup" ? "Create account" : "Login with email"}</button>
                <button className="mini-button secondary-button" onClick={dismissAuthModal}>Maybe later</button>
              </div>
            </div>
          </div>
        ) : null}

        {!lesson ? (
          <>
            <section className="panel profile-panel">
              <div className="section-heading"><span className="eyebrow">{uiCopy.learnerSetupEyebrow}</span><h2>{uiCopy.learnerSetupTitle}</h2></div>
              <section className="embedded-level-grid level-grid">
                {localizedLevels.map((level) => (
                  <button key={level.id} className={`level-card ${activeLevel === level.id ? "active" : ""}`} onClick={() => setActiveLevel(level.id)}>
                    <div className="level-bar" style={{ background: level.accent }} />
                    <strong>{level.label}</strong>
                    <span>{level.sublabel}</span>
                    <p>{level.description}</p>
                  </button>
                ))}
              </section>
              <div className="grid two-up">
                <Field label={uiCopy.language}><select className="input" value={language} onChange={(event) => setLanguage(event.target.value)}>{languageOptions.map((option) => <option key={option.code} value={option.code}>{option.nativeName} ({option.name})</option>)}</select></Field>
                <Field label={uiCopy.currentMentalState}><select className="input" value={mood} onChange={(event) => setMood(event.target.value)}>{MOODS.map((option) => <option key={option} value={option}>{uiCopy.moods?.[option] || capitalize(option)}</option>)}</select></Field>
                <Field label={uiCopy.learnerName}><input className="input" value={learnerName} onChange={(event) => setLearnerName(event.target.value)} placeholder={uiCopy.optional} /></Field>
                {activeLevel === "child"
                  ? <Field label={uiCopy.interestHook}><input className="input" value={interest} onChange={(event) => setInterest(event.target.value)} placeholder="Example: cricket lover, gamer, artist" /></Field>
                  : <Field label={uiCopy.explanationStyle}><select className="input" value={preferredStyle} onChange={(event) => setPreferredStyle(event.target.value)}>{STYLES.map((option) => <option key={option} value={option}>{uiCopy.styles?.[option] || capitalize(option)}</option>)}</select></Field>}
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
                  <button type="button" key={topic.slug} className="topic-chip" onClick={() => { setConcept(topic.title); void handleExplain(topic.title); }}>
                    <span>{topic.title}</span><small>{topic.category}</small>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {error ? <div className="error-banner">{error}</div> : null}

        {lesson ? (
          <div ref={resultsRef} className="lesson-stack">
            <section className="panel lesson-hero">
              <div>
                <span className="eyebrow">{uiCopy.currentMission}</span>
                <h2>{lesson.topic.title}</h2>
                <p>{lesson.topic.shortSummary}</p>
                <div className="action-row top-gap"><button type="button" className="mini-button secondary-button" onClick={() => { setLesson(null); setSessionId(null); setFeedback(null); setLessonPhase("explanation"); }}>{uiCopy.chooseConceptTitle}</button></div>
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

            {showExplanationPhase ? (
              <>
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
                    <button className="nav-arrow" onClick={() => setActiveStageIndex((current) => Math.max(0, current - 1))} disabled={activeStageIndex === 0}>&lt;</button>
                    <div className="slide-card">
                      <div className="slide-progress">{activeStageIndex + 1} / {lesson.stages.length}</div>
                      <h3>{activeStage?.title}</h3>
                      <p>{activeStage?.body}</p>
                    </div>
                    <button className="nav-arrow" onClick={() => setActiveStageIndex((current) => Math.min(lesson.stages.length - 1, current + 1))} disabled={activeStageIndex === lesson.stages.length - 1}>&gt;</button>
                  </div>
                  <div className="progress-dots">
                    {lesson.stages.map((stage, index) => (
                      <button key={stage.id} className={`progress-dot ${index === activeStageIndex ? "active" : ""}`} onClick={() => setActiveStageIndex(index)}>{stage.title}</button>
                    ))}
                  </div>
                  <div className="action-row inline-revision-action">
                    <button className="cta-button" onClick={() => setLessonPhase("revise")}>{uiCopy.continueToRevision}</button>
                  </div>
                </section>
              </>
            ) : null}

            {showRevisionHub ? (
              <section className="panel revision-choice-panel">
                <div className="choice-grid">
                  <div className={`path-card ${lessonPhase === "quiz" ? "active" : ""}`}>
                    <span className="eyebrow">{uiCopy.revisionHub}</span>
                    <strong>{uiCopy.quizChoiceTitle}</strong>
                    <p>{uiCopy.quizChoiceBody}</p>
                    <label className="count-picker"><span>No. of questions</span><select className="input" value={quizTarget} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onChange={(event) => { event.stopPropagation(); setQuizTarget(Number(event.target.value)); }}>{QUIZ_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                    <button type="button" className="cta-button revision-open" onClick={() => void openQuizMode()}>{uiCopy.openQuiz}</button>
                  </div>
                  <div className={`path-card ${lessonPhase === "flashcards" ? "active" : ""}`}>
                    <span className="eyebrow">{uiCopy.revisionHub}</span>
                    <strong>{uiCopy.flashcardChoiceTitle}</strong>
                    <p>{uiCopy.flashcardChoiceBody}</p>
                    <label className="count-picker"><span>No. of flashcards</span><select className="input" value={flashcardTarget} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onChange={(event) => { event.stopPropagation(); setFlashcardTarget(Number(event.target.value)); }}>{FLASHCARD_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                    <button type="button" className="cta-button revision-open" onClick={() => void openFlashcardsMode()}>{uiCopy.openFlashcards}</button>
                  </div>
                </div>
              </section>
            ) : null}

            {showQuiz ? (
              <section className="panel info-panel quiz-panel">
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
                          const correct = quizSubmitted && optionIndex === item.correctAnswer;
                          const wrong = quizSubmitted && selected && quizAnswers[item.id] !== item.correctAnswer;
                          return (
                            <button type="button" key={option} className={`quiz-option ${selected ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}`} onClick={() => setQuizAnswers((current) => ({ ...current, [item.id]: optionIndex }))}>
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {hoverInsight ? <div className="coach-response"><span className="eyebrow">{uiCopy.hesitationTitle}</span><p>{hoverInsight}</p></div> : null}
                <div className="action-row">
                  <button className="cta-button" onClick={() => setQuizSubmitted(true)} disabled={!allQuestionsAnswered}>{uiCopy.quizCompleteTitle}</button>
                  <button className="mini-button secondary-button" onClick={() => setLessonPhase("flashcards")}>{uiCopy.reviewWithFlashcards}</button>
                  <button className="mini-button secondary-button" onClick={() => setLessonPhase("explanation")}>{uiCopy.backToExplanation}</button>
                </div>
                {quizSubmitted && allQuestionsAnswered ? (
                  <div className="coach-response quiz-summary-card">
                    <span className="eyebrow">{quizPerfect ? uiCopy.masteryReady : uiCopy.revisitBeforeTeachBack}</span>
                    <p>{quizPerfect ? uiCopy.quizPerfectBody : uiCopy.quizRetryBody}</p>
                    <div className="action-row">
                      {quizPerfect ? <button className="cta-button" onClick={() => setLessonPhase("teachback")}>{uiCopy.proceedToTeachBack}</button> : null}
                      {quizNeedsRevision ? <button type="button" className="mini-button secondary-button" onClick={() => void handleRefreshQuiz()}>{uiCopy.retryWithFreshQuiz}</button> : null}
                      {quizNeedsRevision ? <button className="mini-button secondary-button" onClick={() => setLessonPhase("flashcards")}>{uiCopy.reviewWithFlashcards}</button> : null}
                      {quizNeedsRevision ? <button className="mini-button secondary-button" onClick={() => void handleReteachDifferent()}>{uiCopy.reteachDifferently}</button> : null}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {showFlashcards ? (
              <section className="panel info-panel flashcards-panel">
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
                <div className="action-row">
                  <button type="button" className="cta-button" onClick={() => void openQuizMode()}>{uiCopy.continueToQuiz}</button>
                  <button type="button" className="mini-button secondary-button" onClick={() => void handleRefreshFlashcards()}>{uiCopy.refreshFlashcards}</button>
                  <button className="mini-button secondary-button" onClick={() => setLessonPhase("explanation")}>{uiCopy.backToExplanation}</button>
                </div>
              </section>
            ) : null}

            {showTeachBack ? (
              <section className="panel feedback-panel">
                <div className="section-heading"><span className="eyebrow">{uiCopy.teachTopicEyebrow}</span><h2>{uiCopy.teachTopicTitle}</h2></div>
                <p className="support-copy">{uiCopy.teachBackNavigation}</p>
                <div className="action-row top-gap">
                  <button className="mini-button secondary-button" onClick={() => setLessonPhase("explanation")}>{uiCopy.backToExplanation}</button>
                  <button className="mini-button secondary-button" onClick={() => setLessonPhase("flashcards")}>{uiCopy.openFlashcards}</button>
                  <button className="mini-button secondary-button" onClick={() => setLessonPhase("quiz")}>{uiCopy.openQuiz}</button>
                </div>
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
                    <div className="coach-response"><span className="eyebrow">{uiCopy.eggzySays}</span><p>{feedback.coachingResponse}</p><small>{uiCopy.overlapScore}: {feedback.overlapScore}</small><div className="action-row top-gap">{feedback.nextAction === "reteach" ? <button className="mini-button secondary-button" onClick={() => void handleReteachDifferent()}>{uiCopy.reteachDifferently}</button> : null}</div></div>
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
            ) : null}
          </div>
        ) : null}
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
  const requestedFlashcards = lesson?.requestedCounts?.flashcards || 5;
  const requestedQuizQuestions = lesson?.requestedCounts?.quizQuestions || 4;
  return {
    ...lesson,
    flashcards: lesson.flashcards?.length ? lesson.flashcards : buildFlashcards(lesson, requestedFlashcards),
    quizQuestions: lesson.quizQuestions?.length ? lesson.quizQuestions : buildQuizQuestions(lesson, interest, requestedQuizQuestions),
  };
}

function buildFlashcards(lesson, count = 5) {
  const topic = lesson?.topic?.title || "the topic";
  const stages = lesson?.stages || [];
  const cards = stages.map((stage) => ({ front: `${stage.title}: what matters here?`, back: stage.body }));
  const extras = (lesson?.confusionHotspots || []).slice(0, Math.max(2, count - cards.length)).map((item, index) => ({ front: `Common confusion ${index + 1} in ${topic}`, back: item }));
  const deck = [...cards, ...extras];
  while (deck.length < count) {
    const stage = stages[deck.length % Math.max(stages.length, 1)] || { title: "Summary", body: lesson?.topic?.summary || `Review the main idea of ${topic}.` };
    deck.push({ front: `${stage.title} recap ${deck.length + 1}`, back: stage.body });
  }
  return deck.slice(0, count);
}

function createLocalLesson({ topic, learnerLevel, mood, preferredStyle, interest, language, flashcardCount = 5, quizQuestionCount = 4 }) {
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
    requestedCounts: { flashcards: flashcardCount, quizQuestions: quizQuestionCount },
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

function buildQuizQuestions(lesson, interest, count = 4) {
  const title = lesson?.topic?.title || "the topic";
  const summary = lesson?.topic?.summary || lesson?.topic?.shortSummary || `The idea behind ${title} matters.`;
  const items = [
    { id: "q1", prompt: `Which choice best describes the main job of ${title}?`, options: [summary, "Only memorizing jargon", "Ignoring process", "Avoiding examples"], correctAnswer: 0, hint: `Pause here means Eggzy should reteach the purpose of ${title} before going deeper.` },
    { id: "q2", prompt: `What should come early when teaching ${title}?`, options: ["Advanced edge cases", "Foundation and purpose", "Only formulas", "Only trivia"], correctAnswer: 1, hint: `If this felt slow, revisit the foundation slide before the mechanism slide.` },
    { id: "q3", prompt: `How does Eggzy help lock in ${title}?`, options: ["Analogy, steps, and real-life example", "Only one final answer", "Skipping confusion checks", "Avoiding teach-back"], correctAnswer: 0, hint: `This checks layered understanding. Use analogy, sequence, and a real-world case tied to ${interest || "daily life"}.` },
    { id: "q4", prompt: `Which explanation of ${title} is strongest?`, options: ["One that includes purpose, process, and a grounded example", "One with only a definition", "One with only history", "One that skips how it works"], correctAnswer: 0, hint: `A strong explanation should teach purpose, mechanism, and application together.` },
  ];
  while (items.length < count) {
    const index = items.length + 1;
    items.push({
      id: `q${index}`,
      prompt: `What should you remember next about ${title}? (${index})`,
      options: [
        `The link between the idea, the process, and the result`,
        "Only the jargon",
        "Only the final answer",
        "Only one memorized example",
      ],
      correctAnswer: 0,
      hint: `Return to the detailed explanation and trace how the concept moves from purpose to process to outcome.`
    });
  }
  return items.slice(0, count);
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
.background-orb{position:fixed;border-radius:999px;filter:blur(80px);opacity:.25;pointer-events:none}.orb-one{width:340px;height:340px;background:var(--lime);top:-100px;left:-80px}.orb-two{width:280px;height:280px;background:var(--sun);right:-80px;top:160px}.modal-backdrop{position:fixed;inset:0;background:rgba(4,10,8,.62);display:grid;place-items:center;padding:24px;z-index:10}.auth-modal{width:min(520px,100%);background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);border-radius:28px;padding:26px;position:relative}.dashboard-modal{width:min(920px,100%)}.dashboard-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:16px}.dashboard-card{margin-top:0}.history-stack{display:grid;gap:16px;margin-top:16px}.history-card p{color:var(--muted);line-height:1.7}.history-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.history-head small{display:block;color:var(--muted);margin-top:4px}.history-meta{display:flex;gap:10px;flex-wrap:wrap}.history-meta span{background:var(--panel-3);padding:8px 10px;border-radius:999px;color:var(--text);font-size:12px;font-weight:800}.auth-form{display:grid;gap:12px;margin-top:16px}.auth-modal h2{margin:10px 0 12px;font-size:36px;font-family:'Schoolbell',cursive}.modal-close{position:absolute;top:14px;right:14px;width:40px;height:40px;border-radius:999px;border:0;background:var(--panel-3);color:var(--text);font-size:22px;cursor:pointer}.secondary-cta{background:var(--sun);border-bottom-color:#c9950c;color:#1d241d}
.page-frame{width:min(1240px,calc(100% - 32px));margin:0 auto;padding:28px 0 72px;position:relative;z-index:1}.topbar,.hero-panel,.grid,.level-grid,.tabs,.toggle-row,.hero-stats,.pill-row,.brand-wrap,.flashcard-nav,.slide-shell,.progress-dots,.quiz-question-head,.topbar-actions{display:flex;gap:16px}.topbar,.hero-panel,.toggle-row,.slide-shell,.flashcard-nav,.quiz-question-head,.topbar-actions{align-items:center}.topbar,.hero-panel{justify-content:space-between}.grid,.level-grid,.topic-grid,.bullet-stack,.quiz-options,.quiz-list,.learning-modes,.teachback-grid{display:grid}.hero-panel,.lesson-stack{margin-top:22px}
.brand-chip,.theme-toggle,.auth-button,.panel,.level-card,.topic-chip,.stat-card,.library-card,.bullet-card,.error-banner,.snapshot-card,.explanation-card,.question-box,.coach-response,.mode-card,.slide-card,.flashcard,.quiz-question,.insight-panel,.auth-modal{border:2px solid var(--line);box-shadow:var(--shadow)}
.brand-chip{width:66px;height:66px;border-radius:22px;background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);display:grid;place-items:center}.brand-title{font-size:34px;font-weight:900;line-height:1;font-family:'Schoolbell',cursive}.brand-subtitle{color:var(--muted);font-size:14px}.auth-button,.theme-toggle{border-radius:999px;background:var(--panel);color:var(--text);padding:12px 18px;display:flex;gap:18px;align-items:center;cursor:pointer;font-weight:800}.auth-button{background:var(--panel-3)}
.hero-copy,.hero-mascot-card,.panel{background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);border-radius:28px;padding:26px;position:relative}.hero-copy{flex:1.2;min-width:0}.hero-copy h1{margin:12px 0 14px;font-size:clamp(40px,5vw,66px);line-height:1;font-family:'Schoolbell',cursive}.hero-copy p,.slide-card p,.mode-card p,.question-box,.coach-response p,.library-card p{color:var(--muted);line-height:1.7}.hero-mascot-card{flex:.8;min-width:320px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center}
.mascot-badge,.pill,.eyebrow,.field-label{text-transform:uppercase;letter-spacing:.16em;font-size:11px;font-weight:900}.mascot-badge,.pill{background:rgba(255,255,255,.06);color:var(--text);border-radius:999px;padding:10px 14px}.pill-green{background:rgba(88,204,2,.18)}.pill-blue{background:rgba(102,169,255,.18)}.hero-stats{margin-top:24px;flex-wrap:wrap}.stat-card{min-width:120px;border-radius:24px;background:var(--panel-3);padding:18px}.stat-card strong{display:block;font-size:30px;font-weight:900}.stat-card span{color:var(--muted)}.mascot-caption{display:grid;gap:6px;margin-top:10px}.mascot-caption span{color:var(--muted);line-height:1.6}
.panel{margin-top:22px}.section-heading{margin-bottom:18px}.section-heading h2{margin:8px 0 0;font-size:32px;font-family:'Schoolbell',cursive}.support-copy{margin:0;color:var(--muted);line-height:1.7}.eyebrow,.field-label{color:var(--muted)}.grid.two-up{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.grid.three-up{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.field-wrap{display:grid;gap:8px}.embedded-level-grid{margin-bottom:18px}.count-picker{display:grid;gap:8px;margin-top:18px}.count-picker span{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.revision-open{margin-top:18px;width:100%}
.input-shell{display:flex;border:2px solid var(--line);background:var(--panel-3);border-radius:24px;overflow:hidden;transition:.2s ease}.input-shell.focused{transform:translateY(-1px);border-color:rgba(88,204,2,.45);box-shadow:0 0 0 4px rgba(88,204,2,.12)}.input,.concept-input{width:100%;border:2px solid var(--line);border-radius:20px;background:var(--panel-3);color:var(--text);padding:15px 16px;outline:none}.concept-input{border:0;border-radius:0;background:transparent;padding:19px 20px}.input::placeholder,.concept-input::placeholder,.textarea::placeholder{color:var(--muted)}.textarea{resize:vertical;min-height:120px}.dark{background:rgba(255,255,255,.05)}
.cta-button,.mini-button,.nav-arrow,.quiz-option,.progress-dot{border:0;border-bottom:5px solid var(--lime-deep);border-radius:18px;background:var(--lime);color:#fff;padding:16px 22px;font-weight:900;cursor:pointer}.mini-button{padding:10px 14px;border-bottom-width:4px}.secondary-button{background:var(--panel-3);color:var(--text);border:2px solid var(--line);border-bottom-width:4px;border-bottom-color:rgba(255,255,255,.18)}.nav-arrow{min-width:56px;font-size:24px;padding:16px 0}.cta-button:disabled,.mini-button:disabled,.nav-arrow:disabled{cursor:not-allowed;opacity:.55}.cta-button.wide{width:100%;margin-top:14px}
.topic-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px}.topic-chip{background:var(--panel-3);color:var(--text);border-radius:22px;padding:14px 16px;text-align:left;cursor:pointer}.topic-chip span{display:block;font-weight:800;margin-bottom:4px}.topic-chip small{color:var(--muted)}
.level-grid{margin-top:22px;grid-template-columns:repeat(3,minmax(0,1fr))}.level-card{background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);color:var(--text);border-radius:26px;padding:24px;text-align:left;cursor:pointer}.level-card.active{transform:translateY(-4px)}.level-bar{width:42px;height:6px;border-radius:999px;margin-bottom:16px}.level-card strong{font-size:24px;display:block}.level-card span,.level-card p{color:var(--muted)}
.error-banner{margin-top:18px;background:rgba(255,107,107,.14);border-radius:18px;padding:16px 18px;color:#ffdede}.lesson-stack{display:grid;gap:22px}.lesson-hero{display:flex;justify-content:space-between;gap:20px;align-items:start}.lesson-hero h2{margin:8px 0 10px;font-size:44px;font-family:'Schoolbell',cursive}.snapshot-card{min-width:220px;border-radius:24px;background:var(--panel-3);padding:18px}.snapshot-line{display:flex;justify-content:space-between;margin-top:10px;gap:12px}.snapshot-line span{color:var(--muted)}
.tabs{flex-wrap:wrap;margin-bottom:16px}.tab{border:2px solid var(--line);background:var(--panel-3);color:var(--text);border-radius:18px;padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer}.tab.active{background:rgba(88,204,2,.14)}.tab small{color:var(--muted);display:block}.dot{width:12px;height:12px;border-radius:999px}.explanation-card{border-width:2px;border-style:solid;border-radius:26px;background:var(--panel-3);padding:24px}.explanation-card.long-form p{margin:10px 0 0;color:var(--text);line-height:2.05;font-size:18px;white-space:pre-wrap}.mode-card,.slide-card,.flashcard,.quiz-question,.insight-panel{border-radius:24px;background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);padding:22px}
.slide-shell{align-items:stretch}.slide-card{flex:1;min-height:420px;display:flex;flex-direction:column;justify-content:center;padding:38px}.slide-card h3{font-family:'Schoolbell',cursive;font-size:52px;margin:0 0 18px}.slide-card p{font-size:22px;color:var(--text);line-height:2}.slide-progress{color:var(--sun);font-weight:900;text-transform:uppercase;letter-spacing:.14em;margin-bottom:12px}.progress-dots{flex-wrap:wrap;margin-top:14px}.progress-dot{background:var(--panel-3);border-bottom-color:rgba(255,255,255,.18);padding:10px 14px}.progress-dot.active{background:var(--lime)}
.bullet-stack{gap:10px;margin-top:12px}.bullet-card{border-radius:18px;background:var(--panel-3);padding:14px 15px;line-height:1.6}.success-card{background:rgba(88,204,2,.14)}.warning-card{background:rgba(255,216,74,.12)}
.action-row{display:flex;flex-wrap:wrap;gap:12px;margin-top:18px}.top-gap{margin-top:14px}.choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.path-card{border:2px solid var(--line);border-radius:26px;background:linear-gradient(180deg,var(--panel-2) 0%,var(--panel) 100%);color:var(--text);padding:24px;text-align:left;cursor:pointer;transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;box-shadow:var(--shadow)}.path-card:hover,.path-card.active{transform:translateY(-4px);border-color:rgba(88,204,2,.45)}.path-card strong{display:block;font-size:28px;margin:12px 0 10px}.path-card p{margin:0;color:var(--muted);line-height:1.7}.path-cta{display:inline-flex;margin-top:18px;font-weight:900;color:var(--sun)}.flashcards-panel .flashcard{width:100%;min-height:260px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:var(--panel-3);color:var(--text);cursor:pointer}.flashcard-face{font-size:28px;line-height:1.6}.flashcard small{margin-top:16px;color:var(--muted)}.flashcard.flipped{border-color:rgba(255,216,74,.45)}.flashcard-nav{justify-content:space-between;margin-top:14px}
.quiz-score{font-weight:900;color:var(--sun);margin-bottom:14px}.quiz-list{gap:14px}.quiz-question{display:grid;gap:14px}.quiz-options{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.quiz-option{background:var(--panel-3);border-bottom-color:rgba(255,255,255,.18);text-align:left}.quiz-option.selected{background:rgba(124,184,255,.18);border-bottom-color:var(--sky);box-shadow:0 0 0 2px rgba(124,184,255,.18) inset}.quiz-option.correct{background:rgba(88,204,2,.18);border-bottom-color:var(--lime)}.quiz-option.wrong{background:rgba(255,107,107,.16);border-bottom-color:#db5a5a}.slow-chip{background:rgba(255,216,74,.16);color:var(--sun);padding:6px 10px;border-radius:999px;font-size:12px;font-weight:800}
.question-box{border-radius:24px;background:var(--panel-3);padding:18px}.question-row{padding:12px 0;border-bottom:1px solid var(--line);line-height:1.6}.question-row:last-child{border-bottom:0}.toggle-row{margin-top:18px;flex-wrap:wrap}.toggle-pill{border:2px solid var(--line);border-radius:999px;background:var(--panel);color:var(--text);padding:12px 16px;font-weight:800;cursor:pointer}.toggle-pill.active{background:rgba(88,204,2,.16);border-color:rgba(88,204,2,.38)}.toggle-pill.danger.active{background:rgba(255,107,107,.14);border-color:rgba(255,107,107,.35)}.slow-summary{margin-top:18px;color:var(--muted)}
.coach-response{margin-top:20px;border-radius:24px;background:rgba(88,204,2,.12);padding:18px}.coach-response small{color:var(--muted)}.quiz-summary-card{background:rgba(124,184,255,.12)}.teachback-grid{margin-top:16px}.eggzy{width:260px;max-width:100%}.eggzy.compact{width:42px}
@media (max-width:1080px){.grid.three-up,.quiz-options,.level-grid,.grid.two-up,.teachback-grid,.choice-grid,.dashboard-grid{grid-template-columns:1fr}.hero-panel,.lesson-hero,.slide-shell{flex-direction:column}.nav-arrow{width:100%}.slide-card{min-height:320px}.slide-card h3{font-size:38px}.slide-card p{font-size:18px}}
@media (max-width:720px){.page-frame{width:min(100% - 20px,1240px)}.topbar,.topbar-actions{flex-direction:column;align-items:flex-start}.brand-title{font-size:28px}.hero-copy h1{font-size:42px}.cta-button{width:100%}.input-shell{flex-direction:column}.flashcard-face{font-size:22px}}
`;























