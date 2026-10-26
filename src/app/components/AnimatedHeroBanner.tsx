/**
 * The animated hero banner from /smart-coolers: a looping, muted background
 * video under a dark gradient overlay. Reusable so other surfaces (e.g. the
 * dashboard welcome header) can share the same animated treatment. Render
 * light-colored content as children.
 */
export default function AnimatedHeroBanner({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`relative overflow-hidden bg-black-primary ${className ?? ""}`}>
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black-primary to-gray-950" />
        <video
          className="h-full w-full object-cover opacity-70"
          autoPlay
          muted
          loop
          playsInline
          poster="/videos/smart-coolers-hero-poster.jpg"
        >
          <source src="/videos/smart-coolers-hero.webm" type="video/webm" />
          <source src="/videos/smart-coolers-hero.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-r from-black-primary/90 via-black-primary/60 to-black-primary/30" />
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}
