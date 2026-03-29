
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createDatabase, getTopicBySlug, listTopics } from "./db.js";
import { verifyAuthToken } from "./auth.js";
import { getUserDashboard, getUserHistory, getUserLearningContext, recordLearningEvent, saveLessonSession } from "./supabaseDb.js";
import { DEFAULT_UI_COPY, LANGUAGE_OPTIONS } from "../shared/localization.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const db = createDatabase();
const geminiApiKey = process.env.GEMINI_API_KEY || "";
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const groqApiKey = process.env.GROQ_API_KEY || "";
const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const uiCopyCache = new Map();

app.use(cors());
app.use(express.json());
app.use(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  req.user = await verifyAuthToken(token);
  next();
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, seededTopics: listTopics(db).length, aiProvider: getAiProvider(), authenticated: Boolean(req.user) });
});

app.get("/api/languages", (_req, res) => {
  res.json({ languages: LANGUAGE_OPTIONS });
});

app.get("/api/ui-copy", async (req, res) => {
  const code = String(req.query.language || "en").toLowerCase();
  const languageMeta = LANGUAGE_OPTIONS.find((item) => item.code === code) || LANGUAGE_OPTIONS[0];
  if (languageMeta.code === "en") {
    return res.json({ copy: DEFAULT_UI_COPY });
  }
  if (uiCopyCache.has(languageMeta.code)) {
    return res.json({ copy: uiCopyCache.get(languageMeta.code) });
  }
  try {
    const copy = await translateUiCopy(languageMeta);
    uiCopyCache.set(languageMeta.code, copy);
    return res.json({ copy });
  } catch (error) {
    console.error("UI copy translation failed, using English:", error);
    return res.json({ copy: DEFAULT_UI_COPY });
  }
});

app.get("/api/topics", (_req, res) => {
  res.json({ topics: listTopics(db) });
});

app.get("/api/topics/:slug", (req, res) => {
  const topic = getTopicBySlug(db, req.params.slug);
  if (!topic) {
    return res.status(404).json({ error: "Topic not found" });
  }
  return res.json({ topic });
});

app.get("/api/dashboard", async (req, res) => {
  if (!req.user?.uid) {
    return res.status(401).json({ error: "Login required" });
  }

  const dashboard = await getUserDashboard(req.user.uid);
  return res.json({ dashboard });
});

app.get("/api/history", async (req, res) => {
  if (!req.user?.uid) {
    return res.status(401).json({ error: "Login required" });
  }

  const history = await getUserHistory(req.user.uid);
  return res.json({ history });
});

app.post("/api/hesitation", async (req, res) => {
  if (!req.user?.uid) {
    return res.status(200).json({ ok: false });
  }

  const { remoteSessionId = null, topic = "", topicSlug = null, topicCategory = "General", learnerLevel = "beginner", mood = "focused", preferredStyle = "analogy", interest = "", language = "English", question = null } = req.body || {};
  if (!question?.prompt) {
    return res.status(400).json({ error: "Question note required" });
  }

  await recordLearningEvent({
    user: buildAuthUser(req.user),
    learnerName: req.user?.name || req.user?.email || null,
    lessonSessionId: remoteSessionId,
    eventType: "question_hesitation",
    topic,
    topicSlug,
    generationMode: "quiz",
    lessonPhase: "quiz",
    learnerLevel,
    mood,
    preferredStyle,
    interest,
    language,
    slowQuestions: [question],
    notes: `${question.category || "Quiz hesitation"}: ${question.prompt}`,
  });

  return res.json({ ok: true });
});
app.post("/api/explain", async (req, res) => {
  const {
    topicSlug,
    customTopic = "",
    learnerName = "",
    learnerLevel = "beginner",
    mood = "focused",
    preferredStyle = "analogy",
    interest = "",
    language = "English",
    generationMode = "lesson",
    flashcardCount = 5,
    quizQuestionCount = 4,
    performanceSignals = {},
    regenerationSeed = "",
    confusionPattern = "",
    previousBehavior = "",
  } = req.body || {};

  const topic = topicSlug ? getTopicBySlug(db, topicSlug) : null;
  if (!topic && !customTopic.trim()) {
    return res.status(400).json({ error: "Provide a predefined topic or a custom topic." });
  }

  const authUser = buildAuthUser(req.user);
  const historyContext = authUser?.uid ? await getUserLearningContext(authUser.uid) : null;

  const learner = {
    learnerLevel,
    mood,
    preferredStyle,
    interest,
    language,
    learnerName,
    generationMode,
    flashcardCount,
    quizQuestionCount,
    performanceSignals,
    regenerationSeed,
    confusionPattern,
    previousBehavior,
    historyContext,
  };

  const learnerProfileId = upsertLearnerProfile(db, {
    learnerName,
    learnerLevel,
    mood,
    preferredStyle,
    confusionPattern,
    previousBehavior,
  });

  const lesson = await createLesson({
    topic,
    customTopic: customTopic.trim(),
    learner,
  });

  const sessionId = db.prepare(`
    INSERT INTO learning_sessions (
      learner_profile_id, topic_id, custom_topic, active_level, lesson_payload
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    learnerProfileId,
    topic?.id ?? null,
    customTopic.trim() || null,
    learnerLevel,
    JSON.stringify(lesson)
  ).lastInsertRowid;

  const remoteSessionId = await saveLessonSession({
    user: authUser,
    learnerName,
    topic: lesson.topic.title,
    topicSlug: topic?.slug || null,
    customTopic: customTopic.trim() || null,
    learnerLevel,
    mood,
    preferredStyle,
    interest,
    language,
    generationMode,
    lessonPayload: lesson,
    lessonSummary: lesson.topic.shortSummary,
  });

  void recordLearningEvent({
    user: authUser,
    learnerName,
    lessonSessionId: remoteSessionId,
    eventType: generationMode === "lesson" ? "lesson_requested" : generationMode,
    topic: lesson.topic.title,
    topicSlug: topic?.slug || null,
    generationMode,
    lessonPhase: generationMode === "lesson" ? "explanation" : generationMode,
    learnerLevel,
    mood,
    preferredStyle,
    interest,
    language,
    slowQuestions: performanceSignals?.slowQuestions || [],
    wrongQuestions: performanceSignals?.wrongQuestions || [],
    missedConcepts: performanceSignals?.missedConcepts || [],
    confusionArea: performanceSignals?.confusionArea || null,
    overlapScore: performanceSignals?.overlapScore ?? null,
    quizScore: performanceSignals?.quizScore ?? null,
    totalQuestions: performanceSignals?.totalQuestions ?? null,
    learnerExplanation: performanceSignals?.learnerExplanation || null,
  });

  return res.json({
    sessionId,
    remoteSessionId,
    lesson,
  });
});

app.post("/api/feedback", async (req, res) => {
  const { sessionId, understood = false, learnerExplanation = "", confusionArea = "", performanceSignals = {} } = req.body || {};
  const session = db.prepare("SELECT * FROM learning_sessions WHERE id = ?").get(sessionId);

  if (!session) {
    return res.status(404).json({ error: "Learning session not found" });
  }

  const lesson = JSON.parse(session.lesson_payload);
  const authUser = buildAuthUser(req.user);
  const historyContext = authUser?.uid ? await getUserLearningContext(authUser.uid) : null;
  const localFeedback = buildLocalTeachbackFeedback({
    lesson,
    understood,
    learnerExplanation,
    confusionArea,
    performanceSignals,
  });
  const aiFeedback = await generateTeachbackFeedback({
    lesson,
    understood,
    learnerExplanation,
    confusionArea,
    performanceSignals,
    historyContext,
  }).catch(() => null);
  const finalFeedback = {
    ...localFeedback,
    ...(aiFeedback || {}),
    strongPoints: aiFeedback?.strongPoints?.length ? aiFeedback.strongPoints : localFeedback.strongPoints,
    missedConcepts: aiFeedback?.missedConcepts?.length ? aiFeedback.missedConcepts : localFeedback.missedConcepts,
    reteachSteps: aiFeedback?.reteachSteps?.length ? aiFeedback.reteachSteps : localFeedback.reteachSteps,
    questionBank: aiFeedback?.questionBank?.length ? aiFeedback.questionBank : localFeedback.questionBank,
  };

  db.prepare(`
    INSERT INTO understanding_checks (
      session_id, understood, learner_explanation, confusion_area, overlap_score, coaching_response
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    understood ? 1 : 0,
    learnerExplanation.trim() || null,
    confusionArea.trim() || null,
    finalFeedback.overlapScore,
    finalFeedback.coachingResponse
  );

  void recordLearningEvent({
    user: authUser,
    learnerName: lesson.learnerSnapshot?.learnerName || null,
    lessonSessionId: req.body.remoteSessionId || null,
    eventType: "teachback_submitted",
    topic: lesson.topic.title,
    topicSlug: lesson.topic.slug || null,
    generationMode: "feedback",
    lessonPhase: "teachback",
    learnerLevel: session.active_level,
    mood: lesson.learnerSnapshot?.mood || null,
    preferredStyle: lesson.learnerSnapshot?.preferredStyle || null,
    interest: lesson.learnerSnapshot?.interest || null,
    language: lesson.learnerSnapshot?.language || "English",
    slowQuestions: performanceSignals?.slowQuestions || [],
    wrongQuestions: performanceSignals?.wrongQuestions || [],
    missedConcepts: finalFeedback.missedConcepts || performanceSignals?.missedConcepts || [],
    confusionArea,
    overlapScore: finalFeedback.overlapScore,
    quizScore: performanceSignals?.quizScore ?? null,
    totalQuestions: performanceSignals?.totalQuestions ?? null,
    learnerExplanation,
    feedbackAction: finalFeedback.nextAction,
    notes: finalFeedback.coachingResponse,
  });

  return res.json(finalFeedback);
});

async function generateTeachbackFeedback({ lesson, understood, learnerExplanation, confusionArea, performanceSignals, historyContext }) {
  if (groqApiKey) {
    return requestGroqLessonJson(buildTeachbackFeedbackPrompt({ lesson, understood, learnerExplanation, confusionArea, performanceSignals, historyContext }));
  }

  if (geminiApiKey) {
    return requestGeminiLessonJson(buildTeachbackFeedbackPrompt({ lesson, understood, learnerExplanation, confusionArea, performanceSignals, historyContext }));
  }

  return buildLocalTeachbackFeedback({ lesson, understood, learnerExplanation, confusionArea, performanceSignals });
}

function buildTeachbackFeedbackPrompt({ lesson, understood, learnerExplanation, confusionArea, performanceSignals, historyContext }) {
  return `
You are Eggzy, an adaptive AI teacher. Return only valid JSON.

Analyze this learner teach-back and decide what they still need to learn.

Lesson topic: ${lesson?.topic?.title || "Unknown topic"}
Learner level: ${lesson?.learnerSnapshot?.learnerLevel || "beginner"}
Learner mood: ${lesson?.learnerSnapshot?.mood || "focused"}
Learner language: ${lesson?.learnerSnapshot?.language || "English"}
Learner interest: ${lesson?.learnerSnapshot?.interest || "general"}
Learner says they understood: ${understood ? "yes" : "no"}
Confusion area: ${confusionArea || "none"}

Lesson summary:
${lesson?.topic?.summary || ""}

Core explanation:
${lesson?.topic?.coreIdea || ""}
${lesson?.topic?.howItWorks || ""}

Teach-back paragraph:
${learnerExplanation || "none"}

Performance signals:
${formatPerformanceSignals(performanceSignals)}

Prior learner history:
${formatHistoryContext(historyContext)}

Return JSON with exactly these keys:
{
  "overlapScore": number between 0 and 1,
  "coachingResponse": string,
  "nextAction": "advance" or "reteach",
  "strongPoints": string[],
  "missedConcepts": string[],
  "reteachSteps": string[],
  "questionBank": string[]
}

Rules:
- Use the learner explanation and performance signals to identify what is missing.
- Generate 3 to 5 strong points, 3 to 5 missed concepts, 3 to 5 reteach steps, and 4 to 6 question-bank prompts.
- The question bank should focus on what the learner still needs to learn, not generic revision.
- The coaching response should clearly tell the learner what they did well, what they missed, and what to focus on next.
- If the learner is weak, set nextAction to "reteach" and emphasize the missing parts that should be highlighted in the next explanation.
- If the learner is strong, set nextAction to "advance" but still note any small gaps.
- Keep everything in ${lesson?.learnerSnapshot?.language || "English"}.
`;
}

function buildLocalTeachbackFeedback({ lesson, understood, learnerExplanation, confusionArea, performanceSignals = {} }) {
  const referenceText = `${lesson?.topic?.summary || ""} ${lesson?.topic?.coreIdea || ""} ${lesson?.topic?.howItWorks || ""}`;
  const overlapScore = scoreExplanation(learnerExplanation, referenceText);
  const learnerTokens = new Set(tokenize(learnerExplanation));
  const conceptPool = [lesson?.topic?.title, lesson?.topic?.foundation, lesson?.topic?.coreIdea, lesson?.topic?.howItWorks, ...(lesson?.checkInQuestions || [])]
    .filter(Boolean)
    .join(" ");
  const keywords = [...new Set(tokenize(conceptPool))].slice(0, 18);
  const strongPoints = keywords.filter((token) => learnerTokens.has(token)).slice(0, 4).map(capitalizeWord);
  const missedConcepts = [
    ...(performanceSignals?.missedConcepts || []),
    ...keywords.filter((token) => !learnerTokens.has(token)).slice(0, 4).map(capitalizeWord),
  ].filter((item, index, array) => item && array.indexOf(item) === index).slice(0, 5);
  const slowPrompts = (performanceSignals?.slowQuestions || []).map((item) => item?.prompt || item).filter(Boolean);
  const wrongPrompts = (performanceSignals?.wrongQuestions || []).map((item) => item?.prompt || item).filter(Boolean);
  const reteachSteps = [
    confusionArea ? `Re-explain ${confusionArea} in simpler language before moving on.` : `Restart from the core purpose of ${lesson?.topic?.title || "the topic"}.`,
    missedConcepts[0] ? `Make sure the next explanation clearly covers ${missedConcepts[0]}.` : `Add the missing mechanism and why it matters.`,
    slowPrompts[0] ? `Spend extra time on this tricky question idea: ${slowPrompts[0]}` : `Use one worked example before returning to the quiz.`,
  ].filter(Boolean);
  const questionBank = [
    confusionArea ? `Explain ${confusionArea} in your own words.` : `What is the main purpose of ${lesson?.topic?.title || "this topic"}?`,
    missedConcepts[0] ? `Where does ${missedConcepts[0]} fit into ${lesson?.topic?.title || "this topic"}?` : `How does the core process of ${lesson?.topic?.title || "this topic"} work?`,
    wrongPrompts[0] ? `Retry this idea carefully: ${wrongPrompts[0]}` : `What real-life example best shows ${lesson?.topic?.title || "this topic"}?`,
    slowPrompts[0] ? `Why was this question difficult: ${slowPrompts[0]}` : `What would you teach first to a beginner?`,
  ].filter(Boolean);
  return {
    overlapScore,
    coachingResponse: buildCoachingResponse({ understood, learnerExplanation, confusionArea, overlapScore, lesson }),
    nextAction: understood && overlapScore >= 0.35 && missedConcepts.length <= 2 ? "advance" : "reteach",
    strongPoints,
    missedConcepts,
    reteachSteps,
    questionBank,
  };
}

function capitalizeWord(word) {
  return String(word || "").charAt(0).toUpperCase() + String(word || "").slice(1);
}

export { app };

if (process.env.SERVER_MODE !== "function") {
  app.listen(port, () => {
    console.log(`Eggzy API running on http://localhost:${port}`);
  });
}

function upsertLearnerProfile(
  dbInstance,
  { learnerName, learnerLevel, mood, preferredStyle, confusionPattern, previousBehavior }
) {
  return dbInstance.prepare(`
    INSERT INTO learner_profiles (
      name, knowledge_level, mood, preferred_style, confusion_pattern, previous_behavior
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    learnerName.trim() || null,
    learnerLevel,
    mood,
    preferredStyle,
    confusionPattern.trim() || null,
    previousBehavior.trim() || null
  ).lastInsertRowid;
}

async function createLesson({ topic, customTopic, learner }) {
  if (groqApiKey) {
    try {
      return await generateLessonWithGroq({ topic, customTopic, learner });
    } catch (error) {
      console.error("Groq generation failed, falling back:", error);
    }
  }

  if (geminiApiKey) {
    try {
      return await generateLessonWithGemini({ topic, customTopic, learner });
    } catch (error) {
      console.error("Gemini generation failed, using local lesson:", error);
    }
  }

  return topic ? buildAdaptiveLesson(topic, learner) : buildCustomLesson(customTopic, learner);
}

function getAiProvider() {
  if (groqApiKey) {
    return "groq";
  }

  if (geminiApiKey) {
    return "gemini";
  }

  return "local";
}

async function generateLessonWithGroq({ topic, customTopic, learner }) {
  let lesson = normalizeLesson(await requestGroqLessonJson(buildLessonPrompt({ topic, customTopic, learner })), { topic, customTopic, learner });

  for (let attempt = 0; attempt < 2 && !isLessonRichEnough(lesson); attempt += 1) {
    lesson = normalizeLesson(
      await requestGroqLessonJson(buildLessonRefinementPrompt({ topic, customTopic, learner, draftLesson: lesson })),
      { topic, customTopic, learner }
    );
  }

  return lesson;
}

function buildLessonPrompt({ topic, customTopic, learner }) {
  const subject = topic?.title || customTopic;
  const generationModeNotes = {
    lesson: "Give the full best teaching experience from explanation through revision.",
    quiz_refresh: "Keep the lesson coherent, but prioritize generating a fresh set of quiz questions that are meaningfully different from before.",
    flashcards_refresh: "Keep the lesson coherent, but prioritize generating fresh flashcards with different wording, prompts, and memory cues.",
    reteach: "Reteach the concept with a noticeably different approach that directly addresses the learner's weak spots, hesitation, and mistakes.",
  };

  return `
You are Eggzy, an adaptive AI teacher. Return only valid JSON.

Create a personalized lesson for "${subject}".

Learner profile:
- level: ${learner.learnerLevel}
- mood: ${learner.mood}
- preferred style: ${learner.preferredStyle}
- interest: ${learner.interest || "general"}
- language: ${learner.language || "English"}
- learner name: ${learner.learnerName || "not provided"}
- generation mode: ${learner.generationMode || "lesson"}
- performance signals:
${formatPerformanceSignals(learner.performanceSignals)}
- regeneration seed: ${learner.regenerationSeed || "none"}
- prior learning context:
${formatHistoryContext(learner.historyContext)}

Lesson rules:
- Teach in the learner's chosen language.
- Use the learner's interest only inside the child/elementary explanation and child-friendly examples. Do not weave it into intermediate or advanced explanations.
- Sound like a patient teacher, not a chatbot.
- Use every learner detail you were given to customize the answer.
- If a learner name is provided, address the learner naturally by name in the main level explanations and learningModes fields. Use the name lightly and helpfully, not in every sentence.
- The lesson must feel genuinely different across child, beginner, and expert. Do not just rewrite the first paragraph and keep the rest the same.
- Include foundation, core idea, how it works, real-world example, and summary.
- When relevant, include origin, history, inventor/founder, timeline, evolution, and why the topic became important.
- Give as much detail as it requires to explain the topic completely, not just define it.
- Make the explanation rich enough to genuinely teach the topic completely, not just define it.
- Make each top-level explanation a long-form teaching narrative, not a short intro. Target roughly 220-420 words per level explanation.
- Create a complete five-stage lesson deck for child, beginner, and expert separately. Every stage body should be tailored to that level and roughly 110-220 words.
- The full lesson body must change with the selected level, including the slide content, not just the headline explanation.
- Include learning modes for analogy, stepByStep, and realLife.
- Include level explanations for child, beginner, and expert.
- Include exactly ${learner.flashcardCount || 5} flashcards for revision.
- Include exactly ${learner.quizQuestionCount || 4} MCQ quiz questions with exactly 4 options each, a correctAnswer index, and a reteach hint.
- Include exactly 3 adaptive tips, 3 confusion hotspots, and 3 check-in questions.
- If performance signals show hesitation, wrong answers, or missing concepts, explicitly target those weak areas in the explanation, hints, flashcards, and adaptive tips.
- If prior learning context exists, connect this lesson to the learner's weak topics, past mistakes, and repeated hesitation patterns where relevant.
- If generation mode asks for fresh quiz questions or flashcards, make them new and not reworded duplicates.
- Silently self-review before answering. If any section is generic, shallow, repetitive across levels, or fails to use the learner data, rewrite it before returning.
- ${generationModeNotes[learner.generationMode] || generationModeNotes.lesson}

Return JSON with this exact shape:
${getLessonJsonShape()}
`.trim();
}

function buildLessonRefinementPrompt({ topic, customTopic, learner, draftLesson }) {
  const subject = topic?.title || customTopic;
  return `
You are improving an Eggzy lesson draft for "${subject}".

Your job:
- keep the same JSON schema
- preserve valid quiz structure and counts
- preserve flashcard counts
- strengthen weak or generic explanations
- make child, beginner, and expert clearly different across the full lesson body
- use every learner detail and history signal more concretely
- make the lesson complete enough to genuinely teach the topic

Learner profile recap:
- level: ${learner.learnerLevel}
- mood: ${learner.mood}
- preferred style: ${learner.preferredStyle}
- interest: ${learner.interest || "general"}
- language: ${learner.language || "English"}
- learner name: ${learner.learnerName || "not provided"}
- generation mode: ${learner.generationMode || "lesson"}
- performance signals:
${formatPerformanceSignals(learner.performanceSignals)}
- prior learning context:
${formatHistoryContext(learner.historyContext)}

Current draft weaknesses to fix:
${summarizeLessonGaps(draftLesson)}

Requirements:
- Return valid JSON only.
- Strengthen the entire lesson, not just the introduction.
- Every level explanation must feel complete.
- Every level must have a complete five-stage deck with materially different bodies.
- If the learner hesitated, got questions wrong, or missed concepts, weave those weak spots into the reteach framing, examples, hints, and summaries.
- If the topic naturally has history, origin, inventors, milestones, or evolution, include them where they genuinely help understanding.

Schema:
${getLessonJsonShape()}

Current draft JSON:
${JSON.stringify(draftLesson)}
`.trim();
}

function getLessonJsonShape() {
  return `{
  "topic": {
    "slug": null,
    "title": "string",
    "category": "string",
    "shortSummary": "string",
    "foundation": "string",
    "coreIdea": "string",
    "howItWorks": "string",
    "realWorldExample": "string",
    "summary": "string"
  },
  "learnerSnapshot": {
    "level": "string",
    "mood": "string",
    "preferredStyle": "string",
    "interest": "string",
    "language": "string"
  },
  "stages": [
    { "id": "foundation", "title": "Foundation", "body": "string" },
    { "id": "core", "title": "Core Idea", "body": "string" },
    { "id": "how", "title": "How It Works", "body": "string" },
    { "id": "example", "title": "Real-World Example", "body": "string" },
    { "id": "summary", "title": "Summary", "body": "string" }
  ],
  "levelStages": {
    "child": [
      { "id": "foundation", "title": "Foundation", "body": "string" },
      { "id": "core", "title": "Core Idea", "body": "string" },
      { "id": "how", "title": "How It Works", "body": "string" },
      { "id": "example", "title": "Real-World Example", "body": "string" },
      { "id": "summary", "title": "Summary", "body": "string" }
    ],
    "beginner": [
      { "id": "foundation", "title": "Foundation", "body": "string" },
      { "id": "core", "title": "Core Idea", "body": "string" },
      { "id": "how", "title": "How It Works", "body": "string" },
      { "id": "example", "title": "Real-World Example", "body": "string" },
      { "id": "summary", "title": "Summary", "body": "string" }
    ],
    "expert": [
      { "id": "foundation", "title": "Foundation", "body": "string" },
      { "id": "core", "title": "Core Idea", "body": "string" },
      { "id": "how", "title": "How It Works", "body": "string" },
      { "id": "example", "title": "Real-World Example", "body": "string" },
      { "id": "summary", "title": "Summary", "body": "string" }
    ]
  },
  "learningModes": {
    "analogy": "string",
    "stepByStep": "string",
    "realLife": "string"
  },
  "levelExplanations": {
    "child": "string",
    "beginner": "string",
    "expert": "string"
  },
  "flashcards": [
    { "front": "string", "back": "string" }
  ],
  "quizQuestions": [
    {
      "id": "string",
      "prompt": "string",
      "options": ["string", "string", "string", "string"],
      "correctAnswer": 0,
      "hint": "string"
    }
  ],
  "adaptiveTips": ["string", "string", "string"],
  "confusionHotspots": ["string", "string", "string"],
  "checkInQuestions": ["string", "string", "string"]
}`;
}

function formatPerformanceSignals(signals = {}) {
  const slowQuestions = (signals?.slowQuestions || []).map((item) => item?.prompt || item).filter(Boolean);
  const wrongQuestions = (signals?.wrongQuestions || []).map((item) => item?.prompt || item).filter(Boolean);
  const missedConcepts = (signals?.missedConcepts || []).filter(Boolean);
  return [
    `  * current lesson phase: ${signals?.lessonPhase || "unknown"}`,
    `  * quiz score: ${signals?.quizScore ?? "n/a"} / ${signals?.totalQuestions ?? "n/a"}`,
    `  * hesitation notes: ${slowQuestions.length ? slowQuestions.join(" | ") : "none"}`,
    `  * wrong questions: ${wrongQuestions.length ? wrongQuestions.join(" | ") : "none"}`,
    `  * missed concepts: ${missedConcepts.length ? missedConcepts.join(" | ") : "none"}`,
    `  * confusion area: ${signals?.confusionArea || "none"}`,
    `  * teach-back overlap score: ${signals?.overlapScore ?? "n/a"}`,
    `  * learner explanation summary: ${signals?.learnerExplanation ? String(signals.learnerExplanation).slice(0, 280) : "none"}`,
  ].join("\n");
}

function formatHistoryContext(historyContext = {}) {
  return [
    `  * weak topics: ${(historyContext?.weakTopics || []).map((item) => item.topic || item).filter(Boolean).join(" | ") || "none"}`,
    `  * recent topics: ${(historyContext?.recentTopics || []).join(" | ") || "none"}`,
    `  * repeated wrong questions: ${(historyContext?.repeatedWrongQuestions || []).map((item) => item?.prompt || item).filter(Boolean).join(" | ") || "none"}`,
    `  * repeated slow questions: ${(historyContext?.repeatedSlowQuestions || []).map((item) => item?.prompt || item).filter(Boolean).join(" | ") || "none"}`,
    `  * missed concepts: ${(historyContext?.missedConcepts || []).join(" | ") || "none"}`,
    `  * last confusion area: ${historyContext?.lastConfusionArea || "none"}`,
  ].join("\n");
}

async function requestGroqLessonJson(prompt) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({
      model: groqModel,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: "You are Eggzy, an adaptive AI teacher. Always return valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Groq returned no content.");
  }

  return extractJsonObject(text);
}

async function generateLessonWithGemini({ topic, customTopic, learner }) {
  let lesson = normalizeLesson(await requestGeminiLessonJson(buildLessonPrompt({ topic, customTopic, learner })), { topic, customTopic, learner });

  for (let attempt = 0; attempt < 2 && !isLessonRichEnough(lesson); attempt += 1) {
    lesson = normalizeLesson(
      await requestGeminiLessonJson(buildLessonRefinementPrompt({ topic, customTopic, learner, draftLesson: lesson })),
      { topic, customTopic, learner }
    );
  }

  return lesson;
}

async function requestGeminiLessonJson(prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) {
    throw new Error("Gemini returned no content.");
  }

  return extractJsonObject(text);
}
function extractJsonObject(text) {
  const trimmed = String(text || "").trim();

  try {
    return JSON.parse(trimmed);
  } catch {}

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return JSON.parse(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  throw new Error("Model returned text that could not be parsed as JSON.");
}
function normalizeLesson(rawLesson, { topic, customTopic, learner }) {
  const subject = topic?.title || customTopic || "Custom topic";
  const normalizedTopic = {
    slug: topic?.slug || null,
    title: rawLesson?.topic?.title || subject,
    category: topic?.category || rawLesson?.topic?.category || "Custom",
    shortSummary: rawLesson?.topic?.shortSummary || topic?.shortSummary || `A guided Eggzy lesson for ${subject}.`,
    foundation: rawLesson?.topic?.foundation || `${subject} becomes easier once you define what it is, why it matters, and what problem it solves.`,
    coreIdea: rawLesson?.topic?.coreIdea || `${subject} is easier to understand when you identify its main purpose, the important parts inside it, and the outcome those parts create together.`,
    howItWorks: rawLesson?.topic?.howItWorks || `Follow ${subject} as a sequence from setup to process to outcome, and make each transition visible.`,
    realWorldExample: rawLesson?.topic?.realWorldExample || `Think of ${subject} in a real-world example tied to ${learner.interest || "daily life"}.`,
    summary: rawLesson?.topic?.summary || `${subject} is easiest to remember as purpose, process, history, and application working together.`,
    childAnalogy: rawLesson?.topic?.childAnalogy || topic?.childAnalogy || `Think of ${subject} like a tool with one clear job that helps something important happen.`,
    beginnerAnalogy: rawLesson?.topic?.beginnerAnalogy || topic?.beginnerAnalogy || `${subject} makes more sense when you move from the problem to the mechanism and then to the outcome.`,
    expertNuance: rawLesson?.topic?.expertNuance || topic?.expertNuance || `At an advanced level, explain the architecture, assumptions, tradeoffs, limitations, and edge cases behind ${subject}.`,
  };
  const levelExplanations = normalizeLevelExplanations(rawLesson?.levelExplanations, normalizedTopic, learner);
  const levelStages = normalizeLevelStages(rawLesson?.levelStages, rawLesson?.stages, normalizedTopic, learner, levelExplanations);

  return {
    topic: {
      slug: normalizedTopic.slug,
      title: normalizedTopic.title,
      category: normalizedTopic.category,
      shortSummary: normalizedTopic.shortSummary,
      foundation: normalizedTopic.foundation,
      coreIdea: normalizedTopic.coreIdea,
      howItWorks: normalizedTopic.howItWorks,
      realWorldExample: normalizedTopic.realWorldExample,
      summary: normalizedTopic.summary,
    },
    learnerSnapshot: {
      level: learner.learnerLevel,
      mood: learner.mood,
      preferredStyle: learner.preferredStyle,
      interest: learner.interest || "",
      language: learner.language || "English",
      confusionPattern: learner.confusionPattern || "",
      previousBehavior: learner.previousBehavior || "",
    },
    requestedCounts: {
      flashcards: learner.flashcardCount || 5,
      quizQuestions: learner.quizQuestionCount || 4,
    },
    stages: levelStages[learner.learnerLevel] || levelStages.beginner,
    levelStages,
    learningModes: {
      analogy: rawLesson?.learningModes?.analogy || `Explain ${subject} with an analogy linked to ${learner.interest || "daily life"}.`,
      stepByStep: rawLesson?.learningModes?.stepByStep || `Break ${subject} into clear steps and teach each one in order.`,
      realLife: rawLesson?.learningModes?.realLife || `Show ${subject} through one practical, real-world example.`,
    },
    levelExplanations,
    flashcards: normalizeFlashcards(rawLesson?.flashcards, subject, learner.flashcardCount || 5),
    quizQuestions: normalizeQuizQuestions(rawLesson?.quizQuestions, subject, learner.quizQuestionCount || 4),
    adaptiveTips: ensureTextArray(rawLesson?.adaptiveTips, 3, "Pause after each stage and explain it back in one sentence."),
    confusionHotspots: ensureTextArray(rawLesson?.confusionHotspots, 3, `Learners often remember the name of ${subject} before they understand the mechanism.`),
    checkInQuestions: ensureTextArray(rawLesson?.checkInQuestions, 3, `What is the main job of ${subject}?`),
    performanceSignals: rawLesson?.performanceSignals || learner.performanceSignals || {},
  };
}

function normalizeLevelExplanations(levelExplanations, topicContext, learner) {
  const defaults = buildDefaultLevelExplanations(topicContext, learner);
  return {
    child: String(levelExplanations?.child || defaults.child).trim(),
    beginner: String(levelExplanations?.beginner || defaults.beginner).trim(),
    expert: String(levelExplanations?.expert || defaults.expert).trim(),
  };
}

function normalizeLevelStages(levelStages, sharedStages, topicContext, learner, levelExplanations) {
  const sharedDeck = normalizeStages(sharedStages, topicContext.title, buildSharedStageFallbacks(topicContext, learner));
  return {
    child: normalizeStageDeck(levelStages?.child, buildDefaultStageDeck("child", topicContext, learner, sharedDeck, levelExplanations.child)),
    beginner: normalizeStageDeck(levelStages?.beginner, buildDefaultStageDeck("beginner", topicContext, learner, sharedDeck, levelExplanations.beginner)),
    expert: normalizeStageDeck(levelStages?.expert, buildDefaultStageDeck("expert", topicContext, learner, sharedDeck, levelExplanations.expert)),
  };
}

function normalizeStageDeck(stageDeck, defaults) {
  if (!Array.isArray(stageDeck) || stageDeck.length < defaults.length) {
    return defaults;
  }

  return defaults.map((fallback, index) => ({
    id: fallback.id,
    title: fallback.title,
    body: String(stageDeck[index]?.body || fallback.body).trim(),
  }));
}

function buildDefaultLevelExplanations(topicContext, learner) {
  const tone = getMoodTone(learner.mood);
  const styleLens = getStyleLens(learner.preferredStyle);
  const learnerPrefix = learner.learnerName ? `${learner.learnerName}, ` : "";

  return {
    child: `${learnerPrefix}${tone.encouragement} ${topicContext.childAnalogy} Start with the simple job of ${topicContext.title}, then gently explain the most important parts, then show the process like a chain of small moves. Use easy words, one vivid example, and one memory line tied to ${learner.interest || "everyday life"} so the learner can actually picture the idea instead of just repeating the name.`,
    beginner: `${learnerPrefix}${styleLens.beginnerLead} Begin by defining ${topicContext.title} from zero, including what problem it solves and why that problem matters. Then connect the purpose to the mechanism, explain the steps in order, and close with one practical example that proves the learner understands both meaning and process, not just terminology.`,
    expert: `${learnerPrefix}${getLevelGuide("expert").expertLead} Treat ${topicContext.title} as a system that has scope, internal structure, assumptions, dependencies, tradeoffs, and failure modes. Tie the explanation to relevant historical context, explain why the mechanism works the way it does, and surface the nuanced details that separate a surface definition from real technical understanding.`,
  };
}

function buildSharedStageFallbacks(topicContext, learner) {
  const tone = getMoodTone(learner.mood);
  const styleLens = getStyleLens(learner.preferredStyle);
  const levelGuide = getLevelGuide(learner.learnerLevel);
  return [
    { id: "foundation", title: "Foundation", body: `${levelGuide.foundationLead} ${topicContext.foundation}` },
    { id: "core", title: "Core Idea", body: `${styleLens.coreFraming} ${topicContext.coreIdea}` },
    { id: "how", title: "How It Works", body: `${levelGuide.processHint} ${topicContext.howItWorks}` },
    { id: "example", title: "Real-World Example", body: `${styleLens.exampleLead} ${topicContext.realWorldExample}` },
    { id: "summary", title: "Summary", body: `${tone.memoryCue} ${topicContext.summary}` },
  ];
}

function buildDefaultStageDeck(level, topicContext, learner, sharedDeck, levelExplanation) {
  const tone = getMoodTone(learner.mood);
  const styleLens = getStyleLens(learner.preferredStyle);
  const learnerPrefix = learner.learnerName ? `${learner.learnerName}, ` : "";
  const interestHook = learner.interest || "everyday life";
  const shared = sharedDeck.map((stage) => stage.body);

  if (level === "child") {
    return [
      { id: "foundation", title: "Foundation", body: `${learnerPrefix}${tone.encouragement} Start with the plain meaning of ${topicContext.title}. ${topicContext.foundation} Use familiar words, explain what job the idea is trying to do, and connect the opening picture to ${interestHook} so the learner feels safe before any harder detail shows up. ${shared[0]}` },
      { id: "core", title: "Core Idea", body: `${learnerPrefix}${topicContext.childAnalogy} After the picture is clear, name the key pieces in child-sized language. ${topicContext.coreIdea} Keep the number of moving parts small, explain what each part helps with, and remind the learner how those parts work together to finish the main job. ${shared[1]}` },
      { id: "how", title: "How It Works", body: `${learnerPrefix}Walk through ${topicContext.title} slowly like a chain of little moves. ${topicContext.howItWorks} Pause at each step, say what changed, and avoid jumping ahead so the learner can follow the process without losing the thread. ${shared[2]}` },
      { id: "example", title: "Real-World Example", body: `${learnerPrefix}Now put ${topicContext.title} inside a scene the learner can actually imagine. ${topicContext.realWorldExample} If possible, link the example back to ${interestHook}, then compare each part of the example to the real concept so the picture becomes memory, not just decoration. ${shared[3]}` },
      { id: "summary", title: "Summary", body: `${learnerPrefix}${tone.memoryCue} ${topicContext.summary} End with one short repeatable chain: what it is, what it does, how it moves, and where the learner would notice it. ${levelExplanation}` },
    ];
  }

  if (level === "expert") {
    return [
      { id: "foundation", title: "Foundation", body: `${learnerPrefix}Anchor ${topicContext.title} in its domain first. ${topicContext.foundation} Clarify scope, vocabulary, historical origin, and why the problem it addresses became important in the first place. Frame the foundation so the learner can tell where the concept starts, where it ends, and what adjacent ideas it is often confused with. ${shared[0]}` },
      { id: "core", title: "Core Idea", body: `${learnerPrefix}${topicContext.expertNuance} Move beyond the headline definition and explain the architecture, governing logic, and dependencies that make ${topicContext.title} work. ${topicContext.coreIdea} Make explicit which assumptions must hold and which tradeoffs appear when the idea is applied in real systems. ${shared[1]}` },
      { id: "how", title: "How It Works", body: `${learnerPrefix}Describe the mechanism of ${topicContext.title} with technical precision. ${topicContext.howItWorks} Follow the internal flow step by step, but also point out bottlenecks, failure modes, edge cases, and the conditions under which the mechanism behaves differently than expected. ${shared[2]}` },
      { id: "example", title: "Real-World Example", body: `${learnerPrefix}Use a realistic advanced use case to ground the abstraction. ${topicContext.realWorldExample} Explain why this example is representative, what it hides, and what a practitioner should watch for when applying the concept outside the classroom or textbook version. ${shared[3]}` },
      { id: "summary", title: "Summary", body: `${learnerPrefix}${tone.memoryCue} ${topicContext.summary} Close by synthesizing scope, mechanism, tradeoffs, and application into one expert mental model that can support deeper analysis or discussion. ${levelExplanation}` },
    ];
  }

  return [
    { id: "foundation", title: "Foundation", body: `${learnerPrefix}Build the topic from zero. ${topicContext.foundation} Define the term clearly, explain what problem it solves, and introduce only the vocabulary the learner truly needs before moving forward. The goal is to make the first layer solid enough that later detail feels earned instead of overwhelming. ${shared[0]}` },
    { id: "core", title: "Core Idea", body: `${learnerPrefix}${styleLens.beginnerLead} Explain the central mechanism of ${topicContext.title} in a structured way. ${topicContext.coreIdea} Name the important parts, describe the role each part plays, and connect those roles back to the overall goal so the learner can reason about the concept, not just repeat a definition. ${shared[1]}` },
    { id: "how", title: "How It Works", body: `${learnerPrefix}Now walk through the process from start to finish. ${topicContext.howItWorks} Make the sequence explicit, note what changes at each stage, and point out why the order matters so the learner can reconstruct the mechanism from memory later. ${shared[2]}` },
    { id: "example", title: "Real-World Example", body: `${learnerPrefix}Use a grounded example to lock the concept into place. ${topicContext.realWorldExample} After describing the example, map it back to the process and purpose so the learner sees clearly how the abstract idea behaves in a practical setting. ${shared[3]}` },
    { id: "summary", title: "Summary", body: `${learnerPrefix}${tone.memoryCue} ${topicContext.summary} Finish by compressing the lesson into one clean chain: problem, purpose, process, example, and why the concept matters. ${levelExplanation}` },
  ];
}

function isLessonRichEnough(lesson) {
  const levelMinimums = { child: 220, beginner: 260, expert: 300 };
  return ["child", "beginner", "expert"].every((level) => {
    const explanation = String(lesson?.levelExplanations?.[level] || "");
    const stages = lesson?.levelStages?.[level] || [];
    return explanation.length >= levelMinimums[level] && stages.length === 5 && stages.every((stage) => String(stage?.body || "").length >= 90);
  });
}

function summarizeLessonGaps(lesson) {
  const levelMinimums = { child: 220, beginner: 260, expert: 300 };
  const notes = [];

  for (const level of ["child", "beginner", "expert"]) {
    const explanation = String(lesson?.levelExplanations?.[level] || "");
    if (explanation.length < levelMinimums[level]) {
      notes.push(`- ${level} explanation is too short or not fully teaching the topic.`);
    }
    const stages = lesson?.levelStages?.[level] || [];
    if (stages.length !== 5) {
      notes.push(`- ${level} is missing a complete five-stage lesson deck.`);
      continue;
    }
    stages.forEach((stage) => {
      if (String(stage?.body || "").length < 90) {
        notes.push(`- ${level} ${stage.title} stage is still too shallow.`);
      }
    });
  }

  if (!notes.length) {
    notes.push("- Strengthen specificity further and make the explanations feel more learner-aware.");
  }

  return notes.join("\n");
}

function normalizeStages(stages, subject, defaults = null) {
  const fallbackDeck = defaults || [
    { id: "foundation", title: "Foundation", body: `${subject} starts making sense once we define what it is and why it matters.` },
    { id: "core", title: "Core Idea", body: `The core idea of ${subject} becomes clearer when you focus on the main purpose and parts.` },
    { id: "how", title: "How It Works", body: `Walk through ${subject} step by step, from beginning to outcome.` },
    { id: "example", title: "Real-World Example", body: `Anchor ${subject} to one practical scenario so the process feels real.` },
    { id: "summary", title: "Summary", body: `Remember ${subject} as purpose, process, and example.` },
  ];

  if (!Array.isArray(stages) || stages.length < fallbackDeck.length) {
    return fallbackDeck;
  }

  return fallbackDeck.map((fallback, index) => ({
    id: fallback.id,
    title: fallback.title,
    body: String(stages[index]?.body || fallback.body).trim(),
  }));
}

function ensureTextArray(value, count, fallback) {
  const items = Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
  while (items.length < count) {
    items.push(fallback);
  }
  return items.slice(0, count);
}
function normalizeFlashcards(flashcards, subject, count = 5) {
  const items = Array.isArray(flashcards)
    ? flashcards
        .filter((item) => item && typeof item.front === "string" && typeof item.back === "string")
        .map((item) => ({ front: item.front.trim(), back: item.back.trim() }))
        .filter((item) => item.front && item.back)
    : [];

  const fallback = [
    { front: `What is ${subject}?`, back: `${subject} becomes easier when you first define its purpose and the problem it solves.` },
    { front: `Why does ${subject} matter?`, back: `${subject} matters because understanding it helps you predict how a system or idea behaves.` },
    { front: `What is the core mechanism of ${subject}?`, back: `Track what goes in, what changes in the middle, and what comes out at the end.` },
    { front: `How do you explain ${subject} clearly?`, back: `Use one analogy, one step-by-step process, and one practical example.` },
    { front: `How should you revise ${subject}?`, back: `Remember it as purpose -> parts -> process -> real-world result.` },
  ];

  while (items.length < count) {
    const base = fallback[items.length % fallback.length];
    items.push({
      front: `${base.front.replace(/\?$/, "")} ${items.length + 1}?`,
      back: base.back,
    });
  }

  return (items.length ? items : fallback).slice(0, count);
}

function normalizeQuizQuestions(quizQuestions, subject, count = 4) {
  const items = Array.isArray(quizQuestions)
    ? quizQuestions
        .filter((item) => item && typeof item.prompt === "string" && Array.isArray(item.options))
        .map((item, index) => ({
          id: item.id || `q${index + 1}`,
          prompt: item.prompt.trim(),
          options: item.options.slice(0, 4).map((option) => String(option).trim()),
          correctAnswer: Number.isInteger(item.correctAnswer) ? item.correctAnswer : 0,
          hint: typeof item.hint === "string" && item.hint.trim()
            ? item.hint.trim()
            : `Revisit the purpose and mechanism of ${subject} before retrying this question.`,
        }))
        .filter((item) => item.prompt && item.options.length === 4)
    : [];

  const fallback = [
    {
      id: "q1",
      prompt: `Which answer best captures the main purpose of ${subject}?`,
      options: [
        `It explains the job and outcome of ${subject}.`,
        "It only introduces hard words.",
        "It removes the need for examples.",
        "It avoids describing the process.",
      ],
      correctAnswer: 0,
      hint: `Restart with the purpose of ${subject} before worrying about advanced details.`,
    },
    {
      id: "q2",
      prompt: `What should a strong explanation of ${subject} include?`,
      options: [
        "Only the final answer",
        "Purpose, mechanism, and example",
        "Only history",
        "Only formulas",
      ],
      correctAnswer: 1,
      hint: `Use Eggzy's teaching chain: purpose -> mechanism -> real-life example.`,
    },
    {
      id: "q3",
      prompt: `When a learner hesitates on ${subject}, what should Eggzy do?`,
      options: [
        "Skip the topic",
        "Reteach the confusing part more clearly",
        "Hide the explanation",
        "Remove the quiz",
      ],
      correctAnswer: 1,
      hint: `Hesitation is a signal to slow down and reteach, not to move on.`,
    },
    {
      id: "q4",
      prompt: `Which revision move helps lock in ${subject}?`,
      options: [
        "Memorize one sentence only",
        "Use flashcards and teach it back",
        "Ignore examples",
        "Avoid reviewing weak spots",
      ],
      correctAnswer: 1,
      hint: `Revision gets stronger when recall practice and teach-back work together.`,
    },
  ];

  while (items.length < count) {
    const index = items.length + 1;
    items.push({
      id: `q${index}`,
      prompt: `Which statement helps explain ${subject} most clearly? (${index})`,
      options: [
        `It connects purpose, process, and outcome in ${subject}.`,
        `It hides the mechanism behind jargon.`,
        `It skips examples and applications.`,
        `It avoids describing how the idea works.`,
      ],
      correctAnswer: 0,
      hint: `Return to the explanation and focus on purpose, mechanism, and example before retrying.`
    });
  }

  return (items.length ? items : fallback).slice(0, count);
}

function buildAdaptiveLesson(topic, learner) {
  const tone = getMoodTone(learner.mood);
  const styleLens = getStyleLens(learner.preferredStyle);
  const levelGuide = getLevelGuide(learner.learnerLevel);

  return {
    topic: {
      slug: topic.slug,
      title: topic.title,
      category: topic.category,
      shortSummary: topic.shortSummary,
      foundation: topic.foundation,
      coreIdea: topic.coreIdea,
      howItWorks: topic.howItWorks,
      realWorldExample: topic.realWorldExample,
      summary: topic.summary,
    },
    learnerSnapshot: {
      level: learner.learnerLevel,
      mood: learner.mood,
      preferredStyle: learner.preferredStyle,
      interest: learner.interest,
      language: learner.language,
      confusionPattern: learner.confusionPattern,
      previousBehavior: learner.previousBehavior,
    },
    stages: [
      { id: "foundation", title: "Foundation", body: `${levelGuide.foundationLead} ${topic.foundation}` },
      {
        id: "core",
        title: "Core Idea",
        body: `${styleLens.coreFraming} ${topic.coreIdea}`,
      },
      { id: "how", title: "How It Works", body: `${levelGuide.processHint} ${topic.howItWorks}` },
      { id: "example", title: "Real-World Example", body: `${styleLens.exampleLead} ${topic.realWorldExample}` },
      { id: "summary", title: "Summary", body: `${tone.memoryCue} ${topic.summary}` },
    ],
    learningModes: {
      analogy: `${styleLens.beginnerLead} ${topic.childAnalogy || topic.beginnerAnalogy}`,
      stepByStep: `${levelGuide.processHint} ${topic.howItWorks}`,
      realLife: `${styleLens.exampleLead} ${topic.realWorldExample}`,
    },
    levelExplanations: {
      child: `${tone.encouragement} ${topic.title} is easiest to picture this way: ${topic.childAnalogy} ${topic.foundation} ${topic.realWorldExample} Tie that example to ${learner.interest || "everyday life"}.`,
      beginner: `${styleLens.beginnerLead} ${topic.coreIdea} ${topic.beginnerAnalogy} ${topic.howItWorks}`,
      expert: `${levelGuide.expertLead} ${topic.coreIdea} ${topic.expertNuance} ${topic.howItWorks}`,
    },
    adaptiveTips: [
      tone.studyTip,
      styleLens.studyAdvice,
      learner.confusionPattern
        ? `Watch for this confusion pattern: ${learner.confusionPattern}. We should slow down at that point.`
        : "Pause after each stage and ask: what changed from the previous stage?",
    ],
    confusionHotspots: topic.commonConfusions,
    checkInQuestions: [
      `In one sentence, what is the main job of ${topic.title}?`,
      "Which part still feels unclear: the idea, the process, or the example?",
      topic.reversePrompt,
    ],
  };
}

function buildCustomLesson(customTopic, learner) {
  const subject = customTopic || "this topic";
  const tone = getMoodTone(learner.mood);
  const styleLens = getStyleLens(learner.preferredStyle);
  const levelGuide = getLevelGuide(learner.learnerLevel);
  const domain = inferTopicDomain(subject);

  return {
    topic: {
      slug: null,
      title: subject,
      category: domain.label,
      shortSummary: `${subject} is a ${domain.summaryLabel} that should be learned through its origin, core purpose, mechanism, and real-world use.`,
      foundation: `${subject} belongs to the ${domain.label.toLowerCase()} space. Start by defining what ${subject} is, what problem it was created to solve, and the basic vocabulary a learner must know before going deeper.`,
      coreIdea: `The core idea of ${subject} is to ${domain.corePurpose}. A strong explanation should identify its main components, how those components connect, and why that structure matters.`,
      howItWorks: `Explain ${subject} from the inside out: begin with its fundamental units, then walk through the process or flow that makes it work, then describe what changes from start to finish when the system is active.`,
      realWorldExample: `Place ${subject} inside a realistic ${domain.exampleContext} scenario. Show where a learner would actually encounter it, what inputs they would notice, what outcome they would observe, and why that example captures the concept accurately.`,
      summary: `${subject} is easiest to retain when you remember four anchors: where it came from, what purpose it serves, how its mechanism works, and where it appears in real life.`,
    },
    learnerSnapshot: {
      level: learner.learnerLevel,
      mood: learner.mood,
      preferredStyle: learner.preferredStyle,
      interest: learner.interest,
      language: learner.language,
      confusionPattern: learner.confusionPattern,
      previousBehavior: learner.previousBehavior,
    },
    stages: [
      { id: "foundation", title: "Foundation", body: `${levelGuide.foundationLead} ${subject} matters because it solves a specific problem.` },
      { id: "core", title: "Core Idea", body: `${styleLens.coreFraming} First define the goal, then define the parts, then define how the parts interact.` },
      { id: "how", title: "How It Works", body: `${levelGuide.processHint} Move through it in sequence: input, transformation, output.` },
      { id: "example", title: "Real-World Example", body: `${styleLens.exampleLead} Imagine a student using ${subject} to complete a task faster or understand something better.` },
      { id: "summary", title: "Summary", body: `${tone.memoryCue} Learn the purpose, walk through the steps, then test it with an example.` },
    ],
    learningModes: {
      analogy: `${styleLens.beginnerLead} Think of ${subject} through one simple mental picture.`,
      stepByStep: `${levelGuide.processHint} Move through ${subject} as input, transformation, and output.`,
      realLife: `${styleLens.exampleLead} Put ${subject} into a practical situation connected to ${learner.interest || "daily life"}.`,
    },
    levelExplanations: {
      child: `${tone.encouragement} Think of ${subject} like a tool with a special job. First we learn what job it does, then we see the steps, then we try an example linked to ${learner.interest || "everyday life"}.`,
      beginner: `${styleLens.beginnerLead} To understand ${subject}, start with the problem it solves, then map the process from start to finish, and finally test it with one real situation.`,
      expert: `${levelGuide.expertLead} A robust explanation of ${subject} should identify system boundaries, mechanisms, dependencies, and failure modes.`,
    },
    adaptiveTips: [
      tone.studyTip,
      styleLens.studyAdvice,
      "Use the reverse-teach box to explain it back in your own words.",
    ],
    confusionHotspots: [
      "Defining the scope too vaguely",
      "Skipping the process and jumping to the result",
      "Not testing understanding with an example",
    ],
    checkInQuestions: [
      `What problem does ${subject} solve?`,
      `What are the main steps inside ${subject}?`,
      `Teach ${subject} back as if you were helping a classmate.`,
    ],
  };
}

function inferTopicDomain(subject) {
  const lower = String(subject || "").toLowerCase();
  if (/(processor|cpu|microcontroller|computer|algorithm|network|database|blockchain|encryption|software|programming)/.test(lower)) {
    return {
      label: "Technology",
      summaryLabel: "technology concept",
      corePurpose: "process information, coordinate logic, or manage digital systems in a structured way",
      exampleContext: "device, app, or computing",
    };
  }
  if (/(strategy|economics|market|policy|trade|finance|business|fabian)/.test(lower)) {
    return {
      label: "Social Science",
      summaryLabel: "social-science idea",
      corePurpose: "shape decisions, systems, or collective behavior over time",
      exampleContext: "society, organization, or policy",
    };
  }
  if (/(cell|atom|photosynthesis|gravity|quantum|reaction|ecosystem|biology|chemistry|physics)/.test(lower)) {
    return {
      label: "Science",
      summaryLabel: "scientific concept",
      corePurpose: "explain a natural process, relationship, or law of the physical world",
      exampleContext: "laboratory, nature, or everyday observation",
    };
  }
  return {
    label: "General Concept",
    summaryLabel: "general concept",
    corePurpose: "explain an idea clearly enough that a learner can recognize it, describe it, and apply it",
    exampleContext: "real-world",
  };
}
function getMoodTone(mood) {
  const tones = {
    focused: {
      encouragement: "You are in a strong place to go deeper.",
      memoryCue: "Memory cue:",
      studyTip: "Stay with the exact mechanism instead of only the final answer.",
    },
    overwhelmed: {
      encouragement: "We will keep this gentle and one step at a time.",
      memoryCue: "Small takeaway:",
      studyTip: "Read one stage, pause, and paraphrase it before moving on.",
    },
    curious: {
      encouragement: "Let curiosity lead and connect each idea to a question.",
      memoryCue: "Interesting takeaway:",
      studyTip: "Ask what would happen if one part of the process changed.",
    },
    tired: {
      encouragement: "We will keep the explanation compact and low-friction.",
      memoryCue: "Quick takeaway:",
      studyTip: "Focus on the foundation and summary first, then revisit details.",
    },
  };

  return tones[mood] || tones.focused;
}

function getStyleLens(style) {
  const styles = {
    analogy: {
      coreFraming: "Here is the big idea through a mental picture.",
      exampleLead: "Picture it like this in daily life.",
      beginnerLead: "Using an analogy-first explanation:",
      studyAdvice: "If you get stuck, map each analogy part to the real concept.",
    },
    story: {
      coreFraming: "Think of the concept as a sequence with characters and roles.",
      exampleLead: "Now place it inside a short story-like situation.",
      beginnerLead: "Using a story-driven explanation:",
      studyAdvice: "Retell the process as a short story with cause and effect.",
    },
    technical: {
      coreFraming: "We will define the system precisely before simplifying it.",
      exampleLead: "Now anchor the abstraction in a practical use case.",
      beginnerLead: "Using a structure-first explanation:",
      studyAdvice: "List the components, then note what each one does.",
    },
    simple: {
      coreFraming: "Strip away extra detail and keep only the essential idea.",
      exampleLead: "Use one practical example to lock it in.",
      beginnerLead: "Using the simplest clear explanation:",
      studyAdvice: "Turn each stage into one short sentence in your own words.",
    },
  };

  return styles[style] || styles.analogy;
}

function getLevelGuide(level) {
  const levels = {
    child: {
      foundationLead: "Start from zero and use familiar words.",
      processHint: "Walk through the steps slowly and visibly.",
      expertLead: "Even at a high-detail level, keep the explanation intuitive first.",
    },
    beginner: {
      foundationLead: "Assume no background and define the basic pieces first.",
      processHint: "Follow the process in a clean step-by-step order.",
      expertLead: "Add precision while still connecting each detail to the learner's mental model.",
    },
    expert: {
      foundationLead: "Use the foundation to align terminology before adding nuance.",
      processHint: "Focus on the internal mechanism, dependencies, and edge cases.",
      expertLead: "Here is the deeper technical framing.",
    },
  };

  return levels[level] || levels.beginner;
}

function scoreExplanation(learnerText, referenceText) {
  const learnerTokens = tokenize(learnerText);
  const referenceTokens = new Set(tokenize(referenceText));
  if (!learnerTokens.length) {
    return 0;
  }

  let matches = 0;
  for (const token of learnerTokens) {
    if (referenceTokens.has(token)) {
      matches += 1;
    }
  }

  return Number((matches / learnerTokens.length).toFixed(2));
}

function buildCoachingResponse({ understood, learnerExplanation, confusionArea, overlapScore, lesson }) {
  if (understood && overlapScore >= 0.35) {
    return `Nice work. Your explanation captures key ideas from ${lesson.topic.title}. Next, try comparing the foundation stage to the How It Works stage and notice how the mechanism adds detail.`;
  }

  if (!learnerExplanation.trim()) {
    return `Let's retry with one small step. Start by answering only this: ${lesson.checkInQuestions[0]}`;
  }

  if (confusionArea.trim()) {
    return `The confusion seems centered on "${confusionArea}". Re-read the "${findRelevantStage(confusionArea, lesson)}" stage first, then explain it again using only two sentences.`;
  }

  return `You are close, but the explanation is still missing some anchor ideas. Focus on this memory-friendly line: ${lesson.topic.summary}`;
}

function findRelevantStage(confusionArea, lesson) {
  const lower = confusionArea.toLowerCase();
  const stage = lesson.stages.find((item) => item.body.toLowerCase().includes(lower) || item.title.toLowerCase().includes(lower));
  return stage ? stage.title : "Core Idea";
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}












async function translateUiCopy(languageMeta) {
  if (groqApiKey) {
    return await translateJsonWithGroq(DEFAULT_UI_COPY, languageMeta.name);
  }

  if (geminiApiKey) {
    return await translateJsonWithGemini(DEFAULT_UI_COPY, languageMeta.name);
  }

  return DEFAULT_UI_COPY;
}

async function translateJsonWithGroq(payload, targetLanguage) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({
      model: groqModel,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You translate JSON UI copy. Preserve every key exactly. Return valid JSON only.",
        },
        {
          role: "user",
          content: `Translate every string value in this JSON object into ${targetLanguage}. Keep the brand name Eggzy unchanged. Preserve keys, nesting, and tone for an educational product. JSON: ${JSON.stringify(payload)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq UI copy error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Groq returned no UI copy content.");
  }

  return mergeUiCopy(JSON.parse(text));
}

async function translateJsonWithGemini(payload, targetLanguage) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Translate every string value in this JSON object into ${targetLanguage}. Keep the brand name Eggzy unchanged. Preserve keys, nesting, and tone. Return valid JSON only. JSON: ${JSON.stringify(payload)}` }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini UI copy error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) {
    throw new Error("Gemini returned no UI copy content.");
  }

  return mergeUiCopy(JSON.parse(text));
}

function mergeUiCopy(copy) {
  return {
    ...DEFAULT_UI_COPY,
    ...copy,
    moods: {
      ...DEFAULT_UI_COPY.moods,
      ...(copy?.moods || {}),
    },
    styles: {
      ...DEFAULT_UI_COPY.styles,
      ...(copy?.styles || {}),
    },
  };
}





function buildAuthUser(decodedToken) {
  if (!decodedToken) {
    return null;
  }

  return {
    uid: decodedToken.uid,
    email: decodedToken.email || null,
    name: decodedToken.name || decodedToken.email || null,
  };
}



