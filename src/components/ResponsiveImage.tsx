import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

// Supabase Storage image transform API
// Docs: https://supabase.com/docs/guides/storage/serving/image-transformations
function supabaseTransformUrl(url: string, width: number, quality = 80): string {
  // Only transform Supabase storage URLs
  if (!url.includes("supabase.co/storage/v1/object/public/")) return url;

  const [base, ...rest] = url.split("/storage/v1/object/public/");
  const bucket = rest.join("/storage/v1/object/public/");
  return `${base}/storage/v1/render/image/public/${bucket}?width=${width}&quality=${quality}&resize=contain`;
}

// Generate srcset string for common breakpoints
function buildSrcSet(url: string, quality = 80): string {
  const widths = [320, 640, 960, 1280];
  return widths
    .map((w) => `${supabaseTransformUrl(url, w, quality)} ${w}w`)
    .join(", ");
}

interface ResponsiveImageProps {
  src: string;
  alt: string;
  className?: string;
  aspectRatio?: string;       // e.g. "aspect-square", "aspect-video"
  sizes?: string;             // HTML sizes attribute
  quality?: number;           // 1-100, default 80
  priority?: boolean;         // skip lazy loading for above-the-fold images
  objectFit?: "cover" | "contain" | "fill";
  onLoad?: () => void;
}

export const ResponsiveImage = ({
  src,
  alt,
  className,
  aspectRatio,
  sizes = "(max-width: 640px) 320px, (max-width: 960px) 640px, 960px",
  quality = 80,
  priority = false,
  objectFit = "cover",
  onLoad,
}: ResponsiveImageProps) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Check if image already decoded (e.g. browser cache hit)
  useEffect(() => {
    if (imgRef.current?.complete) {
      setLoaded(true);
    }
  }, []);

  const isSupabaseUrl = src.includes("supabase.co/storage/v1/object/public/");
  const thumbSrc = isSupabaseUrl ? supabaseTransformUrl(src, 20, 30) : src;
  const fullSrcSet = isSupabaseUrl ? buildSrcSet(src, quality) : undefined;
  const objectFitClass = objectFit === "cover" ? "object-cover" : objectFit === "contain" ? "object-contain" : "object-fill";

  if (error) {
    return (
      <div className={cn("bg-muted flex items-center justify-center", aspectRatio, className)}>
        <span className="text-muted-foreground text-xs">Image unavailable</span>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", aspectRatio, className)}>
      {/* Blur-up placeholder — tiny 20px thumbnail shown while full image loads */}
      {!loaded && isSupabaseUrl && (
        <img
          src={thumbSrc}
          aria-hidden
          className={cn(
            "absolute inset-0 w-full h-full blur-xl scale-110 transition-opacity duration-300",
            objectFitClass
          )}
          alt=""
        />
      )}

      <img
        ref={imgRef}
        src={isSupabaseUrl ? supabaseTransformUrl(src, 960, quality) : src}
        srcSet={fullSrcSet}
        sizes={sizes}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={cn(
          "w-full h-full transition-opacity duration-300",
          objectFitClass,
          loaded ? "opacity-100" : "opacity-0"
        )}
        onLoad={() => {
          setLoaded(true);
          onLoad?.();
        }}
        onError={() => setError(true)}
      />
    </div>
  );
};
