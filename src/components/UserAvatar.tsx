/**
 * Аватар пользователя. В поле avatar может лежать три вещи:
 *   "p:rogue"                 — портрет из набора Норы (public/avatars)
 *   "/api/media/avatars/…"    — файл, который игрок загрузил сам
 *   "🧙"                      — старый эмодзи-пресет, оставлен для совместимости
 * Поле на бэке ограничено 16 символами, поэтому портреты хранятся ключом,
 * а не путём к файлу.
 */

export const PORTRAITS = [
  ["warrior", "Воин"],
  ["ranger", "Следопыт"],
  ["dwarf", "Дварф"],
  ["warlock", "Колдунья"],
  ["rogue", "Плут"],
  ["orc", "Орк"],
  ["mage", "Волшебник"],
  ["dragonborn", "Драконорождённый"],
  ["bard", "Бард"],
] as const;

export type PortraitId = (typeof PORTRAITS)[number][0];

export const PORTRAIT_PREFIX = "p:";

export const portraitKey = (id: PortraitId) => `${PORTRAIT_PREFIX}${id}`;

export const portraitSrc = (avatar: string) => `/avatars/${avatar.slice(PORTRAIT_PREFIX.length)}.webp`;

const isPortrait = (avatar: string | null | undefined): avatar is string =>
  !!avatar && avatar.startsWith(PORTRAIT_PREFIX);

const isUpload = (avatar: string | null | undefined): avatar is string =>
  !!avatar && avatar.startsWith("/");

/** Ровно та картинка, что стоит у игрока; className задаёт размер и форму. */
export function UserAvatar({
  avatar,
  name,
  className = "",
}: {
  avatar: string | null | undefined;
  name?: string;
  className?: string;
}) {
  const base = `grid shrink-0 place-items-center overflow-hidden rounded-full border border-[#33291c] bg-[#16110d] ${className}`;

  if (isPortrait(avatar)) {
    return (
      <span
        className={`${base} bg-cover bg-center`}
        style={{ backgroundImage: `url(${portraitSrc(avatar)})` }}
        role="img"
        aria-label={name ? `Аватар: ${name}` : "Аватар"}
      />
    );
  }

  if (isUpload(avatar)) {
    return (
      <span className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt={name ? `Аватар: ${name}` : ""} className="h-full w-full object-cover" />
      </span>
    );
  }

  return <span className={base}>{avatar ?? "🧙"}</span>;
}
