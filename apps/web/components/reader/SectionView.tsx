// Semantic rendering of one paper section: a real heading, one <p> per paragraph, and a visible caret
// that mirrors the Braille display (routing keys and clicks both move it). Offsets index into `text`.
import React from "react";

interface Props {
  heading: string;
  level: number;
  text: string;
  caret: number;
  onCaret: (index: number) => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
}

export function SectionView({ heading, level, text, caret, onCaret, headingRef }: Props) {
  const Heading = (level <= 1 ? "h2" : "h3") as "h2" | "h3";
  const paragraphs: { start: number; body: string }[] = [];
  let offset = 0;
  for (const body of text.split("\n\n")) {
    paragraphs.push({ start: offset, body });
    offset += body.length + 2;
  }

  const handleClick = () => {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    const el = node instanceof Element ? node : node?.parentElement;
    const seg = el?.closest<HTMLElement>("[data-offset]");
    if (seg && sel) onCaret(Number(seg.dataset.offset) + sel.anchorOffset);
  };

  return (
    <section aria-labelledby="section-heading" className="section-view">
      <Heading id="section-heading" tabIndex={-1} ref={headingRef}>
        {heading}
      </Heading>
      {paragraphs.map((p) => {
        const inside = caret >= p.start && caret < p.start + p.body.length;
        const at = caret - p.start;
        return (
          <p key={p.start} onClick={handleClick}>
            {inside ? (
              <>
                <span data-offset={p.start}>{p.body.slice(0, at)}</span>
                <mark data-offset={p.start + at} title="Braille caret">
                  {p.body[at]}
                </mark>
                <span data-offset={p.start + at + 1}>{p.body.slice(at + 1)}</span>
              </>
            ) : (
              <span data-offset={p.start}>{p.body}</span>
            )}
          </p>
        );
      })}
    </section>
  );
}
