# Eggzy

**Hatch your understanding**

Eggzy is an adaptive AI teacher that helps learners actually understand a concept instead of just receiving an answer. It changes how it teaches based on the learner's level, mood, language, interests, hesitation patterns, quiz mistakes, and teach-back gaps.

Unlike a standard chatbot, Eggzy is built as a guided learning flow:

- learn a topic in depth
- revise with flashcards and MCQs
- explain it back in your own words
- get reteaching based on what you missed

## Problem

Most AI tools answer questions well, but they do not reliably build understanding.

Learners still struggle because:

- explanations are too generic
- answers are not adapted to level
- confusion is not tracked
- weak areas are not remembered
- there is no real loop for revision and reteaching

Eggzy solves that by acting like an AI teacher, not just an AI assistant.

## What Eggzy Does

- generates layered explanations for a chosen topic
- supports `Elementary`, `Intermediate`, and `Advanced` understanding levels
- adapts tone using learner mood and context
- uses interest hooks in child-friendly explanations
- supports multiple languages
- gives flashcards for revision
- gives MCQ quizzes with refreshable question sets
- tracks hesitation on quiz questions
- asks the learner to teach the concept back in paragraph form
- analyzes missed concepts and weak spots
- reteaches using a different approach
- saves progress, weak topics, hesitation notes, and history per user

## Why It Is Different

- ChatGPT answers questions. Eggzy teaches until the learner understands.
- ChatGPT waits for the next prompt. Eggzy reacts to confusion, weak spots, and hesitation.
- ChatGPT does not naturally build a learner memory. Eggzy stores learning history and uses it in future explanations.
- ChatGPT gives one answer. Eggzy gives explanation, revision, quiz, and teach-back loops.

## Product Flow

1. Learner logs in
2. Learner chooses level, mood, language, and topic
3. Eggzy generates a long-form explanation
4. Learner moves to revision
5. Learner chooses quiz or flashcards
6. Eggzy tracks hesitation and mistakes
7. Learner teaches the topic back in a paragraph
8. Eggzy identifies missed ideas and suggests reteaching
9. Future lessons use this stored learner history

## Key Features

### Adaptive Explanations

- long-form topic teaching instead of short summaries
- level-specific explanation decks
- explanation variants for different learner depth
- AI prompt tuned to use learner profile and history

### Revision Engine

- flashcards with refresh support
- MCQ quizzes with configurable counts
- fresh quiz generation on retry
- refreshable flashcard sets
- direct path from revision to teach-back

### Teach-Back Analysis

- learner writes a paragraph in their own words
- Eggzy identifies:
  - strong points
  - missed concepts
  - reteach steps
  - question bank
- weak spots are saved for future explanations

### Learner Memory

- weak topics stored per user
- hesitation notes stored per user
- quiz mistakes stored per user
- teach-back misses stored per user
- history page for previous learning sessions
- dashboard for struggle patterns

### Classroom UI

- chalkboard-inspired dark theme
- Eggzy favicon and branding
- dashboard/history modals
- focused learning flow with fewer distractions

## Tech Stack

### Frontend

- React
- JSX
- Vite
- CSS-in-JS styling inside the React app

### Backend

- Node.js
- Express
- CORS
- dotenv

### AI Providers

- Groq
- Gemini

### Data and Auth

- SQLite with Node's built-in `node:sqlite`
- Supabase Auth
- Supabase Postgres for learner history and tracking

### Deployment

- Vercel for frontend
- Railway for backend

## Current Architecture

### Frontend

- [src/App.jsx](/C:/Xplain/src/App.jsx) - main product experience
- [src/main.jsx](/C:/Xplain/src/main.jsx) - app entry
- [src/supabase.js](/C:/Xplain/src/supabase.js) - Supabase auth client
- [src/topicLibrary.js](/C:/Xplain/src/topicLibrary.js) - local topic fallback library

### Backend

- [server/index.js](/C:/Xplain/server/index.js) - API routes, AI generation, feedback logic
- [server/db.js](/C:/Xplain/server/db.js) - SQLite helpers
- [server/auth.js](/C:/Xplain/server/auth.js) - auth helpers
- [server/supabaseDb.js](/C:/Xplain/server/supabaseDb.js) - learner history and dashboard storage

### Shared

- [shared/localization.js](/C:/Xplain/shared/localization.js) - UI copy and language data
- [supabase/schema.sql](/C:/Xplain/supabase/schema.sql) - Supabase schema starter

## Deployed Setup

- Frontend: [eggzy.vercel.app](https://eggzy.vercel.app)
- Backend: [eggzy-production.up.railway.app](https://eggzy-production.up.railway.app)

## Environment Variables

### Frontend

```env
VITE_API_BASE_URL=https://eggzy-production.up.railway.app
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Backend

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama-3.3-70b-versatile

GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.0-flash
```

Use only one AI provider at a time if you want predictable routing.

## Run Locally

1. Install Node.js 18+
2. Copy `.env.example` to `.env`
3. Fill in the required keys
4. Install dependencies
5. Start the app

```powershell
npm.cmd install
npm.cmd run dev
```

## Supabase Setup

1. Open the Supabase project
2. Run [supabase/schema.sql](/C:/Xplain/supabase/schema.sql) in SQL Editor
3. Enable `Email` in Authentication providers
4. Add redirect URLs for local and deployed frontend
5. Add the frontend and backend env vars

## What Has Been Built So Far

- full backend for explanation generation
- predefined topic library and custom topic support
- adaptive explanation flow
- revision flow with quiz and flashcards
- teach-back loop
- AI-backed feedback analysis
- hesitation tracking
- user auth
- dashboard and history
- Supabase learner memory
- production deployment setup

## One-Line Pitch

Eggzy is an AI teacher that learns how the learner learns, then reteaches until understanding is real.
