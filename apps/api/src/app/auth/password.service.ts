import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = (await scryptAsync(password, salt, 64)) as Buffer;
    return `scrypt:${salt.toString('base64url')}:${derived.toString('base64url')}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const [algorithm, encodedSalt, encodedHash] = storedHash.split(':');
    if (algorithm !== 'scrypt' || !encodedSalt || !encodedHash) return false;
    const expected = Buffer.from(encodedHash, 'base64url');
    const actual = (await scryptAsync(
      password,
      Buffer.from(encodedSalt, 'base64url'),
      expected.length,
    )) as Buffer;
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}
