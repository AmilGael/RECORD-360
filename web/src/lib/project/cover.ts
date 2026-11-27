export type CoverModel = { kind: "image"; src: string } | { kind: "placeholder" };

/** What a project cover renders: the stored image, or the designed placeholder. */
export function coverModel(coverImageKey: string | null | undefined): CoverModel {
  if (!coverImageKey) return { kind: "placeholder" };
  return { kind: "image", src: `/api/media/${coverImageKey}` };
}
