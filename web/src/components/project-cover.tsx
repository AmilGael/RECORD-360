"use client";
import { useEffect, useRef, useState } from "react";
import { coverModel } from "@/lib/project/cover";
import { Folder } from "@/components/icons";

/**
 * A project's cover image, or a designed placeholder (a tinted plane with the
 * folder line icon, no text) when there is no cover or the image fails to
 * load. Decorative: the project name is always written beside it, so `name`
 * is part of the call contract but is not rendered (alt stays empty).
 */
export function ProjectCover({
  coverImageKey,
  variant,
}: {
  coverImageKey: string | null | undefined;
  name: string;
  variant: "card" | "hero";
}) {
  const model = coverModel(coverImageKey);
  // Remember which src failed, so a new cover key gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = model.kind === "image" && model.src !== failedSrc;
  const src = model.kind === "image" ? model.src : null;

  // The server-rendered <img> starts loading before hydration. If it fails
  // first (the eager hero cover usually does), React never sees the error
  // event and onError stays silent: check once the element is ours.
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = imgRef.current;
    if (src && img && img.complete && img.naturalWidth === 0) setFailedSrc(src);
  }, [src]);

  return (
    <div className={`project-cover is-${variant}`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          className="project-cover-img"
          src={model.src}
          alt=""
          loading={variant === "hero" ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailedSrc(model.src)}
        />
      ) : (
        <span className="project-cover-placeholder" aria-hidden="true">
          <Folder size={variant === "hero" ? 40 : 32} />
        </span>
      )}
    </div>
  );
}
