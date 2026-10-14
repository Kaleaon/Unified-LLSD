export class LLDate {
  public readonly secondsSinceEpoch: number;

  public static readonly nullDate = new LLDate(0);

  constructor(secondsOrIso?: number | string) {
    if (typeof secondsOrIso === "number") {
      this.secondsSinceEpoch = secondsOrIso;
    } else if (typeof secondsOrIso === "string" && secondsOrIso.length > 0) {
      const dt = new Date(secondsOrIso);
      this.secondsSinceEpoch = isNaN(dt.getTime()) ? 0 : dt.getTime() / 1000.0;
    } else {
      this.secondsSinceEpoch = 0;
    }
  }

  public get isNull(): boolean {
    return this.secondsSinceEpoch === 0;
  }

  public get notNull(): boolean {
    return !this.isNull;
  }

  public toISOString(): string {
    const dt = new Date(this.secondsSinceEpoch * 1000.0);
    return dt.toISOString();
  }

  public toString(): string {
    return this.toISOString();
  }
}
