"use client";

import { User } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/components/SessionContext";
import { apiAdminUpdateUser, apiUserDetail, type ApiUserDetail } from "@/lib/api";

const ROLE_LABELS: Record<string, string> = {
  user: "Юзер",
  gamemaster: "Гейм-мастер",
  bartender: "Бармен",
  manager: "Менеджер",
  admin: "Администратор",
};

const STATUS_CHIPS: Record<string, { text: string; cls: string }> = {
  pending: { text: "Ожидание", cls: "chip chip-orange" },
  approved: { text: "За столом", cls: "chip chip-green" },
  rejected: { text: "Отклонена", cls: "chip chip-red" },
};

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const { user: viewer } = useSession();
  const [detail, setDetail] = useState<ApiUserDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleMsg, setTitleMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    apiUserDetail(params.id).then((d) => {
      setDetail(d);
      setTitleDraft(d?.title ?? "");
      setLoaded(true);
    });
  }, [params?.id]);

  const saveTitle = async () => {
    if (!detail) return;
    setTitleMsg(null);
    const { error } = await apiAdminUpdateUser(detail.id, { title: titleDraft.trim() });
    if (error) {
      setTitleMsg(error);
      return;
    }
    setDetail({ ...detail, title: titleDraft.trim() || null });
    setTitleMsg("Сохранено");
  };

  return (
    <div className="mx-auto max-w-2xl p-2 sm:p-4">

        {!loaded && <p className="text-[#9a8b75]">Загрузка…</p>}

        {loaded && !detail && (
          <p className="text-[#cfc2ab]">
            Профиль недоступен: нужна роль гейм-мастера, менеджера или администратора
            (или пользователь не найден).
          </p>
        )}

        {detail && (
          <>
            <div className="parchment flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
              <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border-2 border-[#33291c] bg-[#16110d] text-3xl">
                {detail.avatar?.startsWith("/") ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={detail.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  detail.avatar ?? <User className="size-6 text-[#9a8b75]" />
                )}
              </span>
              <div className="min-w-0">
                <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tavern-ink">
                  {detail.name}
                  {!detail.is_active && <span className="chip chip-red">деактивирован</span>}
                </h1>
                {detail.title && (
                  <p className="text-sm italic text-[#d3a24a]">✦ {detail.title}</p>
                )}
                <p className="text-sm tavern-soft">
                  {ROLE_LABELS[detail.role] ?? detail.role}
                  {detail.telegram && ` · @${detail.telegram}`}
                  {detail.email && ` · ${detail.email}`}
                </p>
                <p className="text-xs tavern-soft">
                  В таверне с{" "}
                  {new Date(detail.created_at).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            {viewer?.role === "admin" && (
              <div className="parchment mt-4 p-4">
                <span className="tavern-label">Титул (виден всем, выдаётся по заслугам)</span>
                <div className="flex gap-2">
                  <input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    placeholder="Например: Гроза Страда"
                    className="tavern-input"
                  />
                  <button type="button" onClick={saveTitle} className="btn-gold shrink-0">
                    Сохранить
                  </button>
                </div>
                {titleMsg && (
                  <p className={`mt-2 text-sm font-bold ${titleMsg === "Сохранено" ? "text-[#a5d493]" : "text-[#e79b8f]"}`}>
                    {titleMsg}
                  </p>
                )}
                <p className="mt-1 text-xs tavern-soft">Пустое поле — снять титул.</p>
              </div>
            )}

            <div className="mb-2 mt-6">
              <span className="chip chip-gold">Заявки на игры · {detail.bookings.length}</span>
            </div>
            {detail.bookings.length === 0 ? (
              <p className="text-sm text-[#cfc2ab]">Ещё не записывался на игры</p>
            ) : (
              <div className="parchment divide-y-2 divide-[#262018] p-0">
                {detail.bookings.map((b) => {
                  const s = STATUS_CHIPS[b.status];
                  return (
                    <div key={`${b.game_id}-${b.starts_at}`} className="flex items-center justify-between gap-3 p-3">
                      <div>
                        <p className="text-sm font-bold tavern-ink">{b.game_title}</p>
                        <p className="text-xs tavern-soft">
                          {new Date(b.starts_at).toLocaleString("ru-RU", {
                            day: "numeric",
                            month: "long",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <span className={s.cls}>{s.text}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
    </div>
  );
}
