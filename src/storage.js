import { normalizeQuiz, nowIso } from './quizLogic.js';

const LIBRARY_KEY = 'kahn_quiz_library_v2';
const ACTIVE_SESSION_KEY = 'kahn_quiz_active_session_v2';
const EDITOR_DRAFT_KEY = 'kahn_quiz_editor_draft_v2';

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export function loadLibrary() {
  const data = safeParse(localStorage.getItem(LIBRARY_KEY), []);
  if (!Array.isArray(data)) return [];
  return data.map((item) => normalizeQuiz(item, item?.title || 'Saved Quiz'));
}

export function saveLibrary(quizzes) {
  return writeJson(LIBRARY_KEY, quizzes);
}

export function upsertQuiz(quiz) {
  const library = loadLibrary();
  const nextQuiz = { ...normalizeQuiz(quiz, quiz.title), updatedAt: nowIso() };
  const index = library.findIndex((item) => item.id === nextQuiz.id);
  if (index >= 0) library[index] = nextQuiz;
  else library.unshift(nextQuiz);
  const result = saveLibrary(library);
  return { ...result, quiz: nextQuiz, library };
}

export function deleteQuiz(quizId) {
  const next = loadLibrary().filter((quiz) => quiz.id !== quizId);
  return { ...saveLibrary(next), library: next };
}

export function saveEditorDraft(quiz) {
  return writeJson(EDITOR_DRAFT_KEY, quiz);
}

export function loadEditorDraft() {
  const draft = safeParse(localStorage.getItem(EDITOR_DRAFT_KEY), null);
  return draft ? normalizeQuiz(draft, draft.title || 'Draft Quiz') : null;
}

export function clearEditorDraft() {
  localStorage.removeItem(EDITOR_DRAFT_KEY);
}

export function saveActiveSession(session) {
  return writeJson(ACTIVE_SESSION_KEY, session);
}

export function loadActiveSession() {
  return safeParse(localStorage.getItem(ACTIVE_SESSION_KEY), null);
}

export function clearActiveSession() {
  localStorage.removeItem(ACTIVE_SESSION_KEY);
}

export function storageSizeLabel() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    total += key.length + (localStorage.getItem(key)?.length || 0);
  }
  if (total > 1024 * 1024) return `${(total / 1024 / 1024).toFixed(2)} MB`;
  return `${(total / 1024).toFixed(1)} KB`;
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
