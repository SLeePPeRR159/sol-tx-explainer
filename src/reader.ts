export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/** Bounds-checked cursor over a byte array. */
export class ByteReader {
  readonly bytes: Uint8Array;
  offset = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  remaining(): number {
    return this.bytes.length - this.offset;
  }

  u8(): number {
    if (this.remaining() < 1) throw new ParseError('unexpected end of data');
    return this.bytes[this.offset++];
  }

  take(n: number): Uint8Array {
    if (n < 0 || this.remaining() < n) throw new ParseError('unexpected end of data');
    const out = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  /** Solana "compact-u16" (shortvec) length prefix. */
  compactU16(): number {
    let value = 0;
    for (let i = 0; i < 3; i++) {
      const b = this.u8();
      value |= (b & 0x7f) << (7 * i);
      if ((b & 0x80) === 0) return value;
    }
    throw new ParseError('invalid compact-u16 length');
  }
}
