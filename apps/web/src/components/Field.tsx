/** Campo de formulario con etiqueta visible y mensaje de error asociado. */
export function Field({
  id,
  label,
  error,
  hint,
  ...input
}: { id: string; label: string; error?: string | undefined; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const described = [hint ? `${id}-ayuda` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        className="rounded-xl border-2 border-linea bg-superficie px-4 py-3 text-marino placeholder:text-tinta-suave/70 aria-invalid:border-error"
        {...input}
      />
      {hint ? (
        <p id={`${id}-ayuda`} className="text-sm text-tinta-suave">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-bold text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
