export interface Storage {
  put(file: { buffer: Buffer; filename: string; contentType: string }): Promise<{ url: string; key: string }>;
  get(key: string): Promise<NodeJS.ReadableStream>;
  /** Presign a browser PUT directly to the backing store, bypassing the server
   *  (and its platform body-size ceiling). Optional: local-disk storage can't
   *  presign, and callers fall back to the server-action upload path. */
  presignPut?(opts: { contentType: string; size: number }): Promise<{ url: string; key: string }>;
}
