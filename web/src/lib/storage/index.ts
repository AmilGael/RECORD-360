import { LocalDiskStorage } from "./local";
import type { Storage } from "./types";
// Swap this single line for S3Storage later.
export const storage: Storage = new LocalDiskStorage();
