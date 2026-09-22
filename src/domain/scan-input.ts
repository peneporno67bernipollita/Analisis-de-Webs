import { z } from "zod";

/** Validación de la entrada de un escaneo (compartida por API, UI y CLI). */
export const ScanInputSchema = z.object({
  city: z.string().trim().min(2, "Indica una ciudad").max(80),
  region: z.string().trim().max(80).optional().or(z.literal("")),
  country: z.string().trim().min(2, "Indica un país").max(60),
  radiusKm: z.coerce.number().min(0.5, "Radio mínimo 0,5 km").max(50, "Radio máximo 50 km"),
  categories: z
    .array(
      z
        .string()
        .trim()
        .min(2)
        .max(60)
        .regex(/^[\p{L}\p{N} _.,&'-]+$/u, "Categoría con caracteres no válidos"),
    )
    .max(15)
    .default([]),
  allCategories: z.coerce.boolean().default(false),
  maxResults: z.coerce.number().int().min(1).max(500).default(60),
  language: z.enum(["es", "en"]).default("es"),
  provider: z.enum(["google", "osm"]).optional(),
});

export type ScanInput = z.infer<typeof ScanInputSchema>;
