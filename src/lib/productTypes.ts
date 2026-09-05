export type ProductType = { id: string; name: string; unit: string };

// Общий справочник складских типов — общий для CRM (/staff) и экранов
// /menu-display, /chef-display, чтобы состав позиций отображался одинаково.
export const PRODUCT_TYPES: ProductType[] = [
  { id: "type-burger-bun", name: "Булочка бургерная", unit: "шт" },
  { id: "type-bacon", name: "Бекон", unit: "кг" },
  { id: "type-cheese-sauce", name: "Соус сырный", unit: "кг" },
  { id: "type-bbq-sauce", name: "Соус BBQ", unit: "кг" },
  { id: "type-garlic-sauce", name: "Соус чесночный", unit: "кг" },
  { id: "type-mustard-sauce", name: "Соус горчичный", unit: "кг" },
  { id: "type-caesar-sauce", name: "Соус цезарь", unit: "кг" },
  { id: "type-dried-onion", name: "Лук сушеный", unit: "кг" },
  { id: "type-onion-rings", name: "Луковые кольца", unit: "кг" },
  { id: "type-fries", name: "Картофель фри", unit: "кг" },
  { id: "type-potato-wedges", name: "Картофельные дольки", unit: "кг" },
  { id: "type-fish-sticks", name: "Рыбные палочки", unit: "кг" },
  { id: "type-calamari", name: "Кольца кальмара", unit: "кг" },
  { id: "type-chicken-wings", name: "Куриные крылья", unit: "кг" },
  { id: "type-pickled-cucumber", name: "Огурец маринованный", unit: "кг" },
  { id: "type-draft-lager", name: "Пиво лагер разливное", unit: "л" },
  { id: "type-draft-ipa", name: "Пиво IPA разливное", unit: "л" },
  { id: "type-draft-stout", name: "Пиво стаут разливное", unit: "л" },
  { id: "type-plastic-bottle-05", name: "Бутылка пластиковая 0.5", unit: "шт" },
  { id: "type-misc", name: "Другое", unit: "шт" },
];
