"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useSession } from "@/components/SessionContext";
import {
  CONDITION_FIELDS,
  CONDITION_OPS,
  QUEST_CREATABLE,
  NUMERIC_CONDITION_FIELDS,
  apiCloseQuest,
  apiCompleteAssignment,
  apiCreateQuest,
  apiQuestAssignments,
  apiQuests,
  apiRejectAssignment,
  apiSubmitQuest,
  apiSyncQuest,
  apiTakeQuest,
  type ApiQuest,
  type ApiQuestAssignment,
  type ConditionOp,
  type QuestCategory,
  type QuestCondition,
} from "@/lib/api";

const CATEGORY_CHIP: Record<QuestCategory, { text: string; cls: string }> = {
  general: { text: "Общее", cls: "chip chip-purple" },
  bar: { text: "Таверна", cls: "chip chip-orange" },
  game: { text: "Игры", cls: "chip chip-blue" },
};

const STATUS_CHIP: Record<string, { text: string; cls: string }> = {
  taken: { text: "В работе", cls: "chip chip-blue" },
  submitted: { text: "На проверке", cls: "chip chip-orange" },
  completed: { text: "Выполнено", cls: "chip chip-green" },
  rejected: { text: "Вернули", cls: "chip chip-red" },
};

const OP_LABEL = Object.fromEntries(CONDITION_OPS) as Record<ConditionOp, string>;

function describe(conds: QuestCondition[]): string {
  if (conds.length === 0) return "всем";
  return conds
    .map((c) => (c.op === "filled" ? `${c.field} заполнено` : `${c.field} ${OP_LABEL[c.op]} ${c.value}`))
    .join(" и ");
}

function ConditionsEditor({
  value,
  onChange,
}: {
  value: QuestCondition[];
  onChange: (next: QuestCondition[]) => void;
}) {
  const update = (i: number, patch: Partial<QuestCondition>) =>
    onChange(value.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-1.5">
      {value.map((c, i) => {
        const numeric = NUMERIC_CONDITION_FIELDS.includes(c.field);
        return (
          <div key={i} className="grid grid-cols-[1fr_1fr] gap-1.5 sm:flex">
            <select
              value={c.field}
              onChange={(e) => update(i, { field: e.target.value })}
              className="tavern-input py-1 text-xs"
            >
              {CONDITION_FIELDS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <select
              value={c.op}
              onChange={(e) => update(i, { op: e.target.value as ConditionOp })}
              className="tavern-input py-1 text-xs"
            >
              {CONDITION_OPS.filter(([op]) => numeric || !["gte", "lte", "gt", "lt"].includes(op)).map(
                ([op, label]) => (
                  <option key={op} value={op}>{label}</option>
                )
              )}
            </select>
            <input
              disabled={c.op === "filled"}
              placeholder={c.op === "filled" ? "—" : numeric ? "число" : "значение"}
              value={c.value ?? ""}
              onChange={(e) => update(i, { value: e.target.value })}
              className="tavern-input col-span-2 py-1 text-xs disabled:opacity-50 sm:col-span-1"
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="btn-danger col-span-2 px-2 py-1 text-xs sm:col-span-1"
              title="Убрать условие"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...value, { field: "phone", op: "filled", value: null }])}
        className="btn-brown px-2 py-1 text-xs"
      >
        + условие
      </button>
    </div>
  );
}

export default function QuestsPage() {
  const { user, loaded } = useSession();
  const [quests, setQuests] = useState<ApiQuest[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, ApiQuestAssignment[]>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const emptyForm = {
    title: "",
    description: "",
    category: "" as QuestCategory | "",
    xp_reward: 100,
    auto_check: false,
    complete: [] as QuestCondition[],
    auto_assign: false,
    assign: [] as QuestCondition[],
    retro_credit: true,
  };
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState<string | null>(null);

  // одна мутация за раз: двойной клик не отправляет дубль
  const run = (key: string, fn: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const reload = () => apiQuests().then((list) => setQuests(list ?? []));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCreateOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (user) reload();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const canReview = (q: ApiQuest) => !!user && (user.role === "admin" || q.created_by === user.id);
  const creatable = user ? QUEST_CREATABLE[user.role] ?? [] : [];

  const openQuest = (q: ApiQuest) => {
    const next = expanded === q.id ? null : q.id;
    setExpanded(next);
    setNotice(null);
    if (next && canReview(q)) {
      apiQuestAssignments(q.id).then((a) => setAssignments((prev) => ({ ...prev, [q.id]: a ?? [] })));
    }
  };

  const patchQuest = (updated: ApiQuest | null) => {
    if (!updated) return;
    setQuests((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
  };

  const normalize = (conds: QuestCondition[]): QuestCondition[] =>
    conds.map((c) => ({
      field: c.field,
      op: c.op,
      value: c.op === "filled" ? null : NUMERIC_CONDITION_FIELDS.includes(c.field) ? Number(c.value) : String(c.value ?? ""),
    }));

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category || busy) return;
    setBusy("create");
    const { error } = await apiCreateQuest({
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      xp_reward: Number(form.xp_reward),
      complete_conditions: form.auto_check ? normalize(form.complete) : null,
      auto_assign: form.auto_assign,
      assign_conditions: form.auto_assign ? normalize(form.assign) : [],
      retro_credit: form.retro_credit,
    });
    setBusy(null);
    if (error) {
      setNotice(error);
      return;
    }
    setCreateOpen(false);
    setForm(emptyForm);
    reload();
  };

  return (
    <>
      <div className="mx-auto max-w-3xl p-2 sm:p-4">

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-[#ece3d2]">
              Доска заданий <span className="text-[#e3a83e]">таверны</span>
            </h1>
            <p className="text-sm text-[#9a8b75]">Бери задание, выполняй, получай опыт</p>
          </div>
          {creatable.length > 0 && (
            <button type="button" onClick={() => setCreateOpen(true)} className="btn-gold text-xs">
              <Plus className="size-3.5" /> Новое задание
            </button>
          )}
        </div>

        {!loaded && <p className="text-[#9a8b75]">Загрузка…</p>}
        {loaded && !user && (
          <p className="text-center text-[#cfc2ab]">
            Доска видна после входа. <a href="/login" className="text-[#e3a83e] underline">Войти</a>
          </p>
        )}
        {user && quests.length === 0 && (
          <p className="text-center text-[#cfc2ab]">Доска пуста — загляни позже.</p>
        )}

        {notice && !createOpen && (
          <p className="mb-3 rounded-md border-2 border-[#e79b8f] bg-[#b23b2e]/20 px-3 py-2 text-sm font-bold text-[#f0b2a7]">
            {notice}
          </p>
        )}

        <div className="space-y-3">
          {quests.map((q) => (
            <div key={q.id} className={`parchment p-4 ${!q.is_active ? "opacity-70" : ""}`}>
              <div className="flex cursor-pointer flex-wrap items-center justify-between gap-2" onClick={() => openQuest(q)}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className={CATEGORY_CHIP[q.category].cls}>{CATEGORY_CHIP[q.category].text}</span>
                  <b className="tavern-ink">{q.title}</b>
                  {q.complete_conditions && <span className="chip chip-gold">⚙ авто</span>}
                  {q.auto_assign && (
                    <span className="chip chip-purple" title="Выдаётся автоматически">
                      → {describe(q.assign_conditions)}
                    </span>
                  )}
                  {q.assignee_id && <span className="chip chip-gold">персональное</span>}
                  {!q.is_active && <span className="chip chip-red">снято</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {q.my_status && <span className={STATUS_CHIP[q.my_status].cls}>{STATUS_CHIP[q.my_status].text}</span>}
                  <span className="chip chip-green">+{q.xp_reward} XP</span>
                </div>
              </div>

              {expanded === q.id && (
                <div className="mt-3 border-t-2 border-[#262018] pt-3">
                  {q.description && <p className="mb-2 text-sm tavern-ink">{q.description}</p>}
                  <p className="text-xs tavern-soft">
                    Выдал: {q.creator} · взяли: {q.takers}
                    {q.max_takers ? ` из ${q.max_takers}` : ""}
                    {q.complete_conditions && ` · зачёт: ${describe(q.complete_conditions)}`}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {q.my_status === null && q.is_active && !canReview(q) && (
                      <button
                        type="button"
                        onClick={run(`take-${q.id}`, async () => {
                          const { data, error } = await apiTakeQuest(q.id);
                          if (error) setNotice(error);
                          patchQuest(data);
                        })}
                        disabled={busy === `take-${q.id}`}
                        className="btn-gold text-xs"
                      >
                        Взять задание
                      </button>
                    )}
                    {q.complete_conditions && q.my_status && q.my_status !== "completed" && (
                      <p className="text-xs italic tavern-soft">
                        ⚙ Задание засчитается само, как только выполнишь условие.
                      </p>
                    )}
                    {!q.complete_conditions && (q.my_status === "taken" || q.my_status === "rejected") && (
                      <button
                        type="button"
                        onClick={run(`submit-${q.id}`, async () => {
                          const { data, error } = await apiSubmitQuest(q.id);
                          if (error) setNotice(error);
                          patchQuest(data);
                        })}
                        disabled={busy === `submit-${q.id}`}
                        className="btn-gold text-xs"
                      >
                        {q.my_status === "rejected" ? "Сдать ещё раз" : "Сдать на проверку"}
                      </button>
                    )}
                  </div>

                  {canReview(q) && (
                    <div className="mt-3">
                      <span className="tavern-label">Исполнители</span>
                      {(assignments[q.id] ?? []).length === 0 && (
                        <p className="text-sm tavern-soft">Пока никто не взял</p>
                      )}
                      {(assignments[q.id] ?? []).map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-2 py-1">
                          <a href={`/users/${a.user_id}`} className="text-sm font-bold tavern-ink underline decoration-[#33291c] underline-offset-2">
                            {a.user_name}
                          </a>
                          {(a.status === "submitted" || a.status === "taken") && !q.complete_conditions ? (
                            <span className="flex items-center gap-1.5">
                              <span className={STATUS_CHIP[a.status].cls}>{STATUS_CHIP[a.status].text}</span>
                              <button
                                type="button"
                                onClick={run(`ok-${a.id}`, async () => {
                                  const { data, error } = await apiCompleteAssignment(q.id, a.id);
                                  if (error) setNotice(error);
                                  if (data)
                                    setAssignments((prev) => ({
                                      ...prev,
                                      [q.id]: (prev[q.id] ?? []).map((x) => (x.id === a.id ? data : x)),
                                    }));
                                  reload();
                                })}
                                disabled={busy === `ok-${a.id}`}
                                className="btn-gold px-2 py-1 text-xs"
                              >
                                Засчитать
                              </button>
                              <button
                                type="button"
                                onClick={run(`no-${a.id}`, async () => {
                                  const { data } = await apiRejectAssignment(q.id, a.id);
                                  if (data)
                                    setAssignments((prev) => ({
                                      ...prev,
                                      [q.id]: (prev[q.id] ?? []).map((x) => (x.id === a.id ? data : x)),
                                    }));
                                })}
                                disabled={busy === `no-${a.id}`}
                                className="btn-danger px-2 py-1 text-xs"
                              >
                                Вернуть
                              </button>
                            </span>
                          ) : (
                            <span className={STATUS_CHIP[a.status].cls}>{STATUS_CHIP[a.status].text}</span>
                          )}
                        </div>
                      ))}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {q.is_active && (
                          <button
                            type="button"
                            onClick={async () => {
                              const { data } = await apiCloseQuest(q.id);
                              patchQuest(data);
                            }}
                            className="btn-brown text-xs"
                          >
                            Снять с доски
                          </button>
                        )}
                        {q.is_active && q.auto_assign && user?.role === "admin" && (
                          <button
                            type="button"
                            onClick={run(`sync-${q.id}`, async () => {
                              const { data, error } = await apiSyncQuest(q.id);
                              setNotice(error ?? `Раздано: ${data?.assigned ?? 0}`);
                              reload();
                            })}
                            disabled={busy === `sync-${q.id}`}
                            className="btn-gold text-xs"
                            title="Повторно раздать всем подходящим"
                          >
                            Раздать сейчас
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-2 sm:p-4" onClick={() => setCreateOpen(false)}>
          <form
            onSubmit={submitCreate}
            onClick={(e) => e.stopPropagation()}
            className="parchment max-h-[92vh] w-full max-w-md space-y-3 overflow-y-auto p-4 sm:p-5"
          >
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold tavern-ink">Новое задание</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="tavern-soft">
                <X className="size-4" />
              </button>
            </div>
            <input
              required
              placeholder="Название"
              maxLength={120}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="tavern-input"
            />
            <textarea
              placeholder="Что нужно сделать и как подтвердить"
              rows={3}
              maxLength={2000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="tavern-input"
            />
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="tavern-label">Категория</span>
                <select
                  required
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as QuestCategory })}
                  className="tavern-input"
                >
                  <option value="" disabled>Выбрать…</option>
                  {creatable.map((c) => (
                    <option key={c} value={c}>{CATEGORY_CHIP[c].text}</option>
                  ))}
                </select>
              </label>
              <label className="flex-1">
                <span className="tavern-label">Награда, XP</span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={form.xp_reward}
                  onChange={(e) => setForm({ ...form, xp_reward: Number(e.target.value) })}
                  className="tavern-input"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm tavern-ink">
              <input
                type="checkbox"
                checked={form.auto_check}
                onChange={(e) => setForm({ ...form, auto_check: e.target.checked })}
              />
              ⚙ Засчитывать автоматически (все условия — И)
            </label>
            {form.auto_check && (
              <ConditionsEditor value={form.complete} onChange={(complete) => setForm({ ...form, complete })} />
            )}

            <label className="flex items-center gap-2 text-sm tavern-ink">
              <input
                type="checkbox"
                checked={form.auto_assign}
                onChange={(e) => setForm({ ...form, auto_assign: e.target.checked })}
              />
              → Выдавать автоматически (без условий — всем)
            </label>
            {form.auto_assign && (
              <>
                <ConditionsEditor value={form.assign} onChange={(assign) => setForm({ ...form, assign })} />
                {form.auto_check && (
                  <label className="flex items-center gap-2 text-xs tavern-ink">
                    <input
                      type="checkbox"
                      checked={form.retro_credit}
                      onChange={(e) => setForm({ ...form, retro_credit: e.target.checked })}
                    />
                    Засчитывать и тем, кто уже выполнил условие (иначе им не выдаётся)
                  </label>
                )}
              </>
            )}
            <p className="text-[10px] tavern-soft">
              Текстовые поля: name, email, phone, telegram, title, avatar, role. Числовые: xp,
              games_played, games_mastered (≥ ≤ &gt; &lt; только для них).
            </p>
            {notice && <p className="text-sm font-bold text-[#e79b8f]">{notice}</p>}
            <button type="submit" disabled={busy === "create"} className="btn-gold w-full">
              {busy === "create" ? "Секунду…" : "Повесить на доску"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
