export class LLURI {
  public readonly uri: string;

  constructor(uri?: string) {
    this.uri = uri || '';
  }

  public asString(): string {
    return this.uri;
  }

  public toString(): string {
    return this.uri;
  }
}
