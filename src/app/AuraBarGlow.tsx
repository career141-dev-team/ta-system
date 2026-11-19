// The owner's aurora glow (Figma 1527:8264, the same shape as 1515:1781): violet, blue and green
// light behind an AURA chat bar. His own SVG at the node's size (820 x 220 at 1920, in rem so it
// scales), centred on the nearest `relative isolate` parent and sunk behind its content.
// Put <AuraBarGlow /> as the first child of the box that holds the bar.

/** Any of the owner's glow SVGs: `inset` is how far the SVG's soft edge spills past the node. */
export function Glow({ src, inset, className }: { src: string; inset: string; className: string }) {
  return (
    <div aria-hidden="true" className={"pointer-events-none absolute left-1/2 -z-10 -translate-x-1/2 " + className}>
      <div className="absolute bg-[length:100%_100%] bg-no-repeat" style={{ inset, backgroundImage: `url(${src})` }} />
    </div>
  );
}

export default function AuraBarGlow({ className = "bottom-0" }: { className?: string }) {
  return <Glow src="/aurora-searching.svg" inset="-63.64% -17.07%" className={"h-[13.75rem] w-[51.25rem] max-w-full " + className} />;
}
