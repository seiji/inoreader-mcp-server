export class InoreaderClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InoreaderClientError";
  }
}

export class AuthenticationError extends InoreaderClientError {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}
