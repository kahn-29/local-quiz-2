import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { MathText } from './math.jsx';
import {
  correctAnswerText,
  createResultPayload,
  emptyAnswerFor,
  humanAnswer,
  isAnswered,
  isAnswerCorrect,
  makeId,
  newBlankQuiz,
  newOption,
  newQuestion,
  nowIso,
  prepareQuestions,
  validateQuiz,
} from './quizLogic.js';
import {
  clearActiveSession,
  clearEditorDraft,
  deleteQuiz,
  loadEditorDraft,
  loadLibrary,
  requestPersistentStorage,
  saveActiveSession,
  saveEditorDraft,
  storageSizeLabel,
  upsertQuiz,
} from './storage.js';
import {
  downloadJson,
  importQuizFile,
  readFileAsDataUrl,
  safeFileName,
} from './fileUtils.js';

const DEFAULT_SETTINGS = {
  shuffleQuestions: false,
  shuffleAnswers: false,
  allowCheck: true,
  allowRedo: true,
  timeLimitMinutes: '',
};

const FORMULA_SNIPPETS = [
  ['Inline', '$x$'],
  ['Display', '$$x = y$$'],
  ['Fraction', '\\frac{a}{b}'],
  ['Power', 'x^{2}'],
  ['Root', '\\sqrt{x}'],
  ['Sum', '\\sum_{i=1}^{n}'],
  ['Integral', '\\int_{a}^{b}'],
  ['π', '\\pi'],
];

function useToasts() {
  const [toasts, setToasts] = useState([]);
  function push(message, type = 'info') {
    const id = makeId('toast');
    setToasts((items) => [...items, { id, message, type }]);
    setTimeout(
      () => setToasts((items) => items.filter((item) => item.id !== id)),
      3500
    );
  }
  return { toasts, push };
}

function Toasts({ toasts }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function App() {
  const [library, setLibrary] = useState(() => loadLibrary());
  const [view, setView] = useState('home');
  const [editorQuiz, setEditorQuiz] = useState(null);
  const [playerQuiz, setPlayerQuiz] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const { toasts, push } = useToasts();

  useEffect(() => {
    requestPersistentStorage();
    if ('serviceWorker' in navigator) {
      const swUrl = `${import.meta.env.BASE_URL}sw.js`;
      navigator.serviceWorker.register(swUrl).catch(() => {});
    }
  }, []);

  function refreshLibrary(nextLibrary = loadLibrary()) {
    setLibrary(nextLibrary);
  }

  function startNewQuiz() {
    const draft = loadEditorDraft();
    if (draft && confirm('A local draft exists. Continue that draft?')) {
      setEditorQuiz(draft);
    } else {
      clearEditorDraft();
      setEditorQuiz(newBlankQuiz());
    }
    setView('editor');
  }

  function editQuiz(quiz) {
    setEditorQuiz(JSON.parse(JSON.stringify(quiz)));
    setView('editor');
  }

  function preparePlay(quiz) {
    setPlayerQuiz(quiz);
    setSettings(DEFAULT_SETTINGS);
    setView('settings');
  }

  async function importQuiz(event, openAfter = 'editor') {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const quiz = await importQuizFile(file);
      const result = upsertQuiz(quiz);
      if (!result.ok) {
        push(
          'Imported, but localStorage quota was exceeded. You can still download the file after editing.',
          'warn'
        );
      } else {
        refreshLibrary(result.library);
        push('Quiz imported into local library.', 'success');
      }
      if (openAfter === 'play') preparePlay(result.quiz);
      else editQuiz(result.quiz);
    } catch (error) {
      push(error.message || 'Cannot import this quiz file.', 'error');
    }
  }

  return (
    <>
      <Toasts toasts={toasts} />
      {view === 'home' && (
        <Home
          library={library}
          onCreate={startNewQuiz}
          onImport={importQuiz}
          onEdit={editQuiz}
          onPlay={preparePlay}
          onDelete={(quizId) => {
            if (!confirm('Delete this quiz from local storage?')) return;
            const result = deleteQuiz(quizId);
            refreshLibrary(result.library);
            push('Quiz deleted from this browser.', 'success');
          }}
          onDownload={(quiz) => downloadJson(quiz, safeFileName(quiz.title))}
        />
      )}

      {view === 'editor' && editorQuiz && (
        <Editor
          quiz={editorQuiz}
          setQuiz={setEditorQuiz}
          onBack={() => setView('home')}
          onSaved={(quiz, libraryResult) => {
            refreshLibrary(libraryResult.library);
            setEditorQuiz(quiz);
            push('Saved to localStorage.', 'success');
          }}
          onDownload={(quiz) => downloadJson(quiz, safeFileName(quiz.title))}
          onPlay={(quiz) => preparePlay(quiz)}
          notify={push}
        />
      )}

      {view === 'settings' && playerQuiz && (
        <PlaySettings
          quiz={playerQuiz}
          settings={settings}
          setSettings={setSettings}
          onBack={() => setView('home')}
          onEdit={() => editQuiz(playerQuiz)}
          onStart={() => setView('player')}
        />
      )}

      {view === 'player' && playerQuiz && (
        <Player
          quiz={playerQuiz}
          settings={settings}
          onExit={() => {
            clearActiveSession();
            setView('home');
          }}
          onEdit={() => editQuiz(playerQuiz)}
          onFinish={(result) => {
            clearActiveSession();
            setLastResult(result);
            setView('results');
          }}
          notify={push}
        />
      )}

      {view === 'results' && lastResult && playerQuiz && (
        <Results
          result={lastResult}
          onHome={() => setView('home')}
          onReplay={() => setView('settings')}
          onDownload={() =>
            downloadJson(
              lastResult,
              safeFileName(`${lastResult.quizTitle}-result`)
            )
          }
        />
      )}
    </>
  );
}

function Home({
  library,
  onCreate,
  onImport,
  onEdit,
  onPlay,
  onDelete,
  onDownload,
}) {
  return (
    <main className="shell home-shell">
      <section className="hero panel">
        <div>
          <p className="eyebrow">Local-first React Vite quiz app</p>
          <h1>Kahn Quiz Local</h1>
          <p className="lead">
            Create, play, save, import, and export quizzes entirely inside your
            browser. No backend. No database. No account.
          </p>
        </div>
        <div className="hero-actions">
          <button className="btn primary big" onClick={onCreate}>
            ＋ Create quiz
          </button>
          <label className="btn ghost big file-label">
            ⬆ Import JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => onImport(e, 'editor')}
            />
          </label>
        </div>
        <div className="status-strip">
          <span>
            Saved quizzes: <strong>{library.length}</strong>
          </span>
          <span>
            Browser storage used: <strong>{storageSizeLabel()}</strong>
          </span>
          <span>Images are embedded as Data URLs in exported JSON.</span>
        </div>
      </section>

      <section className="section-header">
        <div>
          <h2>Your local library</h2>
          <p>Stored only in this browser's localStorage.</p>
        </div>
        <label className="btn secondary file-label">
          Import & play
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => onImport(e, 'play')}
          />
        </label>
      </section>

      {library.length === 0 ? (
        <section className="empty panel">
          <h3>No saved quiz yet</h3>
          <p>
            Start with a new quiz, or import a JSON file exported from this app
            or your old HTML version.
          </p>
          <button className="btn primary" onClick={onCreate}>
            Create first quiz
          </button>
        </section>
      ) : (
        <section className="quiz-grid">
          {library.map((quiz) => (
            <article key={quiz.id} className="quiz-card panel">
              <div className="card-top">
                <span className="badge">{quiz.questions.length} questions</span>
                <span className="muted">
                  {new Date(quiz.updatedAt).toLocaleString()}
                </span>
              </div>
              <h3>{quiz.title}</h3>
              <p>{quiz.description || 'No description yet.'}</p>
              <div className="mini-list">
                <span>
                  {quiz.questions.filter((q) => q.type === 'single').length}{' '}
                  single
                </span>
                <span>
                  {quiz.questions.filter((q) => q.type === 'multi').length}{' '}
                  multi
                </span>
                <span>
                  {quiz.questions.filter((q) => q.type === 'text').length} text
                </span>
              </div>
              <div className="card-actions">
                <button className="btn primary" onClick={() => onPlay(quiz)}>
                  Play
                </button>
                <button className="btn secondary" onClick={() => onEdit(quiz)}>
                  Edit
                </button>
                <button className="btn ghost" onClick={() => onDownload(quiz)}>
                  Download
                </button>
                <button
                  className="btn danger"
                  onClick={() => onDelete(quiz.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function Editor({
  quiz,
  setQuiz,
  onBack,
  onSaved,
  onDownload,
  onPlay,
  notify,
}) {
  const errors = useMemo(() => validateQuiz(quiz), [quiz]);

  useEffect(() => {
    const timer = setTimeout(() => saveEditorDraft(quiz), 350);
    return () => clearTimeout(timer);
  }, [quiz]);

  function updateQuiz(patch) {
    setQuiz((current) => ({ ...current, ...patch, updatedAt: nowIso() }));
  }

  function updateQuestion(questionId, patch) {
    setQuiz((current) => ({
      ...current,
      updatedAt: nowIso(),
      questions: current.questions.map((q) =>
        q.id === questionId ? { ...q, ...patch } : q
      ),
    }));
  }

  function normalizeAfterTypeChange(question, type) {
    if (type === 'text') {
      return {
        ...question,
        type,
        options: [],
        correctOptionIds: [],
        correctText: question.correctText || '',
      };
    }
    const options =
      question.options.length >= 2
        ? question.options
        : [newOption('Option 1'), newOption('Option 2')];
    const validIds = new Set(options.map((opt) => opt.id));
    let correctOptionIds = (question.correctOptionIds || []).filter((id) =>
      validIds.has(id)
    );
    if (type === 'single')
      correctOptionIds = [correctOptionIds[0] || options[0].id];
    return { ...question, type, options, correctOptionIds };
  }

  function save() {
    const currentErrors = validateQuiz(quiz);
    if (currentErrors.length) {
      notify(
        `Fix ${currentErrors.length} validation issue(s) before saving.`,
        'error'
      );
      return null;
    }
    const result = upsertQuiz(quiz);
    if (!result.ok) {
      notify(
        'Cannot save to localStorage. The quiz may be too large because of embedded images. Try downloading it instead.',
        'error'
      );
      return null;
    }
    clearEditorDraft();
    onSaved(result.quiz, result);
    return result.quiz;
  }

  return (
    <main className="shell editor-shell">
      <div className="sticky-bar panel">
        <button className="btn ghost" onClick={onBack}>
          ← Home
        </button>
        <div className="spacer" />
        <button className="btn secondary" onClick={() => onDownload(quiz)}>
          Download JSON
        </button>
        <button className="btn primary" onClick={save}>
          Save local
        </button>
        <button
          className="btn dark"
          onClick={() => {
            const saved = errors.length ? null : save();
            if (saved) onPlay(saved);
          }}
        >
          Save & play
        </button>
      </div>

      <section className="panel editor-head">
        <div>
          <p className="eyebrow">Quiz editor</p>
          <h1>{quiz.title || 'Untitled Quiz'}</h1>
          <p>Autosaved as a local draft while you edit.</p>
        </div>
        <div className={`validation ${errors.length ? 'bad' : 'good'}`}>
          {errors.length ? `${errors.length} issue(s)` : 'Ready'}
        </div>
      </section>

      {errors.length > 0 && (
        <section className="panel warning-list">
          <h3>Things to fix</h3>
          <ul>
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel form-panel">
        <label>
          <span>Title</span>
          <input
            value={quiz.title}
            onChange={(e) => updateQuiz({ title: e.target.value })}
            placeholder="Quiz title"
          />
        </label>
        <label>
          <span>Description</span>
          <textarea
            value={quiz.description}
            onChange={(e) => updateQuiz({ description: e.target.value })}
            placeholder="Optional description"
            rows={3}
          />
        </label>
      </section>

      <section className="question-editor-list">
        {quiz.questions.map((question, index) => (
          <QuestionEditor
            key={question.id}
            question={question}
            index={index}
            onChange={(patch) => updateQuestion(question.id, patch)}
            onTypeChange={(type) =>
              setQuiz((current) => ({
                ...current,
                updatedAt: nowIso(),
                questions: current.questions.map((q) =>
                  q.id === question.id ? normalizeAfterTypeChange(q, type) : q
                ),
              }))
            }
            onRemove={() =>
              setQuiz((current) => ({
                ...current,
                updatedAt: nowIso(),
                questions:
                  current.questions.length === 1
                    ? current.questions
                    : current.questions.filter((q) => q.id !== question.id),
              }))
            }
            onDuplicate={() =>
              setQuiz((current) => ({
                ...current,
                updatedAt: nowIso(),
                questions: current.questions.flatMap((q) =>
                  q.id === question.id
                    ? [q, { ...JSON.parse(JSON.stringify(q)), id: makeId('q') }]
                    : [q]
                ),
              }))
            }
            notify={notify}
          />
        ))}
      </section>

      <div className="bottom-actions">
        <button
          className="btn primary big"
          onClick={() =>
            setQuiz((current) => ({
              ...current,
              questions: [...current.questions, newQuestion('single')],
              updatedAt: nowIso(),
            }))
          }
        >
          ＋ Add question
        </button>
      </div>
    </main>
  );
}

function QuestionEditor({
  question,
  index,
  onChange,
  onTypeChange,
  onRemove,
  onDuplicate,
  notify,
}) {
  async function handleImage(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Please choose an image file.', 'error');
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    onChange({ imageDataUrl: dataUrl });
  }

  function updateOption(optionId, text) {
    const options = question.options.map((opt) =>
      opt.id === optionId ? { ...opt, text } : opt
    );
    onChange({ options });
  }

  function removeOption(optionId) {
    if (question.options.length <= 2) {
      notify('Choice questions need at least two options.', 'warn');
      return;
    }
    const options = question.options.filter((opt) => opt.id !== optionId);
    let correctOptionIds = question.correctOptionIds.filter(
      (id) => id !== optionId
    );
    if (question.type === 'single' && correctOptionIds.length === 0)
      correctOptionIds = [options[0].id];
    onChange({ options, correctOptionIds });
  }

  function toggleCorrect(optionId) {
    if (question.type === 'single') {
      onChange({ correctOptionIds: [optionId] });
      return;
    }
    const exists = question.correctOptionIds.includes(optionId);
    const correctOptionIds = exists
      ? question.correctOptionIds.filter((id) => id !== optionId)
      : [...question.correctOptionIds, optionId];
    onChange({ correctOptionIds });
  }

  function appendFormula(snippet) {
    onChange({
      content: `${question.content}${question.content ? ' ' : ''}${snippet}`,
    });
  }

  return (
    <article className="panel question-editor">
      <header className="question-editor-header">
        <div>
          <span className="badge">Question {index + 1}</span>
          <select
            value={question.type}
            onChange={(e) => onTypeChange(e.target.value)}
          >
            <option value="single">Single choice</option>
            <option value="multi">Multiple choice</option>
            <option value="text">Text input</option>
          </select>
        </div>
        <div className="row-actions">
          <button className="btn ghost" onClick={onDuplicate}>
            Duplicate
          </button>
          <button className="btn danger" onClick={onRemove}>
            Remove
          </button>
        </div>
      </header>

      <label className="wide-label">
        <span>Question content</span>
        <textarea
          value={question.content}
          onChange={(e) => onChange({ content: e.target.value })}
          rows={4}
          placeholder="Type the question. Math supports $...$, $$...$$, \(...\), \[...\]."
        />
      </label>

      <div className="formula-row">
        {FORMULA_SNIPPETS.map(([label, snippet]) => (
          <button
            key={label}
            className="chip"
            onClick={() => appendFormula(snippet)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="preview-box">
        <small>Preview</small>
        <MathText
          text={question.content || 'Question preview will appear here.'}
        />
      </div>

      <div className="image-box">
        <div>
          <strong>Image</strong>
          <p>
            Images are converted to Data URLs and embedded into the downloaded
            JSON.
          </p>
        </div>
        <div className="image-actions">
          <label className="btn secondary file-label">
            Choose image
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImage(e.target.files?.[0])}
            />
          </label>
          {question.imageDataUrl && (
            <button
              className="btn ghost"
              onClick={() => onChange({ imageDataUrl: '' })}
            >
              Clear
            </button>
          )}
        </div>
        {question.imageDataUrl && (
          <img
            className="question-image-preview"
            src={question.imageDataUrl}
            alt="Question preview"
          />
        )}
      </div>

      {question.type === 'text' ? (
        <label className="wide-label">
          <span>
            Correct text answer{' '}
            <em>Use || to separate accepted alternatives.</em>
          </span>
          <input
            value={question.correctText}
            onChange={(e) => onChange({ correctText: e.target.value })}
            placeholder="Example: Ho Chi Minh || Hồ Chí Minh"
          />
        </label>
      ) : (
        <div className="options-editor">
          <div className="option-head">
            <h4>Options</h4>
            <button
              className="btn secondary"
              onClick={() =>
                onChange({
                  options: [
                    ...question.options,
                    newOption(`Option ${question.options.length + 1}`),
                  ],
                })
              }
            >
              ＋ Add option
            </button>
          </div>
          {question.options.map((option, optIndex) => (
            <div key={option.id} className="option-edit-row">
              <button
                className={`answer-mark ${question.correctOptionIds.includes(option.id) ? 'active' : ''}`}
                onClick={() => toggleCorrect(option.id)}
                title="Mark as correct"
              >
                {question.type === 'single' ? '○' : '✓'}
              </button>
              <span className="option-letter">
                {String.fromCharCode(65 + optIndex)}
              </span>
              <input
                value={option.text}
                onChange={(e) => updateOption(option.id, e.target.value)}
                placeholder={`Option ${optIndex + 1}`}
              />
              <button
                className="icon-btn"
                onClick={() => removeOption(option.id)}
              >
                ×
              </button>
            </div>
          ))}
          <p className="hint">
            Click the left marker to choose the correct answer. Option IDs are
            stable, so shuffling answers will not break scoring.
          </p>
        </div>
      )}

      <label className="wide-label">
        <span>
          Explanation after submit <em>optional</em>
        </span>
        <textarea
          value={question.explanation}
          onChange={(e) => onChange({ explanation: e.target.value })}
          rows={2}
          placeholder="Why is this the answer?"
        />
      </label>
    </article>
  );
}

function PlaySettings({
  quiz,
  settings,
  setSettings,
  onBack,
  onEdit,
  onStart,
}) {
  const canStart = validateQuiz(quiz).length === 0;
  return (
    <main className="shell narrow-shell">
      <section className="panel settings-panel">
        <button className="btn ghost" onClick={onBack}>
          ← Home
        </button>
        <div className="center-title">
          <p className="eyebrow">Play setup</p>
          <h1>{quiz.title}</h1>
          <p>{quiz.questions.length} questions · stored locally</p>
        </div>

        <div className="settings-grid">
          <Toggle
            label="Shuffle questions"
            checked={settings.shuffleQuestions}
            onChange={(value) =>
              setSettings({ ...settings, shuffleQuestions: value })
            }
          />
          <Toggle
            label="Shuffle answers"
            checked={settings.shuffleAnswers}
            onChange={(value) =>
              setSettings({ ...settings, shuffleAnswers: value })
            }
          />
          <Toggle
            label="Allow instant check"
            checked={settings.allowCheck}
            onChange={(value) =>
              setSettings({
                ...settings,
                allowCheck: value,
                allowRedo: value ? settings.allowRedo : false,
              })
            }
          />
          <Toggle
            label="Allow re-select after check"
            checked={settings.allowRedo}
            disabled={!settings.allowCheck}
            onChange={(value) => setSettings({ ...settings, allowRedo: value })}
          />
        </div>

        <label>
          <span>
            Time limit in minutes <em>optional</em>
          </span>
          <input
            type="number"
            min="1"
            value={settings.timeLimitMinutes}
            onChange={(e) =>
              setSettings({ ...settings, timeLimitMinutes: e.target.value })
            }
            placeholder="Leave blank for no timer"
          />
        </label>

        {!canStart && (
          <p className="error-text">
            This quiz has validation issues. Edit it before playing.
          </p>
        )}
        <div className="footer-actions">
          <button className="btn secondary" onClick={onEdit}>
            Edit quiz
          </button>
          <button
            className="btn primary big"
            disabled={!canStart}
            onClick={onStart}
          >
            Start quiz
          </button>
        </div>
      </section>
    </main>
  );
}

function Toggle({ label, checked, onChange, disabled = false }) {
  return (
    <label className={`toggle ${disabled ? 'disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function Player({ quiz, settings, onExit, onEdit, onFinish, notify }) {
  const [questions] = useState(() => prepareQuestions(quiz, settings));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState(() =>
    Object.fromEntries(quiz.questions.map((q) => [q.id, emptyAnswerFor(q)]))
  );
  const [checks, setChecks] = useState({});
  const [startedAt] = useState(nowIso());
  const initialSeconds =
    Number(settings.timeLimitMinutes) > 0
      ? Math.max(1, Number(settings.timeLimitMinutes)) * 60
      : null;
  const [remaining, setRemaining] = useState(initialSeconds);

  const question = questions[currentIndex];
  const answer = answers[question.id] ?? emptyAnswerFor(question);
  const check = checks[question.id];
  const locked = check?.locked || false;
  const answeredCount = questions.filter((q) =>
    isAnswered(q, answers[q.id])
  ).length;

  function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    );
  }

  function goToNextQuestion() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
      return;
    }
    if (confirm('Finish and submit this quiz?')) submit();
  }

  function goToPreviousQuestion() {
    if (currentIndex > 0) {
      setCurrentIndex((i) => Math.max(0, i - 1));
    }
  }

  function chooseOptionByIndex(optionIndex) {
    const option = question.options[optionIndex];
    if (!option) return;
    if (question.type === 'single') {
      updateAnswer(option.id);
      return;
    }
    toggleMulti(option.id);
  }

  useEffect(() => {
    saveActiveSession({
      quizId: quiz.id,
      answers,
      checks,
      currentIndex,
      updatedAt: nowIso(),
    });
  }, [quiz.id, answers, checks, currentIndex]);

  useEffect(() => {
    if (remaining === null) return undefined;
    if (remaining <= 0) {
      notify('Time is up. The quiz was submitted automatically.', 'warn');
      submit();
      return undefined;
    }
    const timer = setInterval(
      () => setRemaining((sec) => Math.max(0, sec - 1)),
      1000
    );
    return () => clearInterval(timer);
  }, [remaining]);

  useEffect(() => {
    function handleKeyDown(event) {
      const key = event.key;
      const isOptionKey = /^[a-d]$/i.test(key);

      if (key === 'ArrowLeft') {
        event.preventDefault();
        event.stopPropagation();
        goToPreviousQuestion();
        return;
      }

      if (key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        goToNextQuestion();
        return;
      }

      if (key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) {
          if (settings.allowCheck && !locked && isAnswered(question, answer)) {
            checkAnswer();
          }
          return;
        }
        goToNextQuestion();
        return;
      }

      if (!isOptionKey || isEditableTarget(event.target)) return;
      if (question.type === 'text') return;

      const optionIndex = key.toLowerCase().charCodeAt(0) - 97;
      if (optionIndex < 0 || optionIndex > 3) return;
      event.preventDefault();
      chooseOptionByIndex(optionIndex);
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [answer, checkAnswer, locked, question, settings.allowCheck]);

  function updateAnswer(value) {
    if (locked) return;
    setAnswers((current) => ({ ...current, [question.id]: value }));
    if (checks[question.id] && settings.allowRedo) {
      setChecks((current) => ({
        ...current,
        [question.id]: { ...current[question.id], result: null, locked: false },
      }));
    }
  }

  function toggleMulti(optionId) {
    const current = Array.isArray(answer) ? answer : [];
    updateAnswer(
      current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId]
    );
  }

  function checkAnswer() {
    if (locked) return;
    if (!isAnswered(question, answer)) return;
    const result = isAnswerCorrect(question, answer);
    setChecks((current) => ({
      ...current,
      [question.id]: {
        result,
        locked: !settings.allowRedo || result,
        checkedAt: nowIso(),
      },
    }));
  }

  function submit() {
    const result = createResultPayload({
      quiz,
      questions,
      answers,
      checks,
      settings,
      startedAt,
    });
    onFinish(result);
  }

  const timerText =
    remaining === null
      ? 'No timer'
      : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;

  return (
    <main className="player-layout">
      <aside className="side-panel">
        <div className="timer-box">{timerText}</div>
        <h2>{quiz.title}</h2>
        <p>
          {answeredCount}/{questions.length} answered
        </p>
        <div className="question-nav">
          {questions.map((q, idx) => {
            const answered = isAnswered(q, answers[q.id]);
            const state =
              checks[q.id]?.result === true
                ? 'correct'
                : checks[q.id]?.result === false
                  ? 'wrong'
                  : answered
                    ? 'answered'
                    : '';
            return (
              <button
                key={q.id}
                className={`${idx === currentIndex ? 'current' : ''} ${state}`}
                onClick={() => setCurrentIndex(idx)}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
        <div className="side-actions">
          <button className="btn secondary" onClick={onEdit}>
            Edit quiz
          </button>
          <button
            className="btn dark"
            onClick={() => {
              if (confirm('Submit quiz now?')) submit();
            }}
          >
            Submit
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              if (confirm('Exit this quiz? Current attempt will be lost.'))
                onExit();
            }}
          >
            Exit
          </button>
        </div>
      </aside>

      <section className="play-area">
        <article className="panel question-card">
          <div className="question-meta">
            <span className="badge">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <span className="badge soft">
              {question.type === 'single'
                ? 'Single choice'
                : question.type === 'multi'
                  ? 'Multiple choice'
                  : 'Text input'}
            </span>
          </div>
          <MathText text={question.content} className="question-content" />
          {question.imageDataUrl && (
            <img
              className="play-image"
              src={question.imageDataUrl}
              alt="Question"
            />
          )}

          {question.type === 'text' ? (
            <input
              className="answer-input"
              value={answer}
              readOnly={locked}
              onChange={(e) => updateAnswer(e.target.value)}
              placeholder="Type your answer"
            />
          ) : (
            <div className="option-list">
              {question.options.map((option, idx) => {
                const selected =
                  question.type === 'single'
                    ? answer === option.id
                    : Array.isArray(answer) && answer.includes(option.id);
                const correct = question.correctOptionIds.includes(option.id);
                const reveal =
                  settings.allowCheck &&
                  check?.result !== null &&
                  check?.result !== undefined;
                return (
                  <button
                    key={option.id}
                    className={`option-card ${selected ? 'selected' : ''} ${reveal && correct ? 'reveal-correct' : ''} ${reveal && selected && !correct ? 'reveal-wrong' : ''}`}
                    disabled={locked}
                    onClick={() =>
                      question.type === 'single'
                        ? updateAnswer(option.id)
                        : toggleMulti(option.id)
                    }
                  >
                    <span className="option-bullet">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <MathText text={option.text} />
                  </button>
                );
              })}
            </div>
          )}

          {settings.allowCheck &&
            check?.result !== null &&
            check?.result !== undefined && (
              <div className={`feedback ${check.result ? 'good' : 'bad'}`}>
                <strong>{check.result ? 'Correct.' : 'Not quite.'}</strong>
                {!check.result && (
                  <span> Correct answer: {correctAnswerText(question)}</span>
                )}
              </div>
            )}

          {settings.allowCheck &&
            question.explanation &&
            check?.result !== undefined &&
            check?.result !== null && (
              <div className="explanation">
                <strong>Explanation:</strong>{' '}
                <MathText text={question.explanation} />
              </div>
            )}
          <div className="footer-actions split">
            <button
              className="btn secondary"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            >
              Previous
            </button>
            <div className="inline-actions">
              {settings.allowCheck && (
                <button
                  className="btn primary"
                  disabled={!isAnswered(question, answer) || locked}
                  onClick={checkAnswer}
                >
                  Check answer
                </button>
              )}
              {currentIndex < questions.length - 1 ? (
                <button
                  className="btn dark"
                  onClick={() =>
                    setCurrentIndex((i) =>
                      Math.min(questions.length - 1, i + 1)
                    )
                  }
                >
                  Next
                </button>
              ) : (
                <button
                  className="btn dark"
                  onClick={() => {
                    if (confirm('Finish and submit this quiz?')) submit();
                  }}
                >
                  Finish
                </button>
              )}
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

function Results({ result, onHome, onReplay, onDownload }) {
  return (
    <main className="shell results-shell">
      <section className="panel result-hero">
        <p className="eyebrow">Quiz complete</p>
        <h1>{result.score}%</h1>
        <p>
          {result.correctAnswers} / {result.totalQuestions} correct ·{' '}
          {result.quizTitle}
        </p>
        <div className="footer-actions centered">
          <button className="btn primary" onClick={onReplay}>
            Play again
          </button>
          <button className="btn secondary" onClick={onDownload}>
            Download result
          </button>
          <button className="btn ghost" onClick={onHome}>
            Home
          </button>
        </div>
      </section>
      <section className="review-list">
        {result.rows.map((row, index) => (
          <article
            key={row.questionId}
            className={`panel review-card ${row.correct ? 'correct' : 'wrong'}`}
          >
            <div className="question-meta">
              <span className="badge">Question {index + 1}</span>
              <span
                className={`badge ${row.correct ? 'success' : 'danger-soft'}`}
              >
                {row.correct ? 'Correct' : 'Wrong'}
              </span>
            </div>
            <MathText text={row.content} />
            <p>
              <strong>Your answer:</strong> {row.userAnswer || '—'}
            </p>
            <p>
              <strong>Correct answer:</strong> {row.correctAnswer || '—'}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
