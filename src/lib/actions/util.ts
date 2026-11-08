import { z } from "zod";

/** Result of a server action as seen by a form: success, a general error, or per-field messages. */
export type ActionState = { ok?: boolean; error?: string; fields?: Record<string, string> };

export const NO_ACCESS = "Недостаточно прав для этого действия";

/** Validates input; on failure returns the first message per field, ready to show under the inputs. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): { data: z.output<S> } | { state: ActionState } {
  const r = schema.safeParse(input);
  if (r.success) return { data: r.data };
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) fields[String(issue.path[0] ?? "_")] ??= issue.message;
  return { state: { error: "Проверьте выделенные поля", fields } };
}

/** Translates a PostgREST/Postgres error into a message for the user. Unknown errors are logged, not shown. */
export function dbError(e: { code?: string; message?: string }): ActionState {
  if (e.code === "42501" || e.message?.includes("row-level security")) return { error: NO_ACCESS };
  if (e.code === "23P01") return { error: "Это время у специалиста уже занято другой записью" };
  if (e.code === "23503") return { error: "Нельзя выполнить действие: запись связана с другими данными" };
  if (e.code === "23505") return { error: "Такая запись уже существует" };
  if (e.code === "23514" || e.code === "22P02" || e.code === "22007") return { error: "Некорректные данные" };
  // Our own RAISE EXCEPTION messages (booking rules) are written for users.
  if (e.code === "P0001" && e.message) return { error: e.message };
  console.error("db error", e.code, e.message);
  return { error: "Не удалось сохранить изменения. Попробуйте ещё раз" };
}

/** Text value of a form field ("" when absent). */
export const str = (fd: FormData, key: string) => String(fd.get(key) ?? "");
