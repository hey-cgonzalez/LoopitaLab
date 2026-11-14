/*
 * Zona horaria fija para formatear fechas. El servidor corre en UTC y el navegador en la hora local: sin una zona fija, una
 * fecha cerca de la medianoche se formatea distinto en cada lado y React falla al hidratar (error #418). La app es chilena.
 */
export const APP_TIME_ZONE = "America/Santiago";
