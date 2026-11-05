/** Mensaje en español para cada código de error al insertar en pattern_reports. */
export function reportErrorMessage(code: string | undefined): string {
  switch (code) {
    case "23505":
      return "Ya denunciaste este patrón.";
    case "54000":
      return "Llegaste al tope de 20 denuncias en 24 horas. Vuelve a intentarlo mañana.";
    case "42501":
      return "No es posible denunciar este patrón.";
    default:
      return "No pudimos enviar la denuncia. Revisa tu conexión e intenta de nuevo.";
  }
}
