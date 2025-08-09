// Polyfill for Node.js 18 compatibility with File API
import { Readable } from 'stream';

// Add global declarations for Node.js 18
if (typeof global === 'object') {
  // File polyfill
  if (!global.File) {
    global.File = class File extends Blob {
      private _name: string;
      private _lastModified: number;

      constructor(fileBits: any[], fileName: string, options?: any) {
        super(fileBits, options);
        this._name = fileName;
        this._lastModified = options?.lastModified || Date.now();
      }

      get name() {
        return this._name;
      }

      get lastModified() {
        return this._lastModified;
      }
    } as any;
  }

  // FormData polyfill if needed
  if (!global.FormData) {
    const formDataSymbol = Symbol('FormData');
    
    global.FormData = class FormData {
      private [formDataSymbol]: Array<[string, string | File]> = [];

      append(name: string, value: string | File) {
        this[formDataSymbol].push([name, value]);
      }

      get(name: string) {
        const entry = this[formDataSymbol].find(([key]) => key === name);
        return entry ? entry[1] : null;
      }

      getAll(name: string) {
        return this[formDataSymbol].filter(([key]) => key === name).map(([, value]) => value);
      }

      *entries() {
        yield* this[formDataSymbol];
      }

      *keys() {
        for (const [key] of this[formDataSymbol]) {
          yield key;
        }
      }

      *values() {
        for (const [, value] of this[formDataSymbol]) {
          yield value;
        }
      }

      [Symbol.iterator]() {
        return this.entries();
      }
    } as any;
  }

  // Ensure Blob exists
  if (!global.Blob) {
    global.Blob = class Blob {
      private _parts: any[];
      private _type: string;

      constructor(blobParts: any[], options?: any) {
        this._parts = blobParts || [];
        this._type = options?.type || '';
      }

      get type() {
        return this._type;
      }

      size() {
        return this._parts.reduce((acc, part) => acc + (part.length || part.size || 0), 0);
      }

      slice(start?: number, end?: number, contentType?: string) {
        const slicedParts = this._parts.slice(start || 0, end);
        return new Blob(slicedParts, { type: contentType || this._type });
      }

      async arrayBuffer() {
        const chunks = this._parts.map(part => 
          part instanceof ArrayBuffer ? part : Buffer.from(part)
        );
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
        const result = new ArrayBuffer(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          new Uint8Array(result).set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }
        return result;
      }

      async text() {
        const arrayBuffer = await this.arrayBuffer();
        return new TextDecoder().decode(arrayBuffer);
      }

      stream() {
        return Readable.from(this._parts);
      }
    } as any;
  }
}