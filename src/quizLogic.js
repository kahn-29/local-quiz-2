export const QUIZ_SCHEMA_VERSION = 2;

export function makeId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function newOption(text = '') {
  return { id: makeId('opt'), text };
}

export function newQuestion(type = 'single') {
  const first = newOption('');
  const second = newOption('');
  return {
    id: makeId('q'),
    content: '',
    type,
    options: type === 'text' ? [] : [first, second],
    correctOptionIds: type === 'single' ? [first.id] : [],
    correctText: '',
    imageDataUrl: '',
    explanation: '',
  };
}

export function newBlankQuiz() {
  return {
    version: QUIZ_SCHEMA_VERSION,
    id: makeId('quiz'),
    title: 'Untitled Quiz',
    description: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    questions: [newQuestion('single')],
  };
}

function legacyTypeToModern(type) {
  switch (type) {
    case 'mcq':
    case 'multiple-choice':
    case 'single':
      return 'single';
    case 'mcq-multi':
    case 'multiple-choice-multi':
    case 'multi':
      return 'multi';
    case 'text-input':
    case 'text':
      return 'text';
    default:
      return 'single';
  }
}

function normalizeAnswerText(value) {
  return String(value ?? '').trim();
}

function normalizeQuestion(raw, index = 0) {
  const type = legacyTypeToModern(
    raw.type || raw['question-type'] || raw.questionType
  );
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options =
    type === 'text'
      ? []
      : rawOptions
          .map((opt) => {
            if (opt && typeof opt === 'object') {
              return {
                id: opt.id || makeId('opt'),
                text: normalizeAnswerText(opt.text ?? opt.label ?? opt.value),
              };
            }
            return { id: makeId('opt'), text: normalizeAnswerText(opt) };
          })
          .filter((opt) => opt.text.length > 0);

  let correctOptionIds = [];
  let correctText = '';

  if (type === 'text') {
    correctText = normalizeAnswerText(
      raw.correctText ?? raw.answer ?? raw.correctAnswer ?? ''
    );
  } else if (raw.correctOptionIds && Array.isArray(raw.correctOptionIds)) {
    const valid = new Set(options.map((opt) => opt.id));
    correctOptionIds = raw.correctOptionIds.filter((id) => valid.has(id));
  } else {
    const rawAnswer =
      raw.answer ?? raw.correctAnswer ?? (type === 'multi' ? [] : '');
    const answerTexts = Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer];
    correctOptionIds = answerTexts
      .map(
        (answer) =>
          options.find((opt) => opt.text === normalizeAnswerText(answer))?.id
      )
      .filter(Boolean);
  }

  if (type === 'single') {
    if (options.length === 0)
      options.push(newOption('Option 1'), newOption('Option 2'));
    if (correctOptionIds.length === 0) correctOptionIds = [options[0].id];
    correctOptionIds = [correctOptionIds[0]];
  }

  if (type === 'multi' && options.length === 0) {
    options.push(newOption('Option 1'), newOption('Option 2'));
  }

  return {
    id: raw.id || makeId(`q${index + 1}`),
    content: String(raw.content ?? raw.question ?? raw.prompt ?? ''),
    type,
    options,
    correctOptionIds,
    correctText,
    imageDataUrl: raw.imageDataUrl || raw.image || '',
    explanation: String(raw.explanation ?? ''),
  };
}

export function normalizeQuiz(input, fallbackTitle = 'Imported Quiz') {
  const raw = Array.isArray(input)
    ? { questions: input, title: fallbackTitle }
    : input;
  if (!raw || !Array.isArray(raw.questions)) {
    throw new Error('The selected file is not a valid quiz JSON file.');
  }

  const questions = raw.questions
    .map(normalizeQuestion)
    .filter((q) => q.content.trim() || q.imageDataUrl || q.options.length);
  if (questions.length === 0) {
    questions.push(newQuestion('single'));
  }

  return {
    version: QUIZ_SCHEMA_VERSION,
    id: raw.id || makeId('quiz'),
    title: String(raw.title || fallbackTitle || 'Imported Quiz'),
    description: String(raw.description || ''),
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
    questions,
  };
}

export function validateQuiz(quiz) {
  const errors = [];
  if (!quiz.title.trim()) errors.push('Quiz title is required.');
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0)
    errors.push('Quiz must contain at least one question.');

  quiz.questions.forEach((q, idx) => {
    const label = `Question ${idx + 1}`;
    if (!q.content.trim() && !q.imageDataUrl)
      errors.push(`${label}: question content or image is required.`);
    if (q.type === 'text') {
      if (!q.correctText.trim())
        errors.push(`${label}: text answer is required.`);
    } else {
      const texts = q.options.map((opt) => opt.text.trim()).filter(Boolean);
      if (texts.length < 2)
        errors.push(`${label}: at least two non-empty options are required.`);
      if (!q.correctOptionIds?.length)
        errors.push(`${label}: choose at least one correct answer.`);
      const validIds = new Set(q.options.map((opt) => opt.id));
      const invalid = q.correctOptionIds?.some((id) => !validIds.has(id));
      if (invalid)
        errors.push(`${label}: a correct answer points to a removed option.`);
      if (q.type === 'single' && q.correctOptionIds.length !== 1)
        errors.push(
          `${label}: single-choice questions need exactly one correct option.`
        );
    }
  });

  return errors;
}

export function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function prepareQuestions(quiz, settings) {
  let questions = quiz.questions.map((q) => ({
    ...q,
    options:
      settings.shuffleAnswers && q.type !== 'text'
        ? shuffleArray(q.options)
        : [...q.options],
  }));
  if (settings.shuffleQuestions) questions = shuffleArray(questions);
  return questions;
}

function normalizeTextForCheck(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function isAnswerCorrect(question, answer) {
  if (question.type === 'single') {
    return answer === question.correctOptionIds[0];
  }
  if (question.type === 'multi') {
    const userIds = Array.isArray(answer) ? answer : [];
    const correctIds = Array.isArray(question.correctOptionIds)
      ? question.correctOptionIds
      : [];
    if (userIds.length !== correctIds.length) return false;
    const userSet = new Set(userIds);
    return correctIds.every((id) => userSet.has(id));
  }
  const allowed = String(question.correctText || '')
    .split(/\s*\|\|\s*/)
    .map(normalizeTextForCheck)
    .filter(Boolean);
  return allowed.includes(normalizeTextForCheck(answer));
}

export function emptyAnswerFor(question) {
  if (question.type === 'multi') return [];
  return '';
}

export function isAnswered(question, answer) {
  if (question.type === 'multi')
    return Array.isArray(answer) && answer.length > 0;
  return String(answer ?? '').trim().length > 0;
}

export function correctAnswerText(question) {
  if (question.type === 'text') return question.correctText;
  const ids = new Set(question.correctOptionIds || []);
  return question.options
    .filter((opt) => ids.has(opt.id))
    .map((opt) => opt.text)
    .join(', ');
}

export function createResultPayload({
  quiz,
  questions,
  answers,
  checks,
  settings,
  startedAt,
}) {
  const rows = questions.map((question) => {
    const answer = answers[question.id] ?? emptyAnswerFor(question);
    const correct = isAnswerCorrect(question, answer);
    return {
      questionId: question.id,
      content: question.content,
      type: question.type,
      userAnswer: humanAnswer(question, answer),
      correctAnswer: correctAnswerText(question),
      correct,
      checkedResult: checks[question.id]?.result ?? null,
      explanation: question.explanation || '',
    };
  });
  const correctCount = rows.filter((r) => r.correct).length;
  return {
    quizId: quiz.id,
    quizTitle: quiz.title,
    startedAt,
    finishedAt: nowIso(),
    settings,
    totalQuestions: rows.length,
    correctAnswers: correctCount,
    score: rows.length ? Math.round((correctCount / rows.length) * 100) : 0,
    rows,
  };
}

export function humanAnswer(question, answer) {
  if (question.type === 'text') return String(answer ?? '');
  if (question.type === 'single')
    return question.options.find((opt) => opt.id === answer)?.text || '';
  const ids = new Set(Array.isArray(answer) ? answer : []);
  return question.options
    .filter((opt) => ids.has(opt.id))
    .map((opt) => opt.text)
    .join(', ');
}
