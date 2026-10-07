export class LLDate {
    public readonly date: Date;

    public static readonly nullDate = new LLDate(0);

    constructor(dateInput?: Date | string | number) {
        if (dateInput instanceof Date) {
            this.date = dateInput;
        } else if (typeof dateInput === 'number') {
            this.date = new Date(dateInput * 1000);
        } else if (typeof dateInput === 'string') {
            this.date = new Date(dateInput);
        } else {
            this.date = new Date();
        }
    }

    public toISOString(): string {
        return this.date.toISOString();
    }

    public get secondsSinceEpoch(): number {
        return this.date.getTime() / 1000.0;
    }

    public getSecondsSinceEpoch(): number {
        return this.date.getTime() / 1000.0;
    }

    public isNull(): boolean {
        return this.date.getTime() === 0;
    }
}

export { LLDate as LLSDDate };
