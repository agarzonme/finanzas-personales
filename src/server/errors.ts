/** Error con un mensaje pensado para mostrarse tal cual en pantalla. */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}
