import { getSupabaseAdmin } from "./auth.js";

function getClient() {
  return getSupabaseAdmin();
}

function normalizeTimestamp(value) {
  return value || new Date().toISOString();
}

async function safeUpsertProfile(client, payload) {
  if (!client || !payload.user?.uid) {
    return;
  }

  const profile = {
    id: payload.user.uid,
    email: payload.user.email || null,
    display_name: payload.user.name || payload.learnerName || null,
    preferred_language: payload.language || null,
    preferred_level: payload.learnerLevel || null,
    preferred_style: payload.preferredStyle || null,
    interest_hook: payload.interest || null,
    current_mood: payload.mood || null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await client.from("profiles").upsert(profile, { onConflict: "id" });
  if (error) {
    console.error("Supabase profile upsert failed:", error.message);
  }
}

export async function saveLessonSession(payload) {
  const client = getClient();
  if (!client || !payload.user?.uid) {
    return null;
  }

  await safeUpsertProfile(client, payload);

  const row = {
    user_id: payload.user.uid,
    topic: payload.topic || null,
    topic_slug: payload.topicSlug || null,
    custom_topic: payload.customTopic || null,
    learner_level: payload.learnerLevel || null,
    mood: payload.mood || null,
    preferred_style: payload.preferredStyle || null,
    language: payload.language || "English",
    interest_hook: payload.interest || null,
    generation_mode: payload.generationMode || "lesson",
    lesson_payload: payload.lessonPayload || null,
    lesson_summary: payload.lessonSummary || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client.from("lesson_sessions").insert(row).select("id").single();
  if (error) {
    console.error("Supabase lesson session insert failed:", error.message);
    return null;
  }

  return data?.id || null;
}

export async function recordLearningEvent(payload) {
  const client = getClient();
  if (!client || !payload.user?.uid) {
    return null;
  }

  await safeUpsertProfile(client, payload);

  const row = {
    user_id: payload.user.uid,
    user_email: payload.user.email || null,
    learner_name: payload.learnerName || null,
    event_type: payload.eventType,
    topic: payload.topic || null,
    topic_slug: payload.topicSlug || null,
    generation_mode: payload.generationMode || "lesson",
    lesson_phase: payload.lessonPhase || null,
    lesson_session_id: payload.lessonSessionId || null,
    learner_level: payload.learnerLevel || null,
    mood: payload.mood || null,
    preferred_style: payload.preferredStyle || null,
    interest_hook: payload.interest || null,
    language: payload.language || "English",
    slow_questions: payload.slowQuestions || [],
    wrong_questions: payload.wrongQuestions || [],
    missed_concepts: payload.missedConcepts || [],
    confusion_area: payload.confusionArea || null,
    overlap_score: payload.overlapScore ?? null,
    quiz_score: payload.quizScore ?? null,
    total_questions: payload.totalQuestions ?? null,
    learner_explanation: payload.learnerExplanation || null,
    feedback_action: payload.feedbackAction || null,
    notes: payload.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client.from("learning_events").insert(row).select("id").single();
  if (error) {
    console.error("Supabase learning event insert failed:", error.message);
    return null;
  }

  return data || null;
}

function buildWeakTopics(events = []) {
  const weakTopicMap = new Map();
  for (const event of events) {
    if (!event.topic) continue;
    const current = weakTopicMap.get(event.topic) || { topic: event.topic, slowCount: 0, wrongCount: 0, teachBackMisses: 0 };
    current.slowCount += event.slow_questions?.length || 0;
    current.wrongCount += event.wrong_questions?.length || 0;
    current.teachBackMisses += event.missed_concepts?.length || 0;
    weakTopicMap.set(event.topic, current);
  }

  return [...weakTopicMap.values()].sort((a, b) => (b.slowCount + b.wrongCount + b.teachBackMisses) - (a.slowCount + a.wrongCount + a.teachBackMisses));
}

export async function getUserDashboard(uid) {
  const client = getClient();
  if (!client || !uid) {
    return null;
  }

  const [{ data: profile }, { data: events }] = await Promise.all([
    client.from("profiles").select("*").eq("id", uid).maybeSingle(),
    client.from("learning_events").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(20),
  ]);

  const recentEvents = events || [];

  return {
    profile: profile ? {
      displayName: profile.display_name || null,
      email: profile.email || null,
      struggledTopics: profile.struggled_topics || [],
      slowQuestionPrompts: profile.slow_question_prompts || [],
      wrongQuestionPrompts: profile.wrong_question_prompts || [],
      teachBackHighlights: profile.teach_back_highlights || [],
      lastTopic: profile.last_topic || null,
    } : null,
    weakTopics: buildWeakTopics(recentEvents),
    recentEvents,
  };
}

export async function getUserHistory(uid) {
  const client = getClient();
  if (!client || !uid) {
    return [];
  }

  const [{ data: sessions }, { data: events }] = await Promise.all([
    client.from("lesson_sessions").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(20),
    client.from("learning_events").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(100),
  ]);

  const sessionEvents = events || [];
  return (sessions || []).map((session) => {
    const payload = session.lesson_payload || {};
    const relatedEvents = sessionEvents.filter((event) => event.lesson_session_id === session.id || event.topic === session.topic);
    const bestQuizScore = relatedEvents.reduce((best, event) => {
      if (event.quiz_score == null || event.total_questions == null) return best;
      const percent = event.total_questions ? event.quiz_score / event.total_questions : 0;
      return percent > best.percent ? { score: event.quiz_score, total: event.total_questions, percent } : best;
    }, { score: null, total: null, percent: -1 });

    return {
      id: session.id,
      topic: session.topic,
      topicSlug: session.topic_slug,
      createdAt: normalizeTimestamp(session.created_at),
      learnerLevel: session.learner_level,
      language: session.language,
      mood: session.mood,
      preferredStyle: session.preferred_style,
      lessonSummary: session.lesson_summary || payload?.topic?.shortSummary || null,
      flashcards: Array.isArray(payload?.flashcards) ? payload.flashcards.slice(0, 8) : [],
      quizQuestions: Array.isArray(payload?.quizQuestions) ? payload.quizQuestions.slice(0, 8) : [],
      bestQuizScore: bestQuizScore.score,
      bestQuizTotal: bestQuizScore.total,
      teachBackNotes: relatedEvents
        .filter((event) => event.event_type === "teachback_submitted" && event.learner_explanation)
        .slice(0, 2)
        .map((event) => ({ explanation: event.learner_explanation, confusionArea: event.confusion_area || null, overlapScore: event.overlap_score ?? null })),
    };
  });
}

export async function getUserLearningContext(uid) {
  const client = getClient();
  if (!client || !uid) {
    return null;
  }

  const { data: events } = await client.from("learning_events").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(40);
  const recentEvents = events || [];
  const weakTopics = buildWeakTopics(recentEvents).slice(0, 5);

  return {
    weakTopics,
    recentTopics: [...new Set(recentEvents.map((event) => event.topic).filter(Boolean))].slice(0, 8),
    repeatedWrongQuestions: recentEvents.flatMap((event) => event.wrong_questions || []).slice(0, 8),
    repeatedSlowQuestions: recentEvents.flatMap((event) => event.slow_questions || []).slice(0, 8),
    missedConcepts: recentEvents.flatMap((event) => event.missed_concepts || []).slice(0, 8),
    lastConfusionArea: recentEvents.find((event) => event.confusion_area)?.confusion_area || null,
  };
}

