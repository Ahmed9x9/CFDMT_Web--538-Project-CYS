type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className = "h-8 w-8" }: BrandLogoProps) {
  return (
    <img
      src="/logo_256_transparent.png"
      alt="CFDMT Web"
      className={`${className} object-contain`}
      width="64"
      height="64"
      decoding="async"
    />
  );
}
