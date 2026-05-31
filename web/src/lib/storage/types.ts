export interface Storage {
  put(file: { buffer: Buffer; filename: string; contentType: string }): Promise<{ url: string; key: string }>;
  get(key: string): Promise<NodeJS.ReadableStream>;
}
