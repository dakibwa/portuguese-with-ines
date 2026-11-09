import { useEffect, useState } from "react";
import { tutorApi } from "./runtime";
import type { Site } from "./types";
import { Field } from "./onboarding";
type Sheet = {
  title: string;
  objective: string;
  reminder: string;
  sections: {
    title: string;
    instruction: string;
    example: string;
    questions: {
      id: string;
      prompt: string;
      answer: string;
      explanation: string;
      marking?: string;
    }[];
  }[];
};
type Plan = {
  title: string;
  goal: string;
  privateNote: string;
  stages: { strand: string; minutes: number; task: string }[];
  words: string[];
  homework: Sheet;
  sources: { title: string; url: string }[];
  needsTeacherReview: boolean;
};
type Data = {
  pack: {
    name: string;
    levels: string[];
    sources: { title: string; url: string }[];
  };
  students: {
    id: string;
    name: string;
    level: string | null;
    goals: string | null;
    first_language: string | null;
    pack_approved_at: string | null;
  }[];
  lessons: {
    id: string;
    student_id: string;
    student_name: string;
    starts_at: string;
    plan: Plan | null;
    approved_at: string | null;
    taught_at: string | null;
  }[];
};
export function Curriculum({ site, token }: { site: Site; token: string }) {
  const [data, setData] = useState<Data | null>(null),
    [studentId, setStudentId] = useState(""),
    [lessonId, setLessonId] = useState(""),
    [profile, setProfile] = useState({
      level: "",
      goals: "",
      firstLanguage: "",
      approvePack: false,
    }),
    [plan, setPlan] = useState<Plan | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  async function load() {
    const value = await tutorApi<Data>(site.id, token, "/vowel/curriculum");
    setData(value);
    return value;
  }
  useEffect(() => {
    let active = true;
    void tutorApi<Data>(site.id, token, "/vowel/curriculum")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((caught) => {
        if (active) setError(caught.message);
      });
    return () => {
      active = false;
    };
  }, [site.id, token]);
  async function act(path: string, input: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      return await tutorApi<{ plan?: Plan }>(
        site.id,
        token,
        `/vowel/curriculum/${path}`,
        input,
      );
    } catch (caught) {
      setError((caught as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  const chooseStudent = (id: string) => {
    setConfirm(false);
    setStudentId(id);
    setLessonId("");
    setPlan(null);
    const student = data?.students.find((s) => s.id === id);
    setProfile({
      level: student?.level || data?.pack.levels[0] || "A1",
      goals: student?.goals || "",
      firstLanguage: student?.first_language || "",
      approvePack: Boolean(student?.pack_approved_at),
    });
  };
  const changeQuestion = (
    sectionIndex: number,
    questionIndex: number,
    key: "prompt" | "answer" | "explanation",
    value: string,
  ) => {
    if (!plan) return;
    setConfirm(false);
    setPlan({
      ...plan,
      homework: {
        ...plan.homework,
        sections: plan.homework.sections.map((section, s) =>
          s === sectionIndex
            ? {
                ...section,
                questions: section.questions.map((question, q) =>
                  q === questionIndex
                    ? { ...question, [key]: value }
                    : question,
                ),
              }
            : section,
        ),
      },
    });
  };
  if (!data)
    return <p role="status">{error || "Opening your lesson plans…"}</p>;
  return (
    <section className="vo-curriculum">
      <p className="vo-eyebrow">A plan, ready for your judgement</p>
      <h2>One student. Their next step.</h2>
      <p>
        Draft a lesson and matching homework for {data.pack.name}. You review
        the language, teaching choices and answers before anything reaches the
        student.
      </p>
      <Field label="Student">
        <select
          value={studentId}
          onChange={(event) => chooseStudent(event.target.value)}
        >
          <option value="">Choose a student</option>
          {data.students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>
      </Field>
      {studentId && (
        <>
          <div className="vo-two-fields">
            <Field label="Current level">
              <select
                value={profile.level}
                onChange={(event) =>
                  setProfile({ ...profile, level: event.target.value })
                }
              >
                {data.pack.levels.map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
            </Field>
            <Field label="First language">
              <input
                value={profile.firstLanguage}
                onChange={(event) =>
                  setProfile({ ...profile, firstLanguage: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="What are they working towards?">
            <textarea
              value={profile.goals}
              rows={3}
              onChange={(event) =>
                setProfile({ ...profile, goals: event.target.value })
              }
            />
          </Field>
          <details className="vo-reference-list">
            <summary>The starting references</summary>
            <p>
              These are starter packs, awaiting a language teacher’s check. The
              research supports broad principles; the exact timing and review
              gaps are adjustable suggestions.
            </p>
            <ul>
              {data.pack.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                </li>
              ))}
            </ul>
          </details>
          <label className="vo-check">
            <input
              type="checkbox"
              checked={profile.approvePack}
              onChange={(event) =>
                setProfile({ ...profile, approvePack: event.target.checked })
              }
            />{" "}
            I’ve checked this language pack for my teaching.
          </label>
          <button
            type="button"
            className="vo-button vo-button-secondary"
            disabled={busy}
            onClick={async () => {
              const result = await act("profile", { studentId, ...profile });
              if (result) {
                setNotice("Their level and goals are saved.");
                await load();
              }
            }}
          >
            Save their learning profile
          </button>
          <Field label="Lesson">
            <select
              value={lessonId}
              onChange={(event) => {
                setLessonId(event.target.value);
                setPlan(
                  data.lessons.find(
                    (lesson) => lesson.id === event.target.value,
                  )?.plan || null,
                );
                setConfirm(false);
              }}
            >
              <option value="">Choose a booked lesson</option>
              {data.lessons
                .filter((lesson) => lesson.student_id === studentId)
                .map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {new Date(lesson.starts_at).toLocaleString("en-GB", {
                      timeZone: site.place.timeZone,
                    })}
                    {lesson.approved_at ? " · plan checked" : ""}
                  </option>
                ))}
            </select>
          </Field>
          {lessonId && (
            <button
              type="button"
              className="vo-button"
              disabled={busy}
              onClick={async () => {
                const result = await act("draft", { bookingId: lessonId });
                if (result?.plan) {
                  setPlan(result.plan);
                  setConfirm(false);
                }
              }}
            >
              {busy ? "Drafting…" : "Draft the lesson and homework"}
            </button>
          )}
        </>
      )}
      {plan && (
        <fieldset disabled={busy} className="vo-plan-editor">
          <legend>For your review</legend>
          <Field label="Lesson goal">
            <textarea
              rows={2}
              value={plan.goal}
              onChange={(event) => {
                setPlan({
                  ...plan,
                  goal: event.target.value,
                  title: event.target.value,
                });
                setConfirm(false);
              }}
            />
          </Field>
          <Field label="Private teaching note">
            <textarea
              rows={2}
              value={plan.privateNote}
              onChange={(event) => {
                setConfirm(false);
                setPlan({ ...plan, privateNote: event.target.value });
              }}
            />
          </Field>
          {plan.stages.map((stage, index) => (
            <section className="vo-plan-stage" key={index}>
              <div>
                <h3>
                  {index + 1}. {stage.strand}
                </h3>
                <label>
                  <span className="vo-sr-only">{stage.strand} minutes</span>
                  <input
                    type="number"
                    min={1}
                    value={stage.minutes}
                    onChange={(event) => {
                      setConfirm(false);
                      setPlan({
                        ...plan,
                        stages: plan.stages.map((value, i) =>
                          i === index
                            ? { ...value, minutes: Number(event.target.value) }
                            : value,
                        ),
                      });
                    }}
                  />{" "}
                  min
                </label>
              </div>
              <textarea
                rows={3}
                value={stage.task}
                aria-label={`${stage.strand} activity`}
                onChange={(event) => {
                  setConfirm(false);
                  setPlan({
                    ...plan,
                    stages: plan.stages.map((value, i) =>
                      i === index
                        ? { ...value, task: event.target.value }
                        : value,
                    ),
                  });
                }}
              />
            </section>
          ))}
          <h3>Homework to match</h3>
          <p className="vo-hint">
            Replace the starter answer prompts with checked model answers.
            Publishing stays on the student’s normal homework page.
          </p>
          {plan.homework.sections.map((section, s) => (
            <section className="vo-homework-review" key={s}>
              <h4>{section.title}</h4>
              <p>{section.instruction}</p>
              {section.questions.map((question, q) => (
                <div key={question.id}>
                  <Field label="Question">
                    <textarea
                      rows={2}
                      value={question.prompt}
                      onChange={(event) =>
                        changeQuestion(s, q, "prompt", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Checked model answer">
                    <textarea
                      className={
                        /Tutor:/.test(question.answer) ? "vo-drafted" : ""
                      }
                      rows={2}
                      value={question.answer}
                      onChange={(event) =>
                        changeQuestion(s, q, "answer", event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Feedback guidance">
                    <textarea
                      rows={2}
                      value={question.explanation}
                      onChange={(event) =>
                        changeQuestion(s, q, "explanation", event.target.value)
                      }
                    />
                  </Field>
                </div>
              ))}
            </section>
          ))}
          <label className="vo-check">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(event) => setConfirm(event.target.checked)}
            />{" "}
            I’ve checked this plan and every model answer.
          </label>
          <button
            type="button"
            className="vo-button"
            disabled={!confirm}
            onClick={async () => {
              const result = await act("approve", {
                bookingId: lessonId,
                plan,
                confirm,
              });
              if (result?.plan) {
                setPlan(result.plan);
                setNotice(
                  "Plan approved. The matching homework is a private draft on this lesson, ready for your Publish action.",
                );
                await load();
              }
            }}
          >
            Approve plan and save homework draft
          </button>
          <button
            type="button"
            className="vo-text-button"
            onClick={async () => {
              const result = await act("taught", { bookingId: lessonId });
              if (result)
                setNotice(
                  "Marked as taught. This topic will come back for review.",
                );
            }}
          >
            Mark this plan taught
          </button>
        </fieldset>
      )}
      {notice && (
        <p role="status" className="vo-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="vo-error">
          {error}
        </p>
      )}
    </section>
  );
}
