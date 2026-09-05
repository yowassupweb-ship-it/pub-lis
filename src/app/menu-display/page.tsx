"use client";

import { useEffect, useMemo, useState } from "react";

import { PRODUCT_TYPES } from "@/lib/productTypes";

type MenuIngredient = { id: string; typeId: string; amount: string };
type MenuPosition = {
  id: string;
  name: string;
  price: string;
  imageUrl: string;
  ingredients: MenuIngredient[];
};

const menuStorageKey = "hitry-lis-menu-positions";

function parseNumber(value: string) {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function getProductType(typeId: string) {
  return PRODUCT_TYPES.find((t) => t.id === typeId);
}

// Общий вес порции: складываем ингредиенты, чей склад мерится в кг/л, как граммы/мл 1:1
function totalWeight(ingredients: MenuIngredient[]) {
  return ingredients.reduce((sum, ingredient) => {
    const type = getProductType(ingredient.typeId);
    if (!type || (type.unit !== "кг" && type.unit !== "л")) return sum;
    return sum + parseNumber(ingredient.amount) * 1000;
  }, 0);
}

export default function MenuDisplay() {
  const [positions, setPositions] = useState<MenuPosition[]>([]);

  useEffect(() => {
    const load = () => {
      const raw = window.localStorage.getItem(menuStorageKey);
      if (raw) {
        try {
          setPositions(JSON.parse(raw) as MenuPosition[]);
        } catch {
          // игнорируем битые данные
        }
      }
    };
    load();
    window.addEventListener("storage", load);
    const timer = setInterval(load, 5000);
    return () => {
      window.removeEventListener("storage", load);
      clearInterval(timer);
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#111214] p-8 text-zinc-100">
      <h1 className="mb-8 text-center text-4xl font-bold tracking-tight">Меню</h1>
      {positions.length === 0 ? (
        <p className="text-center text-zinc-500">Меню пока пусто</p>
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 xl:grid-cols-4">
          {positions.map((position) => (
            <MenuCard key={position.id} position={position} />
          ))}
        </div>
      )}
    </main>
  );
}

function MenuCard({ position }: { position: MenuPosition }) {
  const weight = useMemo(() => totalWeight(position.ingredients), [position.ingredients]);
  const composition = position.ingredients
    .map((ingredient) => getProductType(ingredient.typeId)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-white/8 bg-[#1b1c20] shadow-xl shadow-black/30">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="h-40 w-full object-cover sm:h-48" src={position.imageUrl} alt="" />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="text-xl font-semibold leading-snug">{position.name}</p>
        {composition && <p className="text-sm text-zinc-400">{composition}</p>}
        <div className="mt-auto flex items-center justify-between pt-2">
          {weight > 0 && <span className="text-sm text-zinc-500">{Math.round(weight)} г</span>}
          <p className="ml-auto text-2xl font-bold text-amber-300">{formatMoney(parseNumber(position.price))}</p>
        </div>
      </div>
    </div>
  );
}
