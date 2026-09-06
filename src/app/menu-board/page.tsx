import { Handjet } from "next/font/google";

// Статичная витрина меню в пиксель-артном стиле таверны — фон-картинка на
// весь экран, поверх дощечки с разделами/позициями. Позиции пока
// захардкожены (см. MENU ниже); когда меню стабилизируется, эту витрину
// можно будет подключить к apiPublicMenuPositions() так же, как /menu-display.

const pixelFont = Handjet({ subsets: ["latin", "cyrillic"], weight: "700" });
// Заголовки разделов ("ПИВО"/"ЗАКУСКИ") — максимальная жирность Handjet.
const categoryFont = Handjet({ subsets: ["latin", "cyrillic"], weight: "900" });

const MENU: { title: string; items: { name: string; price: number }[] }[] = [
  {
    title: "ПИВО",
    items: [
      { name: "Лаггер", price: 300 },
      { name: "Хеллес", price: 300 },
      { name: "Отличный урожай", price: 350 },
      { name: "Рыжая Соня", price: 400 },
      { name: "Портер", price: 350 },
      { name: "Пшеничное", price: 350 },
    ],
  },
  {
    title: "ЗАКУСКИ",
    items: [
      { name: "Луковые кольца", price: 350 },
      { name: "Картофель по-деревенски", price: 300 },
      { name: "Кольца кальмара", price: 600 },
      { name: "Гренки", price: 300 },
    ],
  },
];

const BG_FRAMES = ["/menu/bg.png", "/menu/bg2.png", "/menu/bg3.png", "/menu/bg4.png", "/menu/bg5.png"];

const woodTextStyle = {
  // em, не px — тень масштабируется вместе с font-size (он в vw). Без блюра:
  // на мелком тексте (названия/цена) размытая тень заливала градиент почти
  // в чёрный — для пиксель-арта чёткая жёсткая тень и правильнее по стилю.
  textShadow: "0.07em 0.07em 0 rgba(0,0,0,0.9), 0.03em 0.03em 0 rgba(0,0,0,0.9)",
  color: "#E3AC63",
};

// Градация размера названия позиции: короткое — крупнее и заметнее,
// длинное — мельче, чтобы уместиться на дощечке без переноса.
function nameSizeClass(name: string) {
  if (name.length <= 10) return "text-[5.3vw] sm:text-[4vw] xl:text-[3.1vw]";
  if (name.length <= 16) return "text-[4.6vw] sm:text-[3.5vw] xl:text-[2.7vw]";
  if (name.length <= 20) return "text-[3.9vw] sm:text-[2.9vw] xl:text-[2.3vw]";
  return "text-[3.6vw] sm:text-[2.7vw] xl:text-[2.1vw]";
}

function LogoPlank() {
  return (
    <div
      className="relative flex aspect-[1347/208] w-full items-center justify-center bg-contain bg-center bg-no-repeat"
      style={{ backgroundImage: "url(/menu/logo-plank.png)" }}
    />
  );
}

function CategoryPlank({ text }: { text: string }) {
  return (
    <div
      className="relative flex aspect-[641/214] w-[88%] items-center justify-center bg-contain bg-center bg-no-repeat"
      style={{ backgroundImage: "url(/menu/title-plank.png)" }}
    >
      <span
        className={`text-[7.4vw] tracking-[-0.02em] sm:text-[5.6vw] xl:text-[4.4vw] ${categoryFont.className}`}
        style={{ ...woodTextStyle, transform: "translateY(calc(12% - 5px))" }}
      >
        {text}
      </span>
    </div>
  );
}

function ItemPlank({ name, price }: { name: string; price: number }) {
  return (
    <div
      className="relative flex aspect-[656/106] w-full items-center justify-between bg-contain bg-center bg-no-repeat px-[6%]"
      style={{ backgroundImage: "url(/menu/item-plank.png)" }}
    >
      <span className={`truncate pl-[7px] tracking-[-0.02em] ${nameSizeClass(name)}`} style={woodTextStyle}>
        {name}
      </span>
      <span
        className="shrink-0 pl-3 text-[4.6vw] tracking-[-0.02em] sm:text-[3.5vw] xl:text-[2.7vw]"
        style={{ ...woodTextStyle, transform: "translateX(-13px)" }}
      >
        {price}₽
      </span>
    </div>
  );
}

export default function MenuBoard() {
  return (
    <main className={`relative min-h-screen w-full overflow-hidden bg-black ${pixelFont.className}`}>
      {BG_FRAMES.map((src, i) => (
        <div
          key={src}
          className="menu-board-bg-layer absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${src})`, animationDelay: `${i * 1.8}s` }}
        />
      ))}

      <div className="absolute left-1/2 top-[1%] z-10 w-[70%]" style={{ transform: "translate(-50%, -34px)" }}>
        <LogoPlank />
      </div>

      <div className="absolute inset-x-[15%] top-[16%] bottom-[4%] z-10 grid grid-cols-2 gap-[3%]">
        {MENU.map((section) => (
          <div key={section.title} className="flex flex-col items-center gap-[0.05%]">
            <CategoryPlank text={section.title} />
            <div className="flex w-full flex-col gap-[0.25%]">
              {section.items.map((item) => (
                <ItemPlank key={item.name} name={item.name} price={item.price} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
