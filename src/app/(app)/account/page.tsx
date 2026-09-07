"use client";

import { KeyRound, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/SessionContext";
import { PORTRAITS, UserAvatar, portraitKey } from "@/components/UserAvatar";
import {
  apiCancelBooking,
  apiChangePassword,
  apiGames,
  apiQuests,
  apiUpdateMe,
  apiUploadAvatar,
  canManageGames,
  levelFromXp,
  XP_THRESHOLDS,
  type ApiGame,
  type ApiQuest,
  type ApiUser,
} from "@/lib/api";

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// уровень по-лисьи: 1 хвост, 3 хвоста, 5 хвостов
function tails(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} хвост`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} хвоста`;
  return `${n} хвостов`;
}

const QUEST_CHIP: Record<string, { text: string; cls: string }> = {
  taken: { text: "В работе", cls: "chip chip-blue" },
  submitted: { text: "На проверке", cls: "chip chip-orange" },
  rejected: { text: "Вернули", cls: "chip chip-red" },
};

const BOOKING_CHIP: Record<string, { text: string; cls: string }> = {
  pending: { text: "Ожидание", cls: "chip chip-orange" },
  approved: { text: "Подтверждено", cls: "chip chip-green" },
  rejected: { text: "Отклонена", cls: "chip chip-red" },
};

export default function AccountPage() {
  const { user, loaded, setUser } = useSession();
  const [myGames, setMyGames] = useState<ApiGame[]>([]);
  const [masteredGames, setMasteredGames] = useState<ApiGame[]>([]); // игры, где я ГМ
  const [myQuests, setMyQuests] = useState<ApiQuest[]>([]);

  const [profile, setProfile] = useState({ name: "", email: "", phone: "", telegram: "" });
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [pwd, setPwd] = useState({ current: "", next: "", repeat: "" });
  const [pwdMsg, setPwdMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);

  const pickAvatar = async (avatar: string) => {
    const { data } = await apiUpdateMe({ avatar });
    if (data) setUser(data);
    setAvatarPickerOpen(false);
  };

  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return;
    setAvatarMsg(null);
    const { data, error } = await apiUploadAvatar(file);
    if (error) {
      setAvatarMsg(error);
      return;
    }
    if (data) setUser(data);
    setAvatarPickerOpen(false);
  };

  const loadMyGames = (me: ApiUser) => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 60);
    apiGames(isoDate(from), isoDate(to)).then((list) => {
      const all = list ?? [];
      setMyGames(all.filter((g) => g.my_booking_status !== null));
      setMasteredGames(all.filter((g) => g.master_id === me.id));
    });
  };

  // форма — производная от сессии: пересобираем при смене пользователя
  const [profileFor, setProfileFor] = useState<string | null>(null);
  if (user && profileFor !== user.id) {
    setProfileFor(user.id);
    setProfile({
      name: user.name,
      email: user.email ?? "",
      phone: user.phone ?? "",
      telegram: user.telegram ?? "",
    });
  }

  useEffect(() => {
    if (!user) return;
    loadMyGames(user);
    apiQuests().then((list) =>
      setMyQuests((list ?? []).filter((q) => q.my_status && q.my_status !== "completed"))
    );
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    const payload: Parameters<typeof apiUpdateMe>[0] = {
      name: profile.name.trim(),
      phone: profile.phone.trim() || null,
      telegram: profile.telegram.trim().replace(/^@/, ""),
    };
    const email = profile.email.trim();
    if (email) payload.email = email; // пустой email не отправляем (он необязателен)
    const { data, error } = await apiUpdateMe(payload);
    if (error) {
      setProfileMsg({ text: error, ok: false });
      return;
    }
    if (data) setUser(data);
    setProfileMsg({ text: "Сохранено", ok: true });
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    if (pwd.next.length < 6) {
      setPwdMsg({ text: "Новый пароль — минимум 6 символов", ok: false });
      return;
    }
    if (pwd.next !== pwd.repeat) {
      setPwdMsg({ text: "Пароли не совпадают", ok: false });
      return;
    }
    const { error } = await apiChangePassword(pwd.current, pwd.next);
    if (error) {
      setPwdMsg({ text: error, ok: false });
      return;
    }
    setPwd({ current: "", next: "", repeat: "" });
    setPwdMsg({ text: "Пароль изменён", ok: true });
  };

  return (
    <div className="p-2 sm:p-4">

        {!loaded && <p className="text-[#9a8b75]">Загрузка…</p>}
        {loaded && !user && (
          <p className="text-[#cfc2ab]">
            Нужно войти. <a href="/login" className="text-[#e3a83e] underline">Страница входа</a>
          </p>
        )}

        {user && (
          <div className="grid gap-4 md:grid-cols-[200px_1fr_220px] xl:grid-cols-[240px_1fr_280px]">
            <div className="space-y-4">
              <div className="parchment p-4 text-center">
                <UserAvatar
                  avatar={user.avatar}
                  name={user.name}
                  className="mx-auto aspect-square w-full max-w-[190px] !rounded-full border-2 border-[#33291c] text-7xl shadow-inner"
                />
                <h2 className="mt-3 text-lg font-bold tavern-ink">{user.name}</h2>
                {user.telegram && <p className="text-xs tavern-soft">@{user.telegram}</p>}
                <button
                  type="button"
                  onClick={() => setAvatarPickerOpen((v) => !v)}
                  className="btn-brown mt-3 text-xs"
                >
                  Сменить аватар
                </button>
                {avatarPickerOpen && (
                  <>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {PORTRAITS.map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => pickAvatar(portraitKey(id))}
                          className={`aspect-square overflow-hidden rounded-full border-2 bg-cover bg-center transition hover:border-[#d3a24a]/60 ${
                            user.avatar === portraitKey(id)
                              ? "border-[#d3a24a] ring-2 ring-[#d3a24a]/40"
                              : "border-[#262018]"
                          }`}
                          style={{ backgroundImage: `url(/avatars/${id}.webp)` }}
                          title={label}
                          aria-label={`Аватар: ${label}`}
                        />
                      ))}
                    </div>
                    <label className="btn-gold mt-3 w-full cursor-pointer text-xs">
                      Загрузить свой файл
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => uploadAvatar(e.target.files?.[0])}
                      />
                    </label>
                    <p className="mt-1 text-[10px] tavern-soft">
                      JPG/PNG/WebP до 3 МБ, обрежется в квадрат
                    </p>
                  </>
                )}
                {avatarMsg && <p className="mt-2 text-sm font-bold text-[#e79b8f]">{avatarMsg}</p>}
              </div>

              <div className="parchment p-4">
                <span className="chip chip-purple mb-2">Титулы</span>
                {user.title ? (
                  <ul className="space-y-1.5">
                    <li className="rounded-md border-2 border-[#262018] bg-[#171009]/60 px-3 py-1.5 text-sm font-bold italic text-[#d3a24a]">
                      ✦ {user.title}
                    </li>
                  </ul>
                ) : (
                  <p className="text-sm tavern-soft">
                    Пока без титулов — их выдаёт таверна за заслуги за столом.
                  </p>
                )}
              </div>

              <div className="parchment p-4">
                <span className="chip chip-blue mb-2">Достижения</span>
                {/* заглушка до системы достижений */}
                <p className="text-sm tavern-soft">
                  Свитки достижений пока пусты. Сыграй первую партию — и здесь появится история твоих подвигов.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="parchment p-4">
                <span className="chip chip-gold mb-3">Игрок</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {/* заглушки до истории сессий и баланса */}
                  {[
                    ["Сессий", "—", "скоро"],
                    ["Персонажей", "—", "скоро"],
                    ["Баланс", "—", "₽ на счёте · скоро"],
                  ].map(([label, value, hint]) => (
                    <div key={label} className="flex items-center justify-between gap-2 rounded-md border-2 border-[#262018] bg-[#171009]/50 p-3 sm:block sm:text-center">
                      <p className="text-xs font-bold uppercase tracking-wide tavern-soft">{label}</p>
                      <p className="text-2xl font-bold tavern-ink">{value}</p>
                      <p className="text-[10px] tavern-soft">{hint}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <p><span className="tavern-soft">Имя:</span> <b>{user.name}</b></p>
                  <p><span className="tavern-soft">Телеграм:</span> <b>{user.telegram ? `@${user.telegram}` : "—"}</b></p>
                  <p><span className="tavern-soft">Email:</span> <b>{user.email ?? "—"}</b></p>
                  <p><span className="tavern-soft">Телефон:</span> <b>{user.phone ?? "—"}</b></p>
                </div>
              </div>

              <div className="parchment p-4">
                <span className="chip chip-green mb-3">Ближайшие игры</span>
                {myGames.length === 0 ? (
                  <p className="text-sm tavern-soft">Записей пока нет — выбери игру в расписании.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b-2 border-[#33291c] text-left text-xs uppercase tracking-wide tavern-soft">
                          <th className="p-2">Дата</th>
                          <th className="p-2">Кампания</th>
                          <th className="p-2">Мастер</th>
                          <th className="p-2">Статус</th>
                          <th className="p-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {myGames.map((g) => {
                          const chip = BOOKING_CHIP[g.my_booking_status ?? "pending"];
                          return (
                            <tr key={g.id} className="border-t border-[#262018]">
                              <td className="p-2 whitespace-nowrap">
                                {new Date(g.starts_at).toLocaleString("ru-RU", {
                                  weekday: "short",
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                              <td className="p-2 font-bold">
                                <a href={`/g/${g.id}`} className="underline decoration-[#33291c] underline-offset-2 hover:text-[#d3a24a]">
                                  {g.title}
                                </a>
                              </td>
                              <td className="p-2">{g.master}</td>
                              <td className="p-2"><span className={chip.cls}>{chip.text}</span></td>
                              <td className="p-2 text-right">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiCancelBooking(g.id);
                                    loadMyGames(user);
                                  }}
                                  className="btn-danger px-2 py-1 text-xs"
                                >
                                  Отменить
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <span className="mt-3 flex gap-2">
                  <Link href="/games" className="btn-gold text-xs">Забронировать ещё</Link>
                  <Link href="/quests" className="btn-brown text-xs">Доска заданий</Link>
                </span>
              </div>

              {canManageGames(user) && (
                <div className="parchment p-4">
                  <span className="chip chip-orange mb-3">Мои игры как мастера</span>
                  {masteredGames.length === 0 ? (
                    <p className="text-sm tavern-soft">Ближайших игр нет — забронируй слот в расписании.</p>
                  ) : (
                    <div className="divide-y divide-[#262018]">
                      {masteredGames.map((g) => {
                        const st =
                          g.status === "approved"
                            ? { text: "Подтверждено", cls: "chip chip-green" }
                            : g.status === "pending"
                              ? { text: "Ожидание", cls: "chip chip-orange" }
                              : { text: "Отклонена", cls: "chip chip-red" };
                        return (
                          <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <div className="min-w-0">
                              <a href={`/g/${g.id}`} className="text-sm font-bold tavern-ink underline decoration-[#33291c] underline-offset-2">
                                {g.title}
                              </a>
                              <p className="text-xs tavern-soft">
                                {new Date(g.starts_at).toLocaleString("ru-RU", {
                                  weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                                })}{" "}
                                · за столом {g.seats_taken}/{g.seats_total}
                              </p>
                            </div>
                            <span className={st.cls}>{st.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <Link href="/games" className="btn-gold mt-3 text-xs">Заявки игроков — в расписании</Link>
                </div>
              )}

              <div className="parchment p-4">
                <span className="chip chip-purple mb-3">Мои персонажи</span>
                {/* заглушка до листов персонажей */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="grid size-14 place-items-center rounded-md border-2 border-dashed border-[#33291c] bg-[#171009]/40 text-2xl">
                    🎲
                  </div>
                  <p className="max-w-xs text-sm tavern-soft">
                    Хранилище персонажей готовится — скоро тут поселятся твои друиды и плуты.
                  </p>
                  <button type="button" disabled className="btn-gold text-xs" title="Скоро">
                    + Создать
                  </button>
                </div>
              </div>

              <form onSubmit={saveProfile} className="parchment space-y-3 p-4">
                <span className="chip chip-gold">Данные профиля</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="tavern-label">Имя</span>
                    <input
                      required
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className="tavern-input"
                    />
                  </label>
                  <label className="block">
                    <span className="tavern-label">Телеграм (основной логин)</span>
                    <input
                      required
                      placeholder="@username"
                      value={profile.telegram}
                      onChange={(e) => setProfile({ ...profile, telegram: e.target.value })}
                      className="tavern-input"
                    />
                  </label>
                  <label className="block">
                    <span className="tavern-label">Email (необязательно)</span>
                    <input
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      className="tavern-input"
                    />
                  </label>
                  <label className="block">
                    <span className="tavern-label">Телефон</span>
                    <input
                      type="tel"
                      placeholder="+7 900 000-00-00"
                      value={profile.phone}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      className="tavern-input"
                    />
                  </label>
                </div>
                {profileMsg && (
                  <p className={`text-sm font-bold ${profileMsg.ok ? "text-[#a5d493]" : "text-[#e79b8f]"}`}>
                    {profileMsg.text}
                  </p>
                )}
                <button type="submit" className="btn-gold">
                  <Save className="size-4" /> Сохранить
                </button>
              </form>

              <form onSubmit={savePassword} className="parchment space-y-3 p-4">
                <span className="chip chip-orange">
                  <KeyRound className="size-3" /> Смена пароля
                </span>
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    required
                    type="password"
                    placeholder="Текущий пароль"
                    autoComplete="current-password"
                    value={pwd.current}
                    onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
                    className="tavern-input"
                  />
                  <input
                    required
                    type="password"
                    placeholder="Новый (мин. 6)"
                    autoComplete="new-password"
                    value={pwd.next}
                    onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
                    className="tavern-input"
                  />
                  <input
                    required
                    type="password"
                    placeholder="Новый ещё раз"
                    autoComplete="new-password"
                    value={pwd.repeat}
                    onChange={(e) => setPwd({ ...pwd, repeat: e.target.value })}
                    className="tavern-input"
                  />
                </div>
                {pwdMsg && (
                  <p className={`text-sm font-bold ${pwdMsg.ok ? "text-[#a5d493]" : "text-[#e79b8f]"}`}>
                    {pwdMsg.text}
                  </p>
                )}
                <button type="submit" className="btn-brown">Изменить пароль</button>
              </form>
            </div>
            <div className="space-y-4">
              <div className="parchment p-4 text-center">
                <span className="chip chip-gold">Хвосты</span>
                {(() => {
                  const { level, next } = levelFromXp(user.xp);
                  const prev = XP_THRESHOLDS[level - 1];
                  const pct = next === null ? 100 : Math.round(((user.xp - prev) / (next - prev)) * 100);
                  return (
                    <>
                      <p className="mt-3 text-5xl font-bold leading-none text-[#d3a24a]">{level}</p>
                      <p className="text-sm font-bold tavern-ink">{tails(level)}</p>
                      <div className="mt-3 h-3 overflow-hidden rounded-full border-2 border-[#33291c] bg-[#16110d]">
                        <div
                          className="h-full bg-gradient-to-r from-[#e3a83e] to-[#d98a2b]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs tavern-soft">
                        {next === null
                          ? `${user.xp.toLocaleString("ru-RU")} опыта — предел хвостов`
                          : `${(next - user.xp).toLocaleString("ru-RU")} опыта до ${level + 1}-го хвоста`}
                      </p>
                      <p className="text-[10px] tavern-soft">
                        всего {user.xp.toLocaleString("ru-RU")}
                        {next !== null && ` / ${next.toLocaleString("ru-RU")}`}
                      </p>
                    </>
                  );
                })()}
              </div>

              <div className="parchment p-4">
                <span className="chip chip-blue mb-3">Текущие задания</span>
                {myQuests.length === 0 ? (
                  <p className="text-sm tavern-soft">Активных заданий нет — загляни на доску.</p>
                ) : (
                  <div className="divide-y divide-[#262018]">
                    {myQuests.map((q) => {
                      const st = QUEST_CHIP[q.my_status ?? "taken"];
                      return (
                        <div key={q.id} className="py-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-bold tavern-ink">{q.title}</p>
                            <span className="chip chip-green shrink-0">+{q.xp_reward}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            {q.my_status !== "taken" && <span className={st.cls}>{st.text}</span>}
                            {q.complete_conditions && <span className="text-[10px] tavern-soft">⚙ зачтётся само</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <Link href="/quests" className="btn-brown mt-3 w-full text-xs">Доска заданий</Link>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
