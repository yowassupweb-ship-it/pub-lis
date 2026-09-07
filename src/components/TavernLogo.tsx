import Image from "next/image";

/**
 * Герб заведения. Картинка пиксельная, поэтому масштабируется без сглаживания —
 * иначе на ретине лис расплывается в кашу.
 */
export function TavernLogo({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="Лисья Нора"
      width={size}
      height={size}
      priority
      unoptimized
      className={`shrink-0 select-none [image-rendering:pixelated] ${className}`}
    />
  );
}
