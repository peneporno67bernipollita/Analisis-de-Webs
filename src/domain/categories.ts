/**
 * Catálogo de categorías de negocio canónicas y su correspondencia con cada proveedor.
 * - google: textos de búsqueda por idioma + tipos de Places API (New) para filtrar.
 * - osm: filtros de etiquetas de OpenStreetMap para Overpass.
 * - needsBooking / needsMenu: se usan como INFERENCIA (siempre marcada como tal) para
 *   detectar necesidades digitales típicas de la categoría.
 */

export interface BusinessCategory {
  key: string;
  label: { es: string; en: string };
  googleQuery: { es: string; en: string };
  googleTypes: string[];
  osm: string[]; // fragmentos de filtro Overpass: '["amenity"~"^(restaurant|fast_food)$"]'
  needsBooking: boolean;
  needsMenu: boolean;
}

export const CATEGORIES: BusinessCategory[] = [
  {
    key: "restaurantes",
    label: { es: "Restaurantes", en: "Restaurants" },
    googleQuery: { es: "restaurantes", en: "restaurants" },
    googleTypes: ["restaurant", "meal_takeaway", "fast_food_restaurant"],
    osm: ['["amenity"~"^(restaurant|fast_food)$"]'],
    needsBooking: true,
    needsMenu: true,
  },
  {
    key: "bares_cafeterias",
    label: { es: "Bares y cafeterías", en: "Bars & cafés" },
    googleQuery: { es: "bares y cafeterías", en: "bars and cafes" },
    googleTypes: ["bar", "cafe", "coffee_shop", "pub"],
    osm: ['["amenity"~"^(bar|cafe|pub)$"]'],
    needsBooking: false,
    needsMenu: true,
  },
  {
    key: "peluquerias_estetica",
    label: { es: "Peluquerías y estética", en: "Hair & beauty" },
    googleQuery: { es: "peluquerías y centros de estética", en: "hair salons and beauty salons" },
    googleTypes: ["hair_salon", "beauty_salon", "barber_shop", "nail_salon", "hair_care"],
    osm: ['["shop"~"^(hairdresser|beauty)$"]'],
    needsBooking: true,
    needsMenu: false,
  },
  {
    key: "gimnasios",
    label: { es: "Gimnasios", en: "Gyms" },
    googleQuery: { es: "gimnasios", en: "gyms" },
    googleTypes: ["gym", "fitness_center", "yoga_studio"],
    osm: ['["leisure"~"^(fitness_centre|sports_centre)$"]'],
    needsBooking: true,
    needsMenu: false,
  },
  {
    key: "clinicas",
    label: { es: "Clínicas y salud", en: "Clinics & health" },
    googleQuery: { es: "clínicas dentales fisioterapia", en: "dental clinics physiotherapy" },
    googleTypes: ["dentist", "dental_clinic", "doctor", "physiotherapist", "medical_clinic", "chiropractor"],
    osm: ['["amenity"~"^(dentist|clinic|doctors)$"]', '["healthcare"~"^(physiotherapist|dentist|clinic)$"]'],
    needsBooking: true,
    needsMenu: false,
  },
  {
    key: "talleres",
    label: { es: "Talleres", en: "Car repair" },
    googleQuery: { es: "talleres mecánicos", en: "car repair shops" },
    googleTypes: ["car_repair", "car_wash", "auto_parts_store"],
    osm: ['["shop"~"^(car_repair|tyres|car_parts)$"]'],
    needsBooking: true,
    needsMenu: false,
  },
  {
    key: "tiendas",
    label: { es: "Tiendas", en: "Shops" },
    googleQuery: { es: "tiendas", en: "shops" },
    googleTypes: [
      "store",
      "clothing_store",
      "shoe_store",
      "gift_shop",
      "furniture_store",
      "jewelry_store",
      "florist",
    ],
    osm: [
      '["shop"~"^(clothes|shoes|gift|furniture|jewelry|florist|boutique|books|toys|sports|optician|bakery|butcher|deli)$"]',
    ],
    needsBooking: false,
    needsMenu: false,
  },
  {
    key: "abogados_asesorias",
    label: { es: "Abogados y asesorías", en: "Lawyers & advisors" },
    googleQuery: { es: "abogados y asesorías", en: "lawyers and accountants" },
    googleTypes: ["lawyer", "accounting", "insurance_agency"],
    osm: ['["office"~"^(lawyer|accountant|tax_advisor|notary|insurance)$"]'],
    needsBooking: true,
    needsMenu: false,
  },
  {
    key: "alojamientos",
    label: { es: "Alojamientos", en: "Lodging" },
    googleQuery: { es: "hoteles y alojamientos", en: "hotels and lodging" },
    googleTypes: ["lodging", "hotel", "hostel", "bed_and_breakfast", "guest_house"],
    osm: ['["tourism"~"^(hotel|guest_house|hostel|apartment|motel)$"]'],
    needsBooking: true,
    needsMenu: false,
  },
  {
    key: "inmobiliarias",
    label: { es: "Inmobiliarias", en: "Real estate" },
    googleQuery: { es: "inmobiliarias", en: "real estate agencies" },
    googleTypes: ["real_estate_agency"],
    osm: ['["office"="estate_agent"]'],
    needsBooking: false,
    needsMenu: false,
  },
  {
    key: "veterinarios",
    label: { es: "Veterinarios", en: "Veterinarians" },
    googleQuery: { es: "veterinarios", en: "veterinarians" },
    googleTypes: ["veterinary_care"],
    osm: ['["amenity"="veterinary"]'],
    needsBooking: true,
    needsMenu: false,
  },
  {
    key: "autoescuelas",
    label: { es: "Autoescuelas y academias", en: "Driving schools & academies" },
    googleQuery: { es: "autoescuelas y academias", en: "driving schools and academies" },
    googleTypes: ["driving_school", "school"],
    osm: ['["amenity"~"^(driving_school|language_school|music_school)$"]'],
    needsBooking: false,
    needsMenu: false,
  },
];

export const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

/** Intenta asignar una categoría canónica a partir de los tipos del proveedor. */
export function inferCategoryKey(types: string[], hintKey?: string): string | undefined {
  if (hintKey && CATEGORY_BY_KEY.has(hintKey)) return hintKey;
  for (const c of CATEGORIES) {
    if (types.some((t) => c.googleTypes.includes(t))) return c.key;
  }
  return undefined;
}

export function categoryLabel(key: string | null | undefined, lang: "es" | "en" = "es"): string {
  if (!key) return "Sin categoría";
  return CATEGORY_BY_KEY.get(key)?.label[lang] ?? key;
}
