import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export class AdminPasswordService {
    public static isHash(value: string): boolean {
        return /^scrypt\$v1\$[0-9a-f]{32}\$[0-9a-f]{128}$/i.test(value);
    }

    public static async hash(password: string): Promise<string> {
        const salt = randomBytes(16);
        const derived = await scrypt(password, salt, 64) as Buffer;
        return `scrypt$v1$${salt.toString("hex")}$${derived.toString("hex")}`;
    }

    public static async verify(password: string, encodedHash: string): Promise<boolean> {
        if (!this.isHash(encodedHash)) return false;
        const [, , saltHex, hashHex] = encodedHash.split("$");
        const expected = Buffer.from(hashHex, "hex");
        const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length) as Buffer;
        return actual.length === expected.length && timingSafeEqual(actual, expected);
    }
}