/**
 * Обложки-пейзажи для карточек игр, хроник и новостей.
 *
 * Своей картинки у игры пока нет, поэтому пейзаж подбираем по названию: в
 * «Проклятии Драконьего Пика» будет вулкан, в «Тенях под Глубоководьем» — ночной
 * город. Если ничего не совпало, берём стабильный по id — чтобы одна и та же игра
 * не меняла обложку при каждой перерисовке.
 */

export const COVER_KINDS = [
  "castle",
  "cavern",
  "volcano",
  "forest",
  "frost",
  "ruins",
  "city",
  "desert",
  "skyrealm",
] as const;

export type CoverKind = (typeof COVER_KINDS)[number];

const KEYWORDS: Array<[CoverKind, RegExp]> = [
  ["volcano", /дракон|виверн|пик|пламен|огн|вулкан|лав|пепел|ящер|dragon|fire/i],
  ["frost", /зим|снег|лёд|лед|мороз|стуж|север|иней|frost|ice|snow/i],
  ["cavern", /подземел|склеп|пещер|шахт|катакомб|темниц|глубин|курган|dungeon|cave/i],
  ["skyrealm", /неб[ео]|остров|паря|облак|высь|полёт|ветр|sky|cloud/i],
  ["desert", /пустын|песк|бархан|зно|караван|солнц|юг|desert|sand/i],
  ["ruins", /руин|развалин|забыт|затерян|древн|храм|обелиск|ruins|lost/i],
  ["castle", /замок|крепост|цитадел|башн|шпил|королев|двор|castle|tower/i],
  ["city", /город|глубоководь|врата|переул|тен[ьи]|улиц|квартал|воры|city/i],
  ["forest", /лес|чащ|роща|друид|дорог|тракт|земл|болот|forest|wild/i],
];

/** Стабильный разброс: одинаковая строка всегда даёт одну и ту же сцену. */
function hashPick(seed: string): CoverKind {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return COVER_KINDS[Math.abs(h) % COVER_KINDS.length];
}

export function pickCover(text: string, seed = ""): CoverKind {
  const found = KEYWORDS.find(([, re]) => re.test(text));
  return found ? found[0] : hashPick(seed || text);
}

export function SceneCover({
  kind,
  text,
  seed,
  className = "",
  as: Tag = "span",
  children,
}: {
  /** Явная сцена; если не задана — подбираем по text и seed */
  kind?: CoverKind;
  text?: string;
  seed?: string;
  className?: string;
  /** span по умолчанию — обложка часто лежит внутри ссылки; div, если внутри заголовки */
  as?: "span" | "div";
  children?: React.ReactNode;
}) {
  const chosen = kind ?? pickCover(text ?? "", seed);
  return (
    <Tag
      className={`relative block overflow-hidden bg-cover bg-center ${className}`}
      style={{ backgroundImage: `url(/covers/${chosen}.webp)` }}
    >
      {/* затемнение снизу: по нему идёт текст карточки */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      {children}
    </Tag>
  );
}
